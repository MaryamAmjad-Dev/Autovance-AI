// Evaluation harness core for the /workflows research prototype.
//
// Implements the reproducible evaluation plan in RESEARCH.md §6:
//   8 frozen scenarios x 3 variants (plain / context / foil) x 3 repetitions
//   = 72 proposals per full run, and the metrics M1–M8.
//
// Design rules (RESEARCH.md §6.3 and the contributor roadmap):
//   - Scenarios and variants are FROZEN here before any run; `scenarioSuiteHash()`
//     binds every run manifest to this exact suite so results cannot silently
//     refer to a different scenario set.
//   - Model-generated output (records with `response`) is kept separate from
//     deterministic computation (everything this module computes).
//   - Nothing here invents results: with zero model responses the report says
//     results are pending/blocked, never "0% success".
//   - M5 (failure-honesty mapping) comes from the test suite, not from a run;
//     M6 comes from the scoresheet; M7 (human raters) is always manual/pending.
//
// No dependencies beyond node builtins and existing lib modules.

import crypto from "crypto";
import {
  normalizeProposal,
  validateProposal,
  diffPlans,
  simulateDryRun
} from "./workflowProposal.js";
import {
  PROTOTYPE_SCORESHEET,
  summariseScoresheet
} from "./explainabilityScoresheet.js";

// -----------------------------------------------------------------------------
// Frozen scenario suite (RESEARCH.md §6.2), with contexts/foils fixed in advance
// -----------------------------------------------------------------------------

export const SCENARIOS = Object.freeze([
  {
    id: "invoice-reply",
    request:
      "When an invoice email arrives, check its details and prepare a reply for human review.",
    context:
      "Invoices arrive from billing@vendor.example; any amount over $500 needs manager approval before payment.",
    foil: "…instead of replying to every invoice immediately without review."
  },
  {
    id: "failed-payment-webhook",
    request:
      "Every failed payment webhook should be retried, then escalated to email.",
    context:
      "The payment provider gives up after two automatic retries; the finance team reads billing-alerts@example.com.",
    foil: "…instead of retrying silently with no escalation to a human."
  },
  {
    id: "crm-contact-sync",
    request: "Sync new CRM contacts into our mailing list every night.",
    context:
      "The CRM is Salesforce and the mailing list is Mailchimp; only contacts with consent=true may be synced.",
    foil: "…instead of syncing hourly in real time."
  },
  {
    id: "contact-form-notify",
    request: "When the contact form is submitted, store it and notify the sales alias.",
    context:
      "Submissions are stored in the CRM leads table; the sales alias is sales@example.com.",
    foil: "…instead of notifying sales immediately on every submission."
  },
  {
    id: "expired-inventory-digest",
    request: "Flag expired inventory rows daily and post a digest to our team chat.",
    context:
      "The warehouse closes at 18:00 UTC; the digest is posted to the #ops Slack channel.",
    foil: "…instead of one message per expired row."
  },
  {
    id: "signup-welcome",
    request: "On signup, send a welcome email and create an onboarding task.",
    context: "Onboarding tasks live in Jira; the welcome email must go out within 5 minutes.",
    foil: "…instead of a single combined welcome email."
  },
  {
    id: "weekly-report-backup",
    request: "Back up exported reports weekly to remote storage.",
    context: "Exports are CSV files in /reports; remote storage is S3 with 30-day retention.",
    foil: "…instead of keeping them only locally."
  },
  {
    id: "ticket-escalation",
    request: "Escalate support tickets untouched for 24 hours.",
    context:
      "Ticket volume averages 120/day; the on-call rotation is published weekly in PagerDuty.",
    foil: "…instead of a 12-hour reminder."
  }
]);

export const VARIANTS = Object.freeze(["plain", "context", "foil"]);

/** Frozen input for one planned proposal request. */
function inputFor(scenario, variant) {
  const input = { request: scenario.request };
  if (variant === "context") input.context = scenario.context;
  if (variant === "foil") input.foil = scenario.foil;
  return input;
}

/**
 * The full frozen run plan: scenarios x variants x repetitions.
 * Deterministic order so two harness runs plan identical requests.
 */
export function runPlan({ reps = 3 } = {}) {
  const plan = [];
  for (const scenario of SCENARIOS) {
    for (const variant of VARIANTS) {
      for (let rep = 1; rep <= reps; rep += 1) {
        plan.push({
          scenarioId: scenario.id,
          variant,
          repetition: rep,
          input: inputFor(scenario, variant)
        });
      }
    }
  }
  return plan;
}

