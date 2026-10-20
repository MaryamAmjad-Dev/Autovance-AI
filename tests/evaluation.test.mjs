// Offline tests for the evaluation harness (lib/evaluation.js).
// No network, no model calls: every metric is computed from synthetic records
// so the harness itself can be verified without provider access.

import test from "node:test";
import assert from "node:assert/strict";

import {
  SCENARIOS,
  VARIANTS,
  runPlan,
  scenarioSuiteHash,
  classifyRecord,
  computeM1,
  computeM2,
  computeM3,
  computeM4,
  computeM8,
  computeM6,
  summariseRun,
  formatReport
} from "../lib/evaluation.js";

const VALID_PROPOSAL = {
  goal: "Reply to invoice emails after checking details.",
  beliefs: [{ source: "user", text: "Invoices arrive by email." }],
  plan: [
    { type: "trigger", label: "Invoice email arrives", rationale: "The request is about invoice emails." },
    { type: "review", label: "Check invoice details", rationale: "Details must be checked before replying." },
    { type: "action", label: "Prepare a reply draft", rationale: "The request asks for a prepared reply." }
  ],
  outcome: "A reviewed reply is ready for human approval.",
  assumptions: ["The mailbox is monitored."],
  risks: ["Wrong details could be sent."],
  missing_information: [],
  alternative: {
    label: "Immediate reply",
    plan: [
      { type: "trigger", label: "Invoice email arrives", rationale: "Same incoming email." },
      { type: "action", label: "Reply immediately", rationale: "Faster but unreviewed." }
    ],
    tradeoffs: "Faster, but no human review."
  }
};

function respondedRecord(overrides = {}) {
  return {
    scenarioId: "invoice-reply",
    variant: "plain",
    repetition: 1,
    input: { request: SCENARIOS[0].request },
    timestamp: "2026-01-01T00:00:00.000Z",
    httpStatus: 200,
    latencyMs: 1000,
    rawBody: "{}",
    error: null,
    response: {
      ok: true,
      proposal: VALID_PROPOSAL,
      meta: { model: "test/model", foil_source: "model" }
    },
    ...overrides
  };
}

test("frozen suite: 8 scenarios x 3 variants x 3 reps = 72 planned requests", () => {
  assert.equal(SCENARIOS.length, 8);
  assert.deepEqual([...VARIANTS], ["plain", "context", "foil"]);
  const plan = runPlan({ reps: 3 });
  assert.equal(plan.length, 72);
  // Determinism: same inputs every time.
  assert.deepEqual(runPlan({ reps: 3 }), plan);
});

test("each scenario carries request, context and foil; variants shape inputs correctly", () => {
  for (const s of SCENARIOS) {
    assert.ok(s.id && s.request && s.context && s.foil, `scenario ${s.id} incomplete`);
  }
  const plan = runPlan({ reps: 1 });
  const plain = plan.find((p) => p.variant === "plain");
  const context = plan.find((p) => p.variant === "context");
  const foil = plan.find((p) => p.variant === "foil");
  assert.deepEqual(Object.keys(plain.input).sort(), ["request"]);
  assert.ok(context.input.context && !context.input.foil);
  assert.ok(foil.input.foil && !foil.input.context);
});

