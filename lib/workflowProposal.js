/**
 * Deterministic workflow-proposal utilities.
 *
 * Every function here is a pure function over plain data: no I/O, no model
 * calls. This is deliberate — the deterministic parts of the explainability
 * pipeline (validation, contrastive differences, dry-run) must be verifiable
 * and testable independently of the LLM, which is the veracity concern
 * described in "A Scoresheet for Explainable AI" (Winikoff et al., 2025).
 */

const STEP_TYPES = ["trigger", "condition", "action", "review"];

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStep(rawStep, index) {
  const step = rawStep && typeof rawStep === "object" ? rawStep : {};
  return {
    id: asText(step.id) || `s${index + 1}`,
    // NOTE: invalid types are intentionally preserved (lower-cased) so the
    // validator can flag them instead of silently coercing them.
    type: asText(step.type).toLowerCase(),
    label: asText(step.label || step.name || step.title),
    rationale: asText(step.rationale || step.reason || step.why),
  };
}

/**
 * Coerce arbitrary (model-generated) JSON into the canonical proposal shape.
 * Never throws; missing pieces become empty values that the validator reports.
 */
export function normalizeProposal(raw) {
  const src = raw && typeof raw === "object" ? raw : {};

  const beliefs = asArray(src.beliefs || src.context)
    .map((entry) => {
      if (typeof entry === "string") {
        return { fact: asText(entry), source: "assumed" };
      }
      if (entry && typeof entry === "object") {
        return {
          fact: asText(entry.fact || entry.content || entry.text),
          source: asText(entry.source).toLowerCase() === "user" ? "user" : "assumed",
        };
      }
      return { fact: "", source: "assumed" };
    })
    .filter((belief) => belief.fact !== "");

  const alternativeRaw =
    src.alternative && typeof src.alternative === "object" ? src.alternative : null;

  return {
    goal: asText(src.goal),
    beliefs,
    plan: asArray(src.plan || src.steps).map(normalizeStep),
    outcome: asText(src.outcome || src.expected_outcome),
    assumptions: asArray(src.assumptions).map(asText).filter(Boolean),
    risks: asArray(src.risks).map(asText).filter(Boolean),
    missing_information: asArray(src.missing_information || src.missingInformation)
      .map(asText)
      .filter(Boolean),
    alternative: alternativeRaw
      ? {
          label: asText(alternativeRaw.label) || "Alternative plan",
          plan: asArray(alternativeRaw.plan || alternativeRaw.steps).map(normalizeStep),
          tradeoffs: asText(
            alternativeRaw.tradeoffs || alternativeRaw.tradeoffs_text || alternativeRaw.description
          ),
        }
      : null,
  };
}

function checkSteps(steps, label, errors, { requireTriggerFirst }) {
  steps.forEach((step, i) => {
    if (!STEP_TYPES.includes(step.type)) {
      errors.push(
        `${label} step ${i + 1} has disallowed type "${step.type}" (allowed: ${STEP_TYPES.join(", ")}).`
      );
    }
    if (!step.label) {
      errors.push(`${label} step ${i + 1} is missing a label.`);
    }
  });
  if (requireTriggerFirst && steps.length > 0 && steps[0].type !== "trigger") {
    errors.push(`${label} must begin with a trigger step.`);
  }
}

/**
 * Deterministic structural validation of a normalized proposal.
 * Returns { errors, warnings } — `valid` is derived by the caller/API.
 */
export function validateProposal(proposal) {
  const errors = [];
  const warnings = [];

  if (!proposal.goal) {
    errors.push("The proposal is missing a goal.");
  }
  if (proposal.plan.length < 2) {
    errors.push("The plan must contain at least two steps.");
  }
  checkSteps(proposal.plan, "Plan", errors, { requireTriggerFirst: true });
  proposal.plan.forEach((step, i) => {
    if (step.type !== "trigger" && !step.rationale) {
      warnings.push(`Step ${i + 1} ("${step.label || "unnamed"}") has no rationale.`);
    }
  });

  if (!proposal.outcome) {
    warnings.push("The proposal is missing an intended outcome.");
  }
  if (proposal.beliefs.length === 0) {
    warnings.push("No context or beliefs were extracted from the request.");
  }
  if (proposal.assumptions.length === 0) {
    warnings.push("No assumptions were declared, so the proposal may be overconfident.");
  }
  if (proposal.risks.length === 0) {
    warnings.push("No risks were identified.");
  }

  if (!proposal.alternative) {
    errors.push("The proposal is missing the alternative plan required for contrastive comparison.");
  } else {
    if (proposal.alternative.plan.length < 1) {
      errors.push("The alternative plan has no steps.");
    }
    checkSteps(proposal.alternative.plan, "Alternative plan", errors, {
      requireTriggerFirst: true,
    });
  }

  return { errors, warnings };
}

