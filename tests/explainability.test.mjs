// Tests for the explainability additions: the user-provided foil sanitizer
// and the honest limitations catalogue returned with every proposal.
// Pure functions only — zero network I/O. Run with: npm test
import assert from "node:assert";
import {
  sanitizeFoil,
  MAX_FOIL_CHARS,
  EXPLANATION_LIMITATIONS,
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

test("sanitizeFoil: trims valid hints and keeps inner text", () => {
  assert.strictEqual(sanitizeFoil("  a daily digest instead of realtime  "), "a daily digest instead of realtime");
  assert.strictEqual(sanitizeFoil("digest"), "digest");
});

test("sanitizeFoil: non-strings and empty input become \"\"", () => {
  assert.strictEqual(sanitizeFoil(""), "");
  assert.strictEqual(sanitizeFoil(null), "");
  assert.strictEqual(sanitizeFoil(undefined), "");
  assert.strictEqual(sanitizeFoil(123), "");
  assert.strictEqual(sanitizeFoil({ foil: "x" }), "");
  assert.strictEqual(sanitizeFoil(["x"]), "");
});

test("sanitizeFoil: caps length at MAX_FOIL_CHARS", () => {
  const out = sanitizeFoil("x".repeat(MAX_FOIL_CHARS + 200));
  assert.strictEqual(out.length, MAX_FOIL_CHARS);
  // boundary: input at the limit passes through untouched
  assert.strictEqual(sanitizeFoil("y".repeat(MAX_FOIL_CHARS)).length, MAX_FOIL_CHARS);
});

test("EXPLANATION_LIMITATIONS: non-empty list of concise strings", () => {
  assert.ok(Array.isArray(EXPLANATION_LIMITATIONS));
  assert.ok(EXPLANATION_LIMITATIONS.length >= 3, "expected at least 3 limitations");
  for (const item of EXPLANATION_LIMITATIONS) {
    assert.strictEqual(typeof item, "string");
    assert.ok(item.trim().length > 0, "empty limitation entry");
    assert.ok(item.length <= 300, `limitation too long (${item.length} chars): ${item.slice(0, 60)}…`);
  }
});

test("EXPLANATION_LIMITATIONS: separates model text from computed parts, no overclaim", () => {
  const text = EXPLANATION_LIMITATIONS.join(" ");
  // must honestly name the veracity status of model-generated content
  assert.ok(text.includes("model-generated"), "should mention model-generated content");
  assert.ok(text.includes("unverified"), "should state content is unverified");
  assert.ok(text.includes("faithful"), "should address the faithfulness question");
  assert.ok(text.includes("dry run"), "should describe what the dry run actually is");
  // must NOT overclaim: no guarantees, formal verification, or correctness claims
  assert.ok(!/\bguaranteed\b/i.test(text), "must not claim guarantees");
  assert.ok(!/\bformally verified\b/i.test(text), "must not claim formal verification");
  assert.ok(!/\bprovably correct\b/i.test(text), "must not claim provable correctness");
});

test("EXPLANATION_LIMITATIONS: entries are unique", () => {
  const unique = new Set(EXPLANATION_LIMITATIONS);
  assert.strictEqual(unique.size, EXPLANATION_LIMITATIONS.length, "duplicate limitation entries");
});

console.log(`explainability: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