/** Stable sha256 over the frozen suite; recorded in every run manifest. */
export function scenarioSuiteHash() {
  const canonical = JSON.stringify({
    scenarios: SCENARIOS,
    variants: VARIANTS
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

// -----------------------------------------------------------------------------
// Record classification
//
// A record is one planned request as actually executed:
//   { ...plannedInput, httpStatus, latencyMs, timestamp, response?, rawBody?, error? }
//
//   responded  – the endpoint produced a proposal (extractJson succeeded)
//   parse_fail – the endpoint reached the model but the output was unusable
//   unavailable – never reached the model (not configured, 429, 5xx, network)
// -----------------------------------------------------------------------------

export function classifyRecord(record) {
  if (record && record.response && record.response.ok && record.response.proposal) {
    return "responded";
  }
  const code = record && record.response && record.response.error;
  if (code === "model_output_invalid" || code === "model_output_empty") {
    return "parse_fail";
  }
  return "unavailable";
}

// -----------------------------------------------------------------------------
// Metrics (pure functions over stored records — deterministic, no model involved)
// -----------------------------------------------------------------------------

/** M1: structural validity rate over responded runs. */
export function computeM1(records) {
  const responded = records.filter((r) => classifyRecord(r) === "responded");
  if (responded.length === 0) return { rate: null, valid: 0, total: 0 };
  let valid = 0;
  for (const r of responded) {
    const proposal = normalizeProposal(r.response.proposal);
    if (validateProposal(proposal).errors.length === 0) valid += 1;
  }
  return { rate: valid / responded.length, valid, total: responded.length };
}

/** M2: parse robustness — responses where server-side extraction succeeded,
 *  over all requests that reached the provider (responded + parse_fail). */
export function computeM2(records) {
  const reached = records.filter((r) => {
    const c = classifyRecord(r);
    return c === "responded" || c === "parse_fail";
  });
  if (reached.length === 0) return { rate: null, parsed: 0, total: 0 };
  const parsed = reached.filter((r) => classifyRecord(r) === "responded").length;
  return { rate: parsed / reached.length, parsed, total: reached.length };
}

/**
 * M3: determinism of the computed parts — re-running diffPlans +
 * simulateDryRun on one stored proposal must serialize identically.
 * Returns { identical, iterations } (target: identical === iterations).
 */
export function computeM3(proposal, iterations = 100) {
  const normalized = normalizeProposal(proposal);
  const baseline = JSON.stringify({
    diff: diffPlans(normalized.plan, normalized.alternative ? normalized.alternative.plan : []),
    dryRun: simulateDryRun(normalized)
  });
  let identical = 0;
  for (let i = 0; i < iterations; i += 1) {
    const again = JSON.stringify({
      diff: diffPlans(normalized.plan, normalized.alternative ? normalized.alternative.plan : []),
      dryRun: simulateDryRun(normalized)
    });
    if (again === baseline) identical += 1;
  }
  return { identical, iterations };
}

/**
 * M4-server: foil compliance computed from server fields — for responded
 * foil-variant runs, was the user's foil recorded as the alternative source.
 * The ≥80% manual "clearly about my foil" judgment (M4) stays pending.
 */
export function computeM4(records) {
  const foilRuns = records.filter(
    (r) => r.variant === "foil" && classifyRecord(r) === "responded"
  );
  if (foilRuns.length === 0) return { rate: null, compliant: 0, total: 0 };
  const compliant = foilRuns.filter(
    (r) =>
      r.response.meta &&
      r.response.meta.foil_source === "user" &&
      r.response.proposal &&
      r.response.proposal.alternative
  ).length;
  return { rate: compliant / foilRuns.length, compliant, total: foilRuns.length };
}

/** M8: operational cost — p50/p95 latency over responded runs + counts. */
export function computeM8(records) {
  const latencies = records
    .filter((r) => classifyRecord(r) === "responded" && Number.isFinite(r.latencyMs))
    .map((r) => r.latencyMs)
    .sort((a, b) => a - b);
  const pct = (p) => {
    if (latencies.length === 0) return null;
    const idx = Math.min(latencies.length - 1, Math.ceil((p / 100) * latencies.length) - 1);
    return latencies[Math.max(0, idx)];
  };
  return {
    p50: pct(50),
    p95: pct(95),
    rateLimited: records.filter((r) => r.httpStatus === 429).length,
    attempted: records.length
  };
}

/** M6: explainability coverage counts from the (static) scoresheet. */
export function computeM6() {
  return summariseScoresheet(PROTOTYPE_SCORESHEET);
}

/** Summary over all records with honest pending/blocked handling. */
export function summariseRun(records) {
  const byClass = { responded: 0, parse_fail: 0, unavailable: 0 };
  for (const r of records) byClass[classifyRecord(r)] += 1;
  const m1 = computeM1(records);
  const m2 = computeM2(records);
  const m4 = computeM4(records);
  const m8 = computeM8(records);
  return {
    counts: byClass,
    m1,
    m2,
    m4,
    m8,
    blocked: byClass.responded === 0
  };
}

// -----------------------------------------------------------------------------
// Report rendering (pure) — always states pending status explicitly
// -----------------------------------------------------------------------------

function pct(x) {
  return x === null ? "pending" : `${(x * 100).toFixed(1)}%`;
}

function ms(x) {
  return x === null ? "pending" : `${x} ms`;
}

/**
 * Markdown evaluation report. `manifest` carries run metadata (suite hash,
 * model slug, timestamps, repetitions); `records` the stored raw runs.
 * When nothing responded, every model-dependent metric is reported as
 * pending/blocked — never as a fabricated number.
 */
export function formatReport(manifest, records) {
  const s = summariseRun(records);
  const m6 = computeM6();
  const lines = [];

  lines.push("# Evaluation run report");
  lines.push("");
  lines.push(`- Run id: \`${manifest.runId}\``);
  lines.push(`- Started: ${manifest.startedAt}`);
  lines.push(`- Finished: ${manifest.finishedAt || "n/a"}`);
  lines.push(`- Scenario suite hash: \`${manifest.suiteHash}\``);
  lines.push(`- Model slug: \`${manifest.model || "unknown"}\``);
  lines.push(`- Repetitions per variant: ${manifest.reps}`);
  lines.push(
    `- Planned requests: ${manifest.planned}; attempted: ${s.counts.responded + s.counts.parse_fail + s.counts.unavailable}`
  );
  lines.push(
    `- Outcomes: responded ${s.counts.responded}, parse-failure ${s.counts.parse_fail}, unavailable ${s.counts.unavailable}`
  );
  lines.push("");

  if (s.blocked) {
    lines.push(
      "> **RESULTS PENDING / BLOCKED.** No proposal was produced by the model " +
        "during this run (provider not configured, rate limited, or failing). " +
        "The metrics below are reported as *pending*, not as zero, and no " +
        "result may be inferred from this run."
    );
    lines.push("");
  }

  lines.push("## Metrics");
  lines.push("");
  lines.push("| # | Metric | Result |");
  lines.push("|---|--------|--------|");
  lines.push(`| M1 | Structural validity rate | ${pct(s.m1.rate)} (${s.m1.valid}/${s.m1.total}) |`);
  lines.push(`| M2 | Parse robustness | ${pct(s.m2.rate)} (${s.m2.parsed}/${s.m2.total}) |`);
  lines.push(
    `| M3 | Determinism of computed parts | pending (compute via \`score\` on a responded run; target 100/100) |`
  );
  lines.push(
    `| M4 | Foil compliance (server-side) | ${pct(s.m4.rate)} (${s.m4.compliant}/${s.m4.total}); manual judgment pending |`
  );
  lines.push("| M5 | Failure honesty | covered by test suite (`npm test`), not by this run |");
  lines.push(
    `| M6 | Explainability coverage | supported ${m6.supported}, partial ${m6.partial}, unsupported ${m6.unsupported}, n/a ${m6.not_applicable} |`
  );
  lines.push("| M7 | Rationale groundedness (manual) | pending — requires two independent raters |");
  lines.push(
    `| M8 | Operational cost | p50 ${ms(s.m8.p50)}, p95 ${ms(s.m8.p95)}, HTTP 429: ${s.m8.rateLimited} |`
  );
  lines.push("");
  lines.push("## Limitations");
  lines.push("");
  for (const item of [
    "Model-generated rationales are plausible text, not verified accounts of computation.",
    "M4 manual judgment and M7 require human raters and are always reported separately.",
    "Unavailable requests (configuration, 429, upstream errors) are counted and listed, never dropped silently.",
    "This harness reports measurements only; it does not certify explainability."
  ]) {
    lines.push(`- ${item}`);
  }
  lines.push("");

  return lines.join("\n");
}
