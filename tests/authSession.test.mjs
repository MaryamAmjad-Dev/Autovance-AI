// Integration tests for lib/auth.js session, cookie, origin-guard, and
// password-reset behaviour, including the TOCTOU regressions (concurrent
// signups and concurrent single-use reset confirms). Storage is the default
// in-memory store (no POSTGRES_URL in tests).
// Run with: npm test
import assert from "node:assert";
import {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  verifyPasswordDummy,
  hashToken,
  createUser,
  findUserByEmail,
  createSession,
  getSessionUser,
  destroySession,
  sessionCookie,
  clearSessionCookie,
  isCrossSiteRequest,
  createResetToken,
  appBaseUrl,
  requestPasswordReset,
  resetPasswordWithToken,
} from "../lib/auth.js";
import { store } from "../lib/store.js";

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

await test("createUser stores a normalized email and exposes no password hash", async () => {
  const r = await createUser({ name: "Alice", email: "ALICE@example.com", password: "correct horse battery" });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.user.email, "alice@example.com");
  assert.ok(!("passwordHash" in r.user), "public user must not carry the hash");
  assert.ok(await findUserByEmail("alice@example.com"));
  assert.strictEqual(await findUserByEmail("nobody@example.com"), null);
});

await test("duplicate signup is rejected (pre-check and stored user)", async () => {
  const again = await createUser({ name: "Alice2", email: "alice@example.com", password: "whatever123" });
  assert.strictEqual(again.ok, false);
  assert.strictEqual(again.code, "email_taken");
});

await test("REGRESSION: concurrent signups for one email store exactly one user", async () => {
  const results = await Promise.all([
    createUser({ name: "A", email: "race@example.com", password: "pw12345678" }),
    createUser({ name: "B", email: "race@example.com", password: "pw12345678" }),
  ]);
  const wins = results.filter((r) => r.ok);
  assert.strictEqual(wins.length, 1, "exactly one signup may win");
  assert.ok(results.some((r) => r.code === "email_taken"), "the loser gets email_taken");
  const users = await store().get("users", []);
  assert.strictEqual(users.filter((u) => u.email === "race@example.com").length, 1);
});

await test("verifyPasswordDummy never throws (timing equalization is callable)", async () => {
  await verifyPasswordDummy("anything");
  assert.strictEqual(await verifyPasswordDummy("whatever"), false, "dummy hash never verifies");
});

await test("session lifecycle: token resolves the user, destroy revokes it", async () => {
  const token = await createSession("alice@example.com");
  assert.deepStrictEqual(await getSessionUser(token), { name: "Alice", email: "alice@example.com" });
  assert.strictEqual(await getSessionUser("deadbeefdeadbeef"), null);
  await destroySession(token);
  assert.strictEqual(await getSessionUser(token), null, "revoked token must not resolve");
});

await test("session cookie carries HttpOnly/SameSite/Path and Secure only where required", () => {
  const savedEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    const dev = sessionCookie("tok", { headers: { host: "example.com" } });
    assert.ok(dev.includes(`${SESSION_COOKIE}=tok`));
    assert.ok(dev.includes("HttpOnly"));
    assert.ok(dev.includes("SameSite=Lax"));
    assert.ok(dev.includes("Path=/"));
    assert.ok(dev.includes("Max-Age="));
    assert.ok(!dev.includes("Secure"), "development cookie must stay usable over http");

    // Production + public host -> Secure.
    process.env.NODE_ENV = "production";
    const prod = sessionCookie("tok", { headers: { host: "example.com" } });
    assert.ok(prod.includes("Secure"));

    // Production + exact localhost stays usable over plain http.
    const local = sessionCookie("tok", { headers: { host: "localhost:3000" } });
    assert.ok(!local.includes("Secure"));

    // An https proxy header can only ADD Secure, in any environment.
    process.env.NODE_ENV = "development";
    const proxied = sessionCookie("tok", {
      headers: { host: "example.com", "x-forwarded-proto": "https" },
    });
    assert.ok(proxied.includes("Secure"));

    const cleared = clearSessionCookie({ headers: { host: "example.com" } });
    assert.ok(cleared.includes(`${SESSION_COOKIE}=`));
    assert.ok(cleared.includes("Max-Age=0"));
    assert.ok(cleared.includes("HttpOnly"));
  } finally {
    if (savedEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedEnv;
  }
});

