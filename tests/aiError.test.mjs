// Unit tests for lib/aiError.js using mocked provider/endpoint responses.
// Run with: npm test
import assert from "node:assert";
import { describeAiFailure } from "../lib/aiError.js";

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

test("429 rate limit: explains the failure and tells the user to retry later", () => {
  const msg = describeAiFailure(429, {
    ok: false,
    error: "rate_limited",
    retryable: true,
    message:
      "The AI provider is rate limiting requests (HTTP 429). This may be a rate limit, exhausted free-tier capacity, or provider capacity limits. Please wait a few minutes and try again."
  });
  assert.ok(msg.includes("429"));
  assert.ok(/wait a few minutes/i.test(msg));
  assert.ok(/rate limit/i.test(msg));
});

test("429 without a server message still gets a clear default (no fabrication)", () => {
  const msg = describeAiFailure(429, { ok: false, error: "rate_limited" });
  assert.ok(msg.includes("429"));
  assert.ok(!/success|generated|complete/i.test(msg));
});

test("503 missing configuration: names the variable, never a value", () => {
  const msg = describeAiFailure(503, {
    ok: false,
    error: "missing_environment_variable",
    variable: "OPENROUTER_API_KEY"
  });
  assert.ok(msg.includes("OPENROUTER_API_KEY"));
  assert.ok(/not configured/i.test(msg));
});

test("legacy 502 upstream message is passed through verbatim", () => {
  const msg = describeAiFailure(502, {
    ok: false,
    error: "upstream_failure",
    message: "The AI provider responded with status 503."
  });
  assert.strictEqual(msg, "The AI provider responded with status 503.");
});

test("auth and model failures point at the right configuration names", () => {
  assert.ok(describeAiFailure(502, { error: "auth_failed" }).includes("OPENROUTER_API_KEY"));
  assert.ok(describeAiFailure(401, {}).includes("OPENROUTER_API_KEY"));
  assert.ok(describeAiFailure(502, { error: "model_not_found" }).includes("AI_MODEL"));
});

test("network failure (status 0 / no payload) gets an honest message", () => {
  assert.ok(/network error/i.test(describeAiFailure(0, null)));
  assert.ok(/network error/i.test(describeAiFailure(0, undefined)));
});

test("400 invalid request keeps the server message", () => {
  const msg = describeAiFailure(400, {
    ok: false,
    error: "invalid_request",
    message: "A non-empty 'prompt' string is required."
  });
  assert.ok(msg.includes("non-empty 'prompt'"));
});

test("unknown failures fall back to a generic message with the status", () => {
  const msg = describeAiFailure(418, { ok: false });
  assert.ok(msg.includes("418"));
});

test("failure mapping never returns success-flavoured text", () => {
  const cases = [
    [429, { error: "rate_limited" }],
    [502, { error: "upstream_failure" }],
    [503, { error: "missing_environment_variable" }],
    [0, null],
    [500, {}],
  ];
  for (const [status, data] of cases) {
    const msg = describeAiFailure(status, data);
    assert.ok(!/\b(success|successfully generated|here is your result)\b/i.test(msg), `status ${status}: ${msg}`);
    assert.ok(typeof msg === "string" && msg.length > 10, `status ${status} message too short`);
  }
});

test("bare 503 is NOT blamed on configuration (no invented cause)", () => {
  const msg = describeAiFailure(503, { ok: false });
  assert.ok(!/not configured|OPENROUTER_API_KEY/i.test(msg), msg);
  assert.ok(/503/.test(msg));
});

test("bare 404 does NOT claim the model is missing (no invented cause)", () => {
  const msg = describeAiFailure(404, { ok: false });
  assert.ok(!/AI_MODEL/i.test(msg), msg);
  assert.ok(/404/.test(msg));
});

test("503 that names a variable still reports configuration", () => {
  const msg = describeAiFailure(503, { variable: "OPENROUTER_API_KEY" });
  assert.ok(msg.includes("OPENROUTER_API_KEY"));
  assert.ok(/not configured/i.test(msg));
});

console.log(`aiError: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