function normalizeLabel(label) {
  return asText(label).toLowerCase().replace(/\s+/g, " ");
}

/**
 * Deterministic structural comparison between the primary plan (the "fact")
 * and the alternative plan (the "foil"). The differences shown to the user
 * are computed here from the actual steps — they are never model claims.
 */
export function diffPlans(primaryPlan, alternativePlan) {
  const primary = asArray(primaryPlan);
  const alternative = asArray(alternativePlan);

  const primaryLabels = primary.map((s) => normalizeLabel(s.label)).filter(Boolean);
  const alternativeLabels = alternative.map((s) => normalizeLabel(s.label)).filter(Boolean);
  const primarySet = new Set(primaryLabels);
  const alternativeSet = new Set(alternativeLabels);

  const only_in_primary = primary
    .filter((s) => !alternativeSet.has(normalizeLabel(s.label)))
    .map((s) => s.label);
  const only_in_alternative = alternative
    .filter((s) => !primarySet.has(normalizeLabel(s.label)))
    .map((s) => s.label);
  const shared = primaryLabels.filter((label) => alternativeSet.has(label)).length;

  const sameSequence =
    primaryLabels.length === alternativeLabels.length &&
    primaryLabels.every((label, i) => label === alternativeLabels[i]);

  return { only_in_primary, only_in_alternative, shared, differs: !sameSequence };
}

/**
 * Dry-run simulator: describes what each step *would* do while guaranteeing
 * zero external effects. No email is sent, no webhook is called, and no
 * external system is modified — by construction, this function performs no
 * I/O of any kind.
 */
export function simulateDryRun(proposal) {
  const steps = asArray(proposal.plan).map((step) => {
    let would;
    switch (step.type) {
      case "trigger":
        would = `Listen for "${step.label}". Nothing is triggered or sent; this step only listens.`;
        break;
      case "condition":
        would = `Evaluate "${step.label}" using the information already provided. No external call is made.`;
        break;
      case "review":
        would = `Pause at "${step.label}" and wait for a human decision. Nothing proceeds without confirmation.`;
        break;
      case "action":
        would = `Preview "${step.label}" without side effects: no email is sent, no webhook is called, and no external system is modified.`;
        break;
      default:
        would = `Step "${step.label}" has an unrecognised type and cannot be simulated.`;
    }
    return { id: step.id, type: step.type, would };
  });

  return {
    external_actions: 0,
    steps,
    note: "Simulation only: this dry run never sends emails, calls webhooks, or modifies external systems.",
  };
}

/**
 * Tolerantly extract a JSON object from raw model output.
 * Candidates tried in order: the raw text, the first ```json fence, and the
 * substring from the first "{" to the last "}". A candidate that parses but
 * is not a plain object (an array or primitive) ends the search and returns
 * null: that parse IS the model's intended answer, and it violates the
 * proposal contract. Fallbacks only dig further when a candidate is not
 * valid JSON at all (fenced or prose-wrapped output).
 *
 * Lives here (not in the API route) so it is unit-testable without any
 * network access — the route imports it from this module.
 */
export function extractJson(content) {
  if (!content || typeof content !== "string") return null;
  const candidates = [content];
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1]);
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(content.slice(start, end + 1));
  for (const candidate of candidates) {
    let value;
    try {
      value = JSON.parse(candidate.trim());
    } catch {
      continue; // not JSON at all — try the next candidate
    }
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  }
  return null;
}

/** Maximum length of the optional user-provided foil (comparison) hint. */
export const MAX_FOIL_CHARS = 500;

/**
 * Sanitize the optional user-provided foil: the alternative the user wants
 * the primary plan compared against (the "foil" of contrastive explanation,
 * cf. Winikoff et al.). A foil is a short hint by design, so longer input is
 * truncated the same way `context` is. Never throws; non-strings become "".
 */
export function sanitizeFoil(value, maxChars = MAX_FOIL_CHARS) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxChars);
}

/**
 * Honest scope limits shown to the user with every proposal. Kept here (not
 * hardcoded in the UI) so they are versioned, unit-tested, and travel with
 * the API response. Wording deliberately avoids any claim of faithfulness,
 * verification, or correctness — the veracity concern of the scoresheet paper.
 */
export const EXPLANATION_LIMITATIONS = [
  "Beliefs, rationales, assumptions, risks and the alternative are model-generated text: they are plausible-sounding but unverified, and they are not a faithful account of any underlying computation.",
  "Structural validation checks the proposal's shape (steps, types, ordering, required fields). It does not verify that the automation is correct, safe, or suitable for your situation.",
  "The dry run is a written description built from the step list, not an execution: your real systems were never contacted.",
  "Missing information lists what the request did not supply; the model cannot verify details it was never given.",
];