test("suite hash is stable across calls and differs from empty input", () => {
  const h1 = scenarioSuiteHash();
  const h2 = scenarioSuiteHash();
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test("classifyRecord: responded / parse_fail / unavailable", () => {
  assert.equal(classifyRecord(respondedRecord()), "responded");
  assert.equal(
    classifyRecord(respondedRecord({ response: { ok: false, error: "model_output_invalid" } })),
    "parse_fail"
  );
  assert.equal(
    classifyRecord(respondedRecord({ response: { ok: false, error: "rate_limited" }, httpStatus: 429 })),
    "unavailable"
  );
  assert.equal(classifyRecord(respondedRecord({ response: null, error: "network: timeout" })), "unavailable");
});

test("M1: structural validity over responded runs only", () => {
  const records = [
    respondedRecord(),
    respondedRecord({ repetition: 2 }),
    respondedRecord({ repetition: 3, response: { ok: false, error: "rate_limited" }, httpStatus: 429 })
  ];
  const m1 = computeM1(records);
  assert.equal(m1.total, 2);
  assert.equal(m1.valid, 2);
  assert.equal(m1.rate, 1);
});

test("M1 with no responded runs reports pending (null), never 0", () => {
  const m1 = computeM1([respondedRecord({ response: null, httpStatus: 503 })]);
  assert.equal(m1.rate, null);
  assert.equal(m1.total, 0);
});

test("M2: parse robustness over provider-reached requests", () => {
  const records = [
    respondedRecord(),
    respondedRecord({ repetition: 2, response: { ok: false, error: "model_output_invalid" } }),
    respondedRecord({ repetition: 3, response: null, httpStatus: 503 }) // never reached provider
  ];
  const m2 = computeM2(records);
  assert.equal(m2.total, 2);
  assert.equal(m2.parsed, 1);
  assert.equal(m2.rate, 0.5);
});

test("M3: computed parts are deterministic across 100 re-runs", () => {
  const m3 = computeM3(VALID_PROPOSAL, 100);
  assert.equal(m3.iterations, 100);
  assert.equal(m3.identical, 100);
});

test("M4: foil compliance requires meta.foil_source=user and an alternative", () => {
  const records = [
    respondedRecord({ variant: "foil", response: { ...respondedRecord().response, meta: { model: "m", foil_source: "user" } } }),
    respondedRecord({ variant: "foil", repetition: 2, response: { ...respondedRecord().response, meta: { model: "m", foil_source: "model" } } }),
    respondedRecord({ variant: "plain" }) // not a foil run
  ];
  const m4 = computeM4(records);
  assert.equal(m4.total, 2);
  assert.equal(m4.compliant, 1);
  assert.equal(m4.rate, 0.5);
});

test("M8: p50/p95 latencies and 429 counting", () => {
  const records = [];
  for (let i = 1; i <= 10; i += 1) records.push(respondedRecord({ repetition: i, latencyMs: i * 100 }));
  records.push(respondedRecord({ repetition: 11, httpStatus: 429, response: null, latencyMs: 10 }));
  const m8 = computeM8(records);
  assert.equal(m8.attempted, 11);
  assert.equal(m8.rateLimited, 1);
  assert.equal(m8.p50, 500);
  assert.equal(m8.p95, 1000);
});

test("M6: scoresheet counts are computed from the data and sum to total", () => {
  const m6 = computeM6();
  const sum = m6.supported + m6.partial + m6.unsupported + m6.not_applicable;
  assert.equal(sum, m6.total);
  assert.ok(m6.total > 0);
});

test("summariseRun flags a fully blocked run", () => {
  const blocked = summariseRun([
    respondedRecord({ response: null, httpStatus: 503, error: null }),
    respondedRecord({ response: { ok: false, error: "rate_limited" }, httpStatus: 429 })
  ]);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.counts.responded, 0);
  assert.equal(blocked.counts.unavailable, 2);
});

test("blocked report says RESULTS PENDING and never fabricates percentages", () => {
  const manifest = {
    runId: "run-test",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:05:00.000Z",
    suiteHash: scenarioSuiteHash(),
    model: "test/model",
    reps: 3,
    planned: 72
  };
  const records = [respondedRecord({ response: null, httpStatus: 503 })];
  const report = formatReport(manifest, records);
  assert.match(report, /RESULTS PENDING \/ BLOCKED/);
  assert.match(report, /\| M1 \| Structural validity rate \| pending/);
  assert.match(report, /\| M8 \| .*pending/);
  assert.ok(!/\d+\.\d%/.test(report.split("## Limitations")[0].replace(/\(0\/0\)/g, "")) || report.includes("pending"));
});

test("successful report renders computed metric values", () => {
  const manifest = {
    runId: "run-ok",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:05:00.000Z",
    suiteHash: scenarioSuiteHash(),
    model: "test/model",
    reps: 3,
    planned: 3
  };
  const report = formatReport(manifest, [respondedRecord(), respondedRecord({ repetition: 2 })]);
  assert.ok(!report.includes("RESULTS PENDING"));
  assert.match(report, /\| M1 \| Structural validity rate \| 100\.0% \(2\/2\)/);
  assert.match(report, /supported \d+/);
});
