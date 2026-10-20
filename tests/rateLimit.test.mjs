// Unit tests for lib/rateLimit.js (in-memory fixed-window limiter).
// Fully offline: no clock sleeps, the window clock is injected via `now`.
// Run with: npm test
import assert from "node:assert";
import { rateLimit, rateLimitGuard, resetRateLimits } from "../lib/rateLimit.js";

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

resetRateLimits();

test("allows up to the limit inside the window, then blocks", () => {
  const t = 1000000;
  for (let i = 0; i < 3; i++) {
    const r = rateLimit("unit:a", { limit: 3, windowMs: 60000, now: t + i });
    assert.strictEqual(r.allowed, true, `hit ${i + 1} should be allowed`);
    assert.strictEqual(r.remaining, 3 - (i + 1));
  }
  const blocked = rateLimit("unit:a", { limit: 3, windowMs: 60000, now: t + 5 });
  assert.strictEqual(blocked.allowed, false);
  assert.strictEqual(blocked.remaining, 0);
});

test("a new window starts once the old one expires", () => {
  const t = 2000000;
  rateLimit("unit:b", { limit: 1, windowMs: 1000, now: t });
  const blocked = rateLimit("unit:b", { limit: 1, windowMs: 1000, now: t + 500 });
  assert.strictEqual(blocked.allowed, false);
  // resetAt === t + 1000; bucket counts as expired when resetAt <= now.
  const fresh = rateLimit("unit:b", { limit: 1, windowMs: 1000, now: t + 1000 });
  assert.strictEqual(fresh.allowed, true);
});

test("keys are independent per route and per client", () => {
  const t = 3000000;
  rateLimit("login:1.2.3.4", { limit: 1, windowMs: 60000, now: t });
  assert.strictEqual(
    rateLimit("login:1.2.3.4", { limit: 1, windowMs: 60000, now: t + 1 }).allowed,
    false,
    "same route + same IP must share a bucket"
  );
  assert.strictEqual(
    rateLimit("login:5.6.7.8", { limit: 1, windowMs: 60000, now: t + 1 }).allowed,
    true,
    "different IP must have its own bucket"
  );
  assert.strictEqual(
    rateLimit("signup:1.2.3.4", { limit: 1, windowMs: 60000, now: t + 1 }).allowed,
    true,
    "different route must have its own bucket"
  );
});

test("resetRateLimits clears every bucket", () => {
  rateLimit("unit:c", { limit: 1, windowMs: 60000, now: 4000000 });
  assert.strictEqual(rateLimit("unit:c", { limit: 1, windowMs: 60000, now: 4000001 }).allowed, false);
  resetRateLimits();
  assert.strictEqual(rateLimit("unit:c", { limit: 1, windowMs: 60000 }).allowed, true);
});

test("rateLimitGuard passes requests through (returns null) under the limit", () => {
  resetRateLimits();
  const req = { headers: { "x-forwarded-for": "9.9.9.9" } };
  const res = makeRes();
  assert.strictEqual(
    rateLimitGuard(req, res, { name: "guard-pass", limit: 2, windowMs: 60000 }),
    null
  );
  assert.strictEqual(
    rateLimitGuard(req, res, { name: "guard-pass", limit: 2, windowMs: 60000 }),
    null
  );
  assert.strictEqual(res.statusCode, null, "nothing may be sent while passing through");
});

test("rateLimitGuard returns a finished 429 with Retry-After over the limit", () => {
  resetRateLimits();
  const req = { headers: { "x-forwarded-for": "9.9.9.8" } };
  const res = makeRes();
  rateLimitGuard(req, res, { name: "guard-429", limit: 1, windowMs: 60000 });
  const sent = rateLimitGuard(req, res, { name: "guard-429", limit: 1, windowMs: 60000 });
  assert.ok(sent, "second call must be blocked");
  assert.strictEqual(res.statusCode, 429);
  assert.strictEqual(res.body.code, "rate_limited");
  assert.strictEqual(res.body.retryable, true);
  assert.ok(Number(res.headers["Retry-After"]) >= 1, "Retry-After header in seconds");
  assert.ok(/try again/i.test(res.body.message));
});

test("client key uses the first X-Forwarded-For hop", () => {
  resetRateLimits();
  const a = { headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" } };
  const b = { headers: { "x-forwarded-for": "3.3.3.3" } };
  const res = makeRes();
  rateLimitGuard(a, res, { name: "guard-xff", limit: 1, windowMs: 60000 });
  assert.ok(
    rateLimitGuard(a, res, { name: "guard-xff", limit: 1, windowMs: 60000 }),
    "same first hop shares the bucket"
  );
  assert.strictEqual(
    rateLimitGuard(b, res, { name: "guard-xff", limit: 1, windowMs: 60000 }),
    null,
    "a different first hop gets its own bucket"
  );
});

resetRateLimits();

console.log(`rateLimit: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
