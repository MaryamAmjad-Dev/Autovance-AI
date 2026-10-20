// Integration tests for pages/api/form.js with a real session and a temp
// data directory: auth, schema read/save (including select options
// validation), server-side submission validation, honest follow-up status,
// and the stored-submissions read-back endpoint.
// Run with: npm test
import assert from "node:assert";
import fs from "fs";
import os from "os";
import path from "path";
import handler from "../pages/api/form.js";
import { createUser, createSession } from "../lib/auth.js";

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

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "av-formapi-"));
process.chdir(dataDir); // store() resolves cwd lazily; before any usage

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

await createUser({ name: "Form Tester", email: "ft@example.com", password: "hunter2hunter2" });
const token = await createSession("ft@example.com");

const reqFor = (method, body, query) => ({
  method,
  body,
  query,
  headers: { cookie: `av_session=${token}`, host: "localhost:3000" },
});

const ENV_KEY = "FORM_FOLLOWUP_WEBHOOK_URL";
const savedUrl = process.env[ENV_KEY];
delete process.env[ENV_KEY];

const CUSTOM_SCHEMA = {
  name: "Feedback",
  fields: [
    { name: "who", label: "Who", type: "email", required: true, maxLength: 254 },
    {
      name: "rating",
      label: "Rating",
      type: "select",
      required: false,
      options: ["Good", "Bad"],
      maxLength: 500,
    },
  ],
};

await test("unauthenticated -> 401", async () => {
  const res = makeRes();
  await handler({ method: "GET", headers: { host: "localhost:3000" } }, res);
  assert.strictEqual(res.statusCode, 401);
});

await test("GET returns the default schema and reports the follow-up honestly", async () => {
  const res = makeRes();
  await handler(reqFor("GET"), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(res.body.schema.name, "Contact form");
  assert.ok(Array.isArray(res.body.schema.fields) && res.body.schema.fields.length > 0);
  assert.strictEqual(res.body.followupConfigured, false, "unset env must be reported as not configured");
  assert.ok(!("submissions" in res.body), "plain GET stays small");
});

await test("PUT rejects an invalid configuration with field errors", async () => {
  const res = makeRes();
  await handler(reqFor("PUT", { name: "", fields: [] }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.ok(res.body.errors.name);
  assert.ok(res.body.errors.fields);
});

await test("PUT rejects a select field without usable options", async () => {
  const res = makeRes();
  await handler(
    reqFor("PUT", {
      name: "Broken",
      fields: [{ name: "pick", label: "Pick", type: "select", required: false, options: [] }],
    }),
    res
  );
  assert.strictEqual(res.statusCode, 400);
  const messages = Object.entries(res.body.errors)
    .filter(([k]) => k.includes("pick") || k.includes("Field 1"))
    .map(([, v]) => v)
    .join(" ");
  assert.ok(/option/i.test(messages), "the options error is surfaced");
});

await test("PUT saves a valid schema and GET reflects it", async () => {
  const put = makeRes();
  await handler(reqFor("PUT", CUSTOM_SCHEMA), put);
  assert.strictEqual(put.statusCode, 200);
  assert.strictEqual(put.body.schema.name, "Feedback");

  const get = makeRes();
  await handler(reqFor("GET"), get);
  assert.strictEqual(get.body.schema.name, "Feedback");
  assert.strictEqual(get.body.schema.fields.length, 2);
});

await test("POST validates against the stored schema (server-side)", async () => {
  const missing = makeRes();
  await handler(reqFor("POST", { values: {} }), missing);
  assert.strictEqual(missing.statusCode, 422);
  assert.ok(missing.body.errors.who, "required field is enforced server-side");

  const bad = makeRes();
  await handler(reqFor("POST", { values: { who: "not-an-email", rating: "Nope" } }), bad);
  assert.strictEqual(bad.statusCode, 422);
  assert.ok(bad.body.errors.who);
  assert.ok(bad.body.errors.rating, "select values must be one of the provided options");
});

await test("POST stores a valid submission and reports the follow-up as not configured", async () => {
  const res = makeRes();
  await handler(reqFor("POST", { values: { who: "f@example.com", rating: "Good" } }), res);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.ok, true);
  assert.ok(res.body.submission.id.startsWith("sub_"));
  assert.ok(res.body.submission.storedAt);
  assert.strictEqual(res.body.storedCount, 1);
  assert.deepStrictEqual(res.body.followup, { executed: false, reason: "not_configured" });
});

await test("GET ?submissions=1 reads stored submissions back with provenance", async () => {
  const res = makeRes();
  await handler(reqFor("GET", null, { submissions: "1" }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.total, 1);
  assert.strictEqual(res.body.submissions.length, 1);
  const sub = res.body.submissions[0];
  assert.strictEqual(sub.values.who, "f@example.com");
  assert.strictEqual(sub.values.rating, "Good");
  assert.strictEqual(sub.submittedBy, "ft@example.com");
  assert.ok(sub.submittedAt);
});

await test("configured follow-up URL is reported as configured (no request is made on GET)", async () => {
  process.env[ENV_KEY] = "https://example.com/hooks/autovance";
  try {
    const res = makeRes();
    await handler(reqFor("GET"), res);
    assert.strictEqual(res.body.followupConfigured, true);
  } finally {
    delete process.env[ENV_KEY];
  }
});

if (savedUrl !== undefined) process.env[ENV_KEY] = savedUrl;
console.log(`formApi: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
