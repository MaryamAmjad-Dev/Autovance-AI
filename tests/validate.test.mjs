// Unit tests for lib/validate.js — pure functions, zero network I/O.
// Run with: npm test
import assert from "node:assert";
import {
  isEmail,
  passwordIssues,
  validateSignup,
  validateLogin,
  validateWebhookInput,
  HTTP_METHODS,
} from "../lib/validate.js";

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

test("isEmail: accepts valid, rejects invalid", () => {
  assert.strictEqual(isEmail("user@example.com"), true);
  assert.strictEqual(isEmail("  user+tag@sub.example.co.uk  "), true);
  assert.strictEqual(isEmail(""), false);
  assert.strictEqual(isEmail("no-at-sign"), false);
  assert.strictEqual(isEmail("no-tld@domain."), false);
  assert.strictEqual(isEmail("two@@example.com"), false);
  assert.strictEqual(isEmail(null), false);
  assert.strictEqual(isEmail(`${"a".repeat(250)}@example.com`), false); // over 254
});

test("passwordIssues: policy is enforced with helpful messages", () => {
  assert.deepStrictEqual(passwordIssues("Abcd1234"), []); // valid
  assert.ok(passwordIssues("abc").length > 0); // too short
  assert.ok(passwordIssues("abcdefgh").some((i) => i.includes("number")));
  assert.ok(passwordIssues("12345678").some((i) => i.includes("letter")));
  assert.ok(passwordIssues(null).length > 0);
});

test("validateSignup: full happy path normalizes email to lowercase", () => {
  const r = validateSignup({
    name: "  Maryam  ",
    email: " USER@Example.COM ",
    password: "Secret123",
    confirm: "Secret123",
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.value.email, "user@example.com");
  assert.strictEqual(r.value.name, "Maryam");
});

test("validateSignup: each defect is reported per-field", () => {
  const r = validateSignup({ name: "", email: "bad", password: "shrt", confirm: "nope" });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.name);
  assert.ok(r.errors.email);
  assert.ok(r.errors.password);
  assert.ok(r.errors.confirm);
});

test("validateLogin: missing/invalid fields reported", () => {
  assert.strictEqual(validateLogin({}).ok, false);
  const r = validateLogin({ email: "x@y.io", password: "" });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.password);
  const ok = validateLogin({ email: "x@y.io", password: "whatever" });
  assert.strictEqual(ok.ok, true);
});

test("validateWebhookInput: defaults method to POST and normalizes", () => {
  const r = validateWebhookInput({ url: "  https://example.com/hook  " });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.value.method, "POST");
  assert.strictEqual(r.value.url, "https://example.com/hook");
  assert.deepStrictEqual(r.value.headers, {});
  assert.strictEqual(r.value.body, null);
});

test("validateWebhookInput: headers accepted as object or JSON string", () => {
  const asObject = validateWebhookInput({
    url: "https://example.com",
    headers: { "X-Token": "abc" },
  });
  assert.strictEqual(asObject.ok, true);
  assert.strictEqual(asObject.value.headers["X-Token"], "abc");

  const asString = validateWebhookInput({
    url: "https://example.com",
    headers: '{"X-Token":"abc"}',
  });
  assert.strictEqual(asString.ok, true);
  assert.strictEqual(asString.value.headers["X-Token"], "abc");
});

test("validateWebhookInput: forbidden and malformed headers rejected", () => {
  assert.ok(validateWebhookInput({ url: "https://e.com", headers: { host: "x" } }).errors.headers);
  assert.ok(validateWebhookInput({ url: "https://e.com", headers: { "Content-Length": "5" } }).errors.headers);
  assert.ok(validateWebhookInput({ url: "https://e.com", headers: "not-json{" }).errors.headers);
  assert.ok(validateWebhookInput({ url: "https://e.com", headers: { "X-A": "line\r\nbreak" } }).errors.headers);
  assert.ok(validateWebhookInput({ url: "https://e.com", headers: [1, 2] }).errors.headers);
});

test("validateWebhookInput: body must be valid JSON; GET/DELETE cannot carry one", () => {
  assert.ok(validateWebhookInput({ url: "https://e.com", body: "{oops" }).errors.body);
  const get = validateWebhookInput({ url: "https://e.com", method: "GET", body: '{"a":1}' });
  assert.ok(get.errors.body);
  const post = validateWebhookInput({ url: "https://e.com", method: "post", body: '{"a":1}' });
  assert.strictEqual(post.ok, true);
  assert.strictEqual(post.value.body, '{"a":1}');
});

test("validateWebhookInput: unsupported method and missing url rejected", () => {
  assert.ok(validateWebhookInput({ url: "https://e.com", method: "TRACE" }).errors.method);
  assert.ok(validateWebhookInput({}).errors.url);
  assert.deepStrictEqual(
    Object.keys(validateWebhookInput({ url: "https://e.com", method: "TRACE" }).errors),
    ["method"]
  );
});

test("HTTP_METHODS is the supported whitelist", () => {
  assert.deepStrictEqual(HTTP_METHODS, ["GET", "POST", "PUT", "PATCH", "DELETE"]);
});

console.log(`validate: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
