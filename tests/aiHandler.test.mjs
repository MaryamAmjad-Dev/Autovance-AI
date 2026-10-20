// Unit tests for pages/api/ai.js error handling with a MOCKED upstream
// provider (global fetch is replaced; no network, no real credentials).
// Run with: npm test
import assert from "node:assert";
import handler from "../pages/api/ai.js";
import { resetRateLimits } from "../lib/rateLimit.js";

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("PASS", name);
  } catch (e) {
    failed++;
    console.log("FAIL", name, "->", e.message);
  }
}

const FAKE_KEY = "sk-or-v1-TEST-VALUE-MUST-NOT-APPEAR";

function makeRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    },
  };
  return res;
}

const req = (body, method = "POST") => ({ method, body });
const realFetch = globalThis.fetch;

function mockFetch(impl) {
  globalThis.fetch = impl;
}

// The API rate limiter is shared per process and keyed by IP; a mock req has
// no headers, so every call here would accumulate against "<name>:unknown".
// Resetting before each call keeps repeated `npm test` runs (within the same
// 60s window) from tripping an accidental 429.
async function callHandler(req, res) {
  resetRateLimits();
  return handler(req, res);
}

await test("non-POST -> 405", async () => {
  const res = makeRes();
  await callHandler(req(null, "GET"), res);
  assert.strictEqual(res.statusCode, 405);
});

await test("empty prompt -> 400 invalid_request", async () => {
  const res = makeRes();
  await callHandler(req({ prompt: "   " }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, "invalid_request");
});

await test("missing key -> 503 naming OPENROUTER_API_KEY only", async () => {
  const saved = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const res = makeRes();
    await callHandler(req({ prompt: "hello" }), res);
    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.body.variable, "OPENROUTER_API_KEY");
    assert.ok(!("result" in res.body));
  } finally {
    if (saved !== undefined) process.env.OPENROUTER_API_KEY = saved;
  }
});

await test("mocked upstream 429 -> endpoint returns 429 rate_limited with guidance", async () => {
  process.env.OPENROUTER_API_KEY = FAKE_KEY;
  mockFetch(
    async () =>
      new Response(JSON.stringify({ error: { code: 429 } }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      })
  );
  try {
    const res = makeRes();
    await callHandler(req({ prompt: "hello" }), res);
    assert.strictEqual(res.statusCode, 429);
    assert.strictEqual(res.body.error, "rate_limited");
    assert.strictEqual(res.body.retryable, true);
    assert.ok(res.body.message.includes("429"));
    assert.ok(/try again/i.test(res.body.message));
    assert.ok(!("result" in res.body), "must not fabricate a result");
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes(FAKE_KEY), "key value must never appear in output");
  } finally {
    mockFetch(realFetch);
  }
});

await test("mocked upstream 429 keeps provider retry-after header when present", async () => {
  process.env.OPENROUTER_API_KEY = FAKE_KEY;
  mockFetch(
    async () =>
      new Response("rate limited", {
        status: 429,
        headers: { "retry-after": "12" },
      })
  );
  try {
    const res = makeRes();
    await callHandler(req({ prompt: "hello" }), res);
    assert.strictEqual(res.statusCode, 429);
    assert.strictEqual(res.body.retry_after, "12");
  } finally {
    mockFetch(realFetch);
  }
});

await test("mocked upstream 401 -> auth_failed message names the variable, not the value", async () => {
  process.env.OPENROUTER_API_KEY = FAKE_KEY;
  mockFetch(async () => new Response("unauthorized", { status: 401 }));
  try {
    const res = makeRes();
    await callHandler(req({ prompt: "hello" }), res);
    assert.strictEqual(res.statusCode, 502);
    assert.strictEqual(res.body.error, "auth_failed");
    assert.ok(res.body.message.includes("OPENROUTER_API_KEY"));
    assert.ok(!JSON.stringify(res.body).includes(FAKE_KEY));
  } finally {
    mockFetch(realFetch);
  }
});

await test("mocked upstream 404 -> model_not_found message names AI_MODEL", async () => {
  process.env.OPENROUTER_API_KEY = FAKE_KEY;
  mockFetch(async () => new Response("not found", { status: 404 }));
  try {
    const res = makeRes();
    await callHandler(req({ prompt: "hello" }), res);
    assert.strictEqual(res.statusCode, 502);
    assert.strictEqual(res.body.error, "model_not_found");
    assert.ok(res.body.message.includes("AI_MODEL"));
  } finally {
    mockFetch(realFetch);
  }
});

await test("network failure -> 502 upstream_failure", async () => {
  process.env.OPENROUTER_API_KEY = FAKE_KEY;
  mockFetch(async () => {
    throw new TypeError("fetch failed");
  });
  try {
    const res = makeRes();
    await callHandler(req({ prompt: "hello" }), res);
    assert.strictEqual(res.statusCode, 502);
    assert.strictEqual(res.body.error, "upstream_failure");
    assert.ok(!JSON.stringify(res.body).includes(FAKE_KEY));
  } finally {
    mockFetch(realFetch);
  }
});

await test("mocked upstream 200 -> legacy success shape { result } preserved", async () => {
  process.env.OPENROUTER_API_KEY = FAKE_KEY;
  mockFetch(
    async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "Generated text" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
  );
  try {
    const res = makeRes();
    await callHandler(req({ prompt: "hello" }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { result: "Generated text" });
  } finally {
    mockFetch(realFetch);
  }
});

console.log(`aiHandler: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