await test("isCrossSiteRequest: matching, missing, and foreign origins", () => {
  assert.strictEqual(isCrossSiteRequest({ headers: {} }), false, "no Origin header (curl) passes");
  assert.strictEqual(
    isCrossSiteRequest({ headers: { origin: "https://example.com", host: "example.com" } }),
    false
  );
  assert.strictEqual(
    isCrossSiteRequest({ headers: { origin: "https://evil.com", host: "example.com" } }),
    true
  );
  assert.strictEqual(
    isCrossSiteRequest({ headers: { origin: "https://sub.example.com", host: "example.com" } }),
    true
  );
  assert.strictEqual(
    isCrossSiteRequest({ headers: { origin: "not a url", host: "example.com" } }),
    true,
    "unparsable Origin is treated as cross-site"
  );
});

await test("reset token: single use, changes the password, replay is rejected", async () => {
  const token = await createResetToken("alice@example.com");
  const r1 = await resetPasswordWithToken(token, "brand-new-password-9");
  assert.strictEqual(r1.ok, true);
  const user = await findUserByEmail("alice@example.com");
  assert.strictEqual(await verifyPassword("brand-new-password-9", user.passwordHash), true);
  const r2 = await resetPasswordWithToken(token, "another-password-9");
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.code, "invalid_token");
  assert.strictEqual(await verifyPassword("brand-new-password-9", user.passwordHash), true, "replay must not change anything");
});

await test("REGRESSION: two concurrent confirms with one token succeed only once", async () => {
  const token = await createResetToken("alice@example.com");
  const results = await Promise.all([
    resetPasswordWithToken(token, "first-password-9"),
    resetPasswordWithToken(token, "second-password-9"),
  ]);
  const wins = results.filter((r) => r.ok);
  assert.strictEqual(wins.length, 1, "single-use token may only confirm once");
});

await test("expired reset tokens are rejected and removed", async () => {
  const token = await createResetToken("alice@example.com");
  const tokens = await store().get("reset-tokens", {});
  tokens[hashToken(token)].expiresAt = Date.now() - 1000;
  await store().set("reset-tokens", tokens);
  const r = await resetPasswordWithToken(token, "expired-password-9");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "expired");
  const after = await store().get("reset-tokens", {});
  assert.ok(!after[hashToken(token)], "expired record is deleted");
});

await test("reset with junk tokens is always invalid", async () => {
  assert.strictEqual((await resetPasswordWithToken("", "x-password-999")).code, "invalid_token");
  assert.strictEqual((await resetPasswordWithToken(null, "x-password-999")).code, "invalid_token");
  assert.strictEqual((await resetPasswordWithToken("a".repeat(500), "x-password-999")).code, "invalid_token");
});

await test("appBaseUrl: configured value wins; misconfiguration never falls back to headers", () => {
  const savedUrl = process.env.APP_BASE_URL;
  const savedEnv = process.env.NODE_ENV;
  try {
    process.env.APP_BASE_URL = "https://av.example.com/";
    assert.strictEqual(appBaseUrl({ headers: { host: "evil.com" } }), "https://av.example.com");

    process.env.APP_BASE_URL = "not-a-url";
    assert.strictEqual(appBaseUrl({ headers: { host: "evil.com" } }), null);

    delete process.env.APP_BASE_URL;
    process.env.NODE_ENV = "production";
    assert.strictEqual(
      appBaseUrl({ headers: { host: "evil.com", "x-forwarded-proto": "https" } }),
      null,
      "production without APP_BASE_URL must not trust request headers"
    );

    process.env.NODE_ENV = "development";
    assert.strictEqual(
      appBaseUrl({ headers: { host: "dev.local:3000", "x-forwarded-proto": "https" } }),
      "https://dev.local:3000"
    );
  } finally {
    if (savedUrl === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = savedUrl;
    if (savedEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedEnv;
  }
});

await test("requestPasswordReset reports not_configured offline, before any lookup or email", async () => {
  const envKeys = ["RESEND_API_KEY", "SENDGRID_API_KEY"];
  const saved = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
  try {
    envKeys.forEach((k) => delete process.env[k]);
    const r = await requestPasswordReset("nobody@example.com", { headers: { host: "localhost:3000" } });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, "not_configured");
    assert.ok(r.missing.join(" ").includes("RESEND_API_KEY or SENDGRID_API_KEY"));
    assert.ok(!/sent/i.test(r.message) || /cannot be sent/.test(r.message));
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

console.log(`authSession: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
