// Integration tests for pages/api/email.js (POST /api/email) with a session
// and a MOCKED provider transport. Verifies auth, validation, honest
// not_configured reporting, RTL HTML for Urdu, provider error mapping, and
// the endpoint-level rate limit. Nothing is ever really sent.
// Run with: npm test
import assert from "node:assert";
import fs from "fs";
import os from "os";
import path from "path";
import handler from "../pages/api/email.js";
import { createUser, createSession } from "../lib/auth.js";
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

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "av-emailapi-"));
process.chdir(dataDir); // store() resolves cwd lazily; do this before any use

function makeRes() {
  return {
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
}

const ENV_KEYS = ["BREVO_API_KEY", "RESEND_API_KEY", "SENDGRID_API_KEY", "EMAIL_FROM"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const clearEnv = () => ENV_KEYS.forEach((k) => delete process.env[k]);

const realFetch = globalThis.fetch;
let calls = [];
function mockFetch(impl) {
  globalThis.fetch = (url, opts) => {
    calls.push({ url, opts });
    return impl(url, opts);
  };
}

await createUser({ name: "Email Tester", email: "et@example.com", password: "hunter2hunter2" });
const token = createSession("et@example.com");

const authedReq = (body) => ({
  method: "POST",
  body,
  headers: { cookie: `av_session=${token}`, host: "localhost:3000" },
});
const validBody = {
  to: "user@example.com",
  subject: "Hello",
  message: "Body text",
};

clearEnv();

await test("GET -> 405 with Allow header", async () => {
  resetRateLimits();
  const res = makeRes();
  await handler({ method: "GET", headers: {} }, res);
  assert.strictEqual(res.statusCode, 405);
  assert.strictEqual(res.headers.Allow, "POST");
});

await test("no session -> 401", async () => {
  resetRateLimits();
  const res = makeRes();
  await handler({ method: "POST", body: validBody, headers: { host: "localhost:3000" } }, res);
  assert.strictEqual(res.statusCode, 401);
  assert.ok(!("result" in res.body));
});

await test("missing fields -> 400 with per-field errors", async () => {
  resetRateLimits();
  const res = makeRes();
  await handler(authedReq({}), res);
  assert.strictEqual(res.statusCode, 400);
  assert.ok(res.body.errors.to);
  assert.ok(res.body.errors.subject);
  assert.ok(res.body.errors.message);
});

await test("invalid recipient email -> 400 naming the field", async () => {
  resetRateLimits();
  const res = makeRes();
  await handler(authedReq({ ...validBody, to: "not-an-email" }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.ok(res.body.errors.to);
});

await test("no provider configured -> 503 not_configured naming the variables", async () => {
  resetRateLimits();
  clearEnv();
  const res = makeRes();
  await handler(authedReq(validBody), res);
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.body.code, "not_configured");
  assert.ok(
    res.body.missing.join(" ").includes("BREVO_API_KEY, RESEND_API_KEY or SENDGRID_API_KEY"),
    "names the provider key variables"
  );
  assert.ok(res.body.message.includes("nothing was sent"));
});

await test("urdu request adds an RTL html part to the provider payload", async () => {
  resetRateLimits();
  clearEnv();
  process.env.RESEND_API_KEY = "re_DUMMYKEY123";
  process.env.EMAIL_FROM = "no-reply@example.com";
  calls = [];
  mockFetch(async () => new Response(JSON.stringify({ id: "m" }), { status: 200 }));
  try {
    const res = makeRes();
    await handler(authedReq({ ...validBody, language: "urdu" }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.provider, "resend");
    const payload = JSON.parse(calls[0].opts.body);
    assert.ok(payload.html.includes('dir="rtl"'), "Urdu sends an RTL HTML part");
    assert.ok(payload.html.includes('lang="ur"'));
  } finally {
    mockFetch(realFetch);
    clearEnv();
  }
});

await test("unknown language falls back to English: no html part, no error", async () => {
  resetRateLimits();
  clearEnv();
  process.env.RESEND_API_KEY = "re_DUMMYKEY123";
  process.env.EMAIL_FROM = "no-reply@example.com";
  calls = [];
  mockFetch(async () => new Response(JSON.stringify({ id: "m" }), { status: 200 }));
  try {
    const res = makeRes();
    await handler(authedReq({ ...validBody, language: "klingon" }), res);
    assert.strictEqual(res.statusCode, 200);
    const payload = JSON.parse(calls[0].opts.body);
    assert.ok(!("html" in payload), "English sends plain text only");
  } finally {
    mockFetch(realFetch);
    clearEnv();
  }
});

await test("provider 429 passes through as 429 with Retry-After and retryable", async () => {
  resetRateLimits();
  clearEnv();
  process.env.RESEND_API_KEY = "re_DUMMYKEY123";
  process.env.EMAIL_FROM = "no-reply@example.com";
  calls = [];
  mockFetch(async () => new Response("slow down", { status: 429 }));
  try {
    const res = makeRes();
    await handler(authedReq(validBody), res);
    assert.strictEqual(res.statusCode, 429);
    assert.strictEqual(res.body.code, "rate_limited");
    assert.strictEqual(res.body.retryable, true);
    assert.ok(res.headers["Retry-After"]);
    assert.ok(/NOT sent/i.test(res.body.message));
  } finally {
    mockFetch(realFetch);
    clearEnv();
  }
});

await test("provider 401 -> 502 auth_failed without leaking credentials", async () => {
  resetRateLimits();
  clearEnv();
  process.env.RESEND_API_KEY = "re_SUPERSECRETVALUE123";
  process.env.EMAIL_FROM = "no-reply@example.com";
  calls = [];
  mockFetch(async () => new Response("invalid", { status: 401 }));
  try {
    const res = makeRes();
    await handler(authedReq(validBody), res);
    assert.strictEqual(res.statusCode, 502);
    assert.strictEqual(res.body.code, "auth_failed");
    assert.ok(res.body.message.includes("RESEND_API_KEY"));
    assert.ok(!JSON.stringify(res.body).includes("re_SUPERSECRETVALUE123"));
  } finally {
    mockFetch(realFetch);
    clearEnv();
  }
});

await test("endpoint rate limit trips with 429 rate_limited after the cap", async () => {
  resetRateLimits();
  clearEnv();
  const res = makeRes();
  // The guard allows 10 authenticated POSTs per minute; the 11th must be cut.
  let last = null;
  for (let i = 0; i < 11; i++) {
    last = makeRes();
    await handler(authedReq({ ...validBody, to: `user${i}@example.com` }), last);
  }
  assert.strictEqual(last.statusCode, 429);
  assert.strictEqual(last.body.code, "rate_limited");
  assert.ok(last.headers["Retry-After"]);
});

console.log(`emailApi: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
