// Unit tests for lib/auth.js crypto + cookie helpers.
// (No store I/O here: hashing/token functions are pure.)
// Run with: npm test
import assert from "node:assert";
import {
  hashPassword,
  verifyPassword,
  hashToken,
  parseCookies,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  RESET_TTL_MS,
} from "../lib/auth.js";

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

await test("hashPassword: never stores plaintext and uses scrypt format", async () => {
  const stored = await hashPassword("CorrectHorse1");
  assert.ok(stored.startsWith("scrypt$16384$"));
  assert.ok(!stored.includes("CorrectHorse1"));
  const [, , salt, digest] = stored.split("$");
  assert.strictEqual(salt.length, 32); // 16 random bytes hex
  assert.strictEqual(digest.length, 128); // 64-byte key hex
});

await test("hashPassword: random salt -> two hashes of the same password differ", async () => {
  const a = await hashPassword("SamePassword1");
  const b = await hashPassword("SamePassword1");
  assert.notStrictEqual(a, b);
});

await test("verifyPassword: correct password passes, wrong one fails", async () => {
  const stored = await hashPassword("AnotherPass9");
  assert.strictEqual(await verifyPassword("AnotherPass9", stored), true);
  assert.strictEqual(await verifyPassword("AnotherPass8", stored), false);
  assert.strictEqual(await verifyPassword("", stored), false);
});

await test("verifyPassword: malformed stored value never throws, just fails", async () => {
  assert.strictEqual(await verifyPassword("x", "garbage"), false);
  assert.strictEqual(await verifyPassword("x", "scrypt$16384$zz$zz"), false);
  assert.strictEqual(await verifyPassword("x", null), false);
});

await test("hashToken: deterministic sha256 hex (safe to persist)", () => {
  const t = "deadbeef".repeat(8);
  assert.strictEqual(hashToken(t), hashToken(t));
  assert.strictEqual(hashToken(t).length, 64);
  assert.notStrictEqual(hashToken(t), hashToken(`${t}x`));
  assert.ok(!hashToken(t).includes(t));
});

await test("parseCookies: parses the session cookie from a header", () => {
  const cookies = parseCookies(`theme=dark; ${SESSION_COOKIE}=abc123; other=1`);
  assert.strictEqual(cookies[SESSION_COOKIE], "abc123");
  assert.strictEqual(cookies.theme, "dark");
  assert.deepStrictEqual(parseCookies(undefined), {});
  assert.deepStrictEqual(parseCookies(""), {});
});

await test("session/reset TTLs are sane", () => {
  assert.strictEqual(SESSION_TTL_MS, 7 * 24 * 60 * 60 * 1000);
  assert.strictEqual(RESET_TTL_MS, 30 * 60 * 1000);
});

console.log(`auth: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
