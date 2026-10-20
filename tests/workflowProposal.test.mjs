// Unit tests for lib/workflowProposal.js — pure functions, zero network I/O.
// Run with: npm test  (plain Node, no dependencies)
import assert from "node:assert";
import {
  normalizeProposal,
  validateProposal,
  diffPlans,
  simulateDryRun,
} from "../lib/workflowProposal.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("PASS", name);
  } catch (e) {
    failed++;
    console.log("FAIL", name, "->", e.message);
  }
}

const validRaw = {
  goal: "Handle invoice emails",
  beliefs: [
    { fact: "Invoices arrive as emails", source: "user" },
    { fact: "Mailbox supports filtering", source: "assumed" },
    "plain string belief",
    { fact: "   " },
  ],
  plan: [
    { id: "s1", type: "trigger", label: "New email", rationale: "Request is email-triggered." },
    { id: "s2", type: "condition", label: "Looks like invoice", rationale: "Avoid false positives." },
    { type: "Review", label: "Human approves", rationale: "Request requires review." },
  ],
  outcome: "Draft reply held for approval.",
  assumptions: ["PDF text is readable"],
  risks: ["Extraction may fail"],
  missing_information: ["Provider"],
  alternative: {
    label: "Batched digest",
    plan: [
      { type: "trigger", label: "Hourly digest", rationale: "Batching lowers interruptions." },
      { type: "action", label: "Process batch", rationale: "Process accumulated mail." },
    ],
    tradeoffs: "Delay vs interruptions.",
  },
};

test("normalize: shapes, id fallback, type lowercasing, belief filtering", () => {
  const p = normalizeProposal(validRaw);
  assert.strictEqual(p.beliefs.length, 3); // empty fact dropped
  assert.strictEqual(p.beliefs[0].source, "user");
  assert.strictEqual(p.beliefs[1].source, "assumed");
  assert.strictEqual(p.beliefs[2].source, "assumed"); // plain string -> assumed
  assert.strictEqual(p.plan[2].id, "s3"); // id generated
  assert.strictEqual(p.plan[2].type, "review"); // "Review" lowercased
  assert.strictEqual(p.alternative.plan.length, 2);
});

test("normalize: garbage input never throws", () => {
  assert.strictEqual(normalizeProposal(null).goal, "");
  assert.strictEqual(normalizeProposal({ plan: "not-an-array" }).plan.length, 0);
  assert.strictEqual(normalizeProposal(42).alternative, null);
});

test("validate: fully valid proposal -> no errors", () => {
  const v = validateProposal(normalizeProposal(validRaw));
  assert.deepStrictEqual(v.errors, []);
  assert.deepStrictEqual(v.warnings, []);
});

test("validate: catches each structural defect", () => {
  const v1 = validateProposal(normalizeProposal({ plan: [
    { type: "trigger", label: "a", rationale: "r" },
    { type: "action", label: "b", rationale: "r" },
  ]}));
  assert.ok(v1.errors.some((e) => e.includes("missing a goal")));

  const v2 = validateProposal(normalizeProposal({ goal: "g", plan: [
    { type: "trigger", label: "a", rationale: "r" },
  ]}));
  assert.ok(v2.errors.some((e) => e.includes("at least two steps")));
  assert.ok(v2.errors.some((e) => e.includes("missing the alternative")));

  const v3 = validateProposal(normalizeProposal({ goal: "g", plan: [
    { type: "action", label: "first", rationale: "r" },
    { type: "bogus", label: "", rationale: "" },
  ], alternative: { plan: [{ type: "trigger", label: "x", rationale: "r" }] } }));
  assert.ok(v3.errors.some((e) => e.includes("begin with a trigger")));
  assert.ok(v3.errors.some((e) => e.includes('disallowed type "bogus"')));
  assert.ok(v3.errors.some((e) => e.includes("missing a label")));
  assert.ok(v3.warnings.some((w) => w.includes("No assumptions")));
  assert.ok(v3.warnings.some((w) => w.includes("No risks")));
});

test("diffPlans: computed differences and identity detection", () => {
  const p = normalizeProposal(validRaw);
  const d = diffPlans(p.plan, p.alternative.plan);
  assert.strictEqual(d.differs, true);
  assert.strictEqual(d.only_in_primary.length, 3);
  assert.strictEqual(d.only_in_alternative.length, 2);
  assert.strictEqual(d.shared, 0);

  const same = diffPlans(p.plan, p.plan);
  assert.strictEqual(same.differs, false);
  assert.strictEqual(same.shared, 3);
});

test("simulateDryRun: zero side effects, per-type phrasing, bad type handled", () => {
  const p = normalizeProposal(validRaw);
  const dry = simulateDryRun(p);
  assert.strictEqual(dry.external_actions, 0);
  assert.strictEqual(dry.steps.length, 3);
  assert.ok(dry.steps[2].would.includes("human decision")); // review step
  const bad = simulateDryRun({ plan: [{ id: "x", type: "weird", label: "L", rationale: "" }] });
  assert.ok(bad.steps[0].would.includes("unrecognised"));
  assert.strictEqual(bad.external_actions, 0);
});

console.log(`workflowProposal: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
