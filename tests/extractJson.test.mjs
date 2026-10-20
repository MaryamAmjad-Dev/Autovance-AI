// Unit tests for the tolerant model-output JSON extractor used by
// /api/propose (extracted into lib/workflowProposal.js so it can be tested
// without any network access). Run with: npm test
import assert from "node:assert";
import { extractJson } from "../lib/workflowProposal.js";

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

test("valid: plain JSON object parses directly", () => {
  const out = extractJson('{"goal":"g","plan":[]}');
  assert.ok(out && typeof out === "object");
  assert.strictEqual(out.goal, "g");
});

test("fenced: ```json code fence is unwrapped", () => {
  const out = extractJson('```json\n{"goal":"g","plan":[]}\n```');
  assert.ok(out && out.goal === "g");
});

test("fenced: fence without a language tag is also unwrapped", () => {
  const out = extractJson('```\n{"goal":"g"}\n```');
  assert.ok(out && out.goal === "g");
});

test("prose-wrapped: object extracted from surrounding text", () => {
  const out = extractJson(
    'Sure! Here is the proposal you asked for:\n{"goal":"g","plan":[]}\nLet me know if you need anything else.'
  );
  assert.ok(out && out.goal === "g");
});

test("malformed: truncated JSON returns null", () => {
  assert.strictEqual(extractJson('{"goal": "x", "plan": ['), null);
});

test("rejected: non-object JSON (string / number / array) returns null", () => {
  assert.strictEqual(extractJson('"just a string"'), null);
  assert.strictEqual(extractJson("42"), null);
  assert.strictEqual(extractJson('[{"goal":"g"}]'), null);
});

test("rejected: empty, null, and non-string inputs return null", () => {
  assert.strictEqual(extractJson(""), null);
  assert.strictEqual(extractJson(null), null);
  assert.strictEqual(extractJson(undefined), null);
  assert.strictEqual(extractJson(12345), null);
});

test("malformed: prose with no JSON object returns null", () => {
  assert.strictEqual(extractJson("I cannot produce a proposal right now."), null);
});

console.log(`extractJson: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
