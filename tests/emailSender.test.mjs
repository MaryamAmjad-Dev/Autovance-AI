// Unit tests for lib/emailSender.js with a MOCKED provider transport
// (global fetch is replaced; no network, no real credentials, nothing sent).
// Run with: npm test
import assert from "node:assert";
import { sendEmail, emailProviderConfig, emailConfigStatus } from "../lib/emailSender.js";

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

const ENV_KEYS = ["BREVO_API_KEY", "RESEND_API_KEY", "SENDGRID_API_KEY", "EMAIL_FROM"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;
const clearEnv = () => ENV_KEYS.forEach((k) => delete process.env[k]);

let calls = [];
function mockFetch(impl) {
  globalThis.fetch = (url, opts) => {
    calls.push({ url, opts });
    return impl(url, opts);
  };
}
const restoreAll = () => {
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
};

clearEnv();

await test("no provider configured -> honest not_configured naming the variables", async () => {
  clearEnv();
  const r = await sendEmail({ to: "a@example.com", subject: "s", text: "t" });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "not_configured");
  assert.ok(r.missing.join(" ").includes("BREVO_API_KEY, RESEND_API_KEY or SENDGRID_API_KEY"));
  assert.ok(r.message.includes("nothing was sent"));
  assert.ok(!("provider" in r));
});

await test("emailConfigStatus: key without EMAIL_FROM stays unconfigured", () => {
  clearEnv();
  assert.deepStrictEqual(emailConfigStatus(), {
    configured: false,
    provider: null,
    missing: ["BREVO_API_KEY, RESEND_API_KEY or SENDGRID_API_KEY"],
  });
  process.env.RESEND_API_KEY = "re_test_dummy_value";
  const partial = emailConfigStatus();
  assert.strictEqual(partial.configured, false);
  assert.strictEqual(partial.provider, "resend");
  assert.ok(partial.missing.includes("EMAIL_FROM"));
  assert.strictEqual(emailProviderConfig().envVar, "RESEND_API_KEY");
  clearEnv();
});

await test("brevo wins first-match precedence when several provider keys are set", () => {
  clearEnv();
  process.env.RESEND_API_KEY = "re_DUMMY";
  process.env.SENDGRID_API_KEY = "SG.DUMMY";
  process.env.BREVO_API_KEY = "xkeysib-DUMMY";
  const cfg = emailProviderConfig();
  assert.strictEqual(cfg.name, "brevo");
  assert.strictEqual(cfg.envVar, "BREVO_API_KEY");
  clearEnv();
});

await test("brevo success: HTTP 201, api-key header, sender parsed from Name <email>, htmlContent forwarded", async () => {
  clearEnv();
  process.env.BREVO_API_KEY = "xkeysib_DUMMYKEY123";
  process.env.EMAIL_FROM = '"Autovance AI" <no-reply@example.com>';
  calls = [];
  mockFetch(
    async () =>
      new Response(JSON.stringify({ messageId: 42 }), {
        status: 201,
        headers: { "content-type": "application/json" },
      })
  );
  try {
    const r = await sendEmail({
      to: "user@example.com",
      subject: "Hi",
      text: "hello",
      html: '<div dir="rtl">hello</div>',
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.provider, "brevo");
    assert.ok(/accepted/i.test(r.message));
    assert.ok(/asynchronous/i.test(r.message), "must never claim confirmed delivery");
    assert.strictEqual(calls[0].url, "https://api.brevo.com/v3/smtp/email");
    assert.strictEqual(calls[0].opts.headers["api-key"], "xkeysib_DUMMYKEY123");
    const payload = JSON.parse(calls[0].opts.body);
    assert.deepStrictEqual(payload.sender, { email: "no-reply@example.com", name: "Autovance AI" });
    assert.deepStrictEqual(payload.to, [{ email: "user@example.com" }]);
    assert.strictEqual(payload.textContent, "hello");
    assert.strictEqual(payload.htmlContent, '<div dir="rtl">hello</div>');
    assert.ok(!("text" in payload), "brevo uses textContent, not text");
  } finally {
    mockFetch(realFetch);
    clearEnv();
  }
});

await test("brevo 401 -> auth_failed names BREVO_API_KEY and never leaks the key", async () => {
  clearEnv();
  process.env.BREVO_API_KEY = "xkeysib-SUPERSECRETVALUE123";
  process.env.EMAIL_FROM = "no-reply@example.com";
  calls = [];
  mockFetch(async () => new Response('{"code":"invalid_api_key"}', { status: 401 }));
  try {
    const r = await sendEmail({ to: "u@example.com", subject: "s", text: "t" });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, "auth_failed");
    assert.ok(r.message.includes("BREVO_API_KEY"), "message names the variable");
    assert.ok(!JSON.stringify(r).includes("xkeysib-SUPERSECRETVALUE123"), "key value must not appear");
  } finally {
    mockFetch(realFetch);
    clearEnv();
  }
});

await test("brevo error bodies: xkeysib- keys are redacted from detail", async () => {
  clearEnv();
  process.env.BREVO_API_KEY = "xkeysib-DUMMY";
  process.env.EMAIL_FROM = "no-reply@example.com";
  calls = [];
  mockFetch(
    async () => new Response("bad key xkeysib-SUPERSECRETVALUE123 rejected", { status: 400 })
  );
  try {
    const r = await sendEmail({ to: "u@example.com", subject: "s", text: "t" });
    assert.strictEqual(r.code, "provider_error");
    assert.ok(r.detail.includes("[redacted]"));
    assert.ok(!r.detail.includes("xkeysib-SUPERSECRETVALUE123"));
  } finally {
    mockFetch(realFetch);
    clearEnv();
  }
});

await test("resend success: HTTP 200 accepted, honest async wording, html part forwarded", async () => {
  clearEnv();
  process.env.RESEND_API_KEY = "re_DUMMYKEY123";
  process.env.EMAIL_FROM = "no-reply@example.com";
  calls = [];
  mockFetch(
    async () =>
      new Response(JSON.stringify({ id: "mail_1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
  );
  try {
    const r = await sendEmail({
      to: "user@example.com",
      subject: "Hi",
      text: "hello",
      html: '<div dir="rtl">hello</div>',
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.provider, "resend");
    assert.ok(/accepted/i.test(r.message));
    assert.ok(/asynchronous/i.test(r.message), "must never claim confirmed delivery");
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, "https://api.resend.com/emails");
    assert.strictEqual(calls[0].opts.headers.Authorization, "Bearer re_DUMMYKEY123");
    const payload = JSON.parse(calls[0].opts.body);
    assert.deepStrictEqual(payload.to, ["user@example.com"]);
    assert.strictEqual(payload.subject, "Hi");
    assert.strictEqual(payload.html, '<div dir="rtl">hello</div>');
  } finally {
    mockFetch(realFetch);
    clearEnv();
  }
});

await test("sendgrid success: HTTP 202 with empty body, content parts include html when given", async () => {
  clearEnv();
  process.env.SENDGRID_API_KEY = "SG.DUMMYKEY";
  process.env.EMAIL_FROM = "no-reply@example.com";
  calls = [];
  mockFetch(async () => new Response(null, { status: 202 }));
  try {
    const r = await sendEmail({ to: "user@example.com", subject: "Hi", text: "plain part" });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.provider, "sendgrid");
    assert.strictEqual(calls[0].url, "https://api.sendgrid.com/v3/mail/send");
    const payload = JSON.parse(calls[0].opts.body);
    assert.strictEqual(payload.personalizations[0].to[0].email, "user@example.com");
    assert.deepStrictEqual(payload.content, [{ type: "text/plain", value: "plain part" }]);
  } finally {
    mockFetch(realFetch);
    clearEnv();
  }
});

await test("provider 429 -> rate_limited with explicit NOT sent wording", async () => {
  clearEnv();
  process.env.RESEND_API_KEY = "re_DUMMYKEY123";
  process.env.EMAIL_FROM = "no-reply@example.com";
  calls = [];
  mockFetch(async () => new Response("slow down", { status: 429 }));
  try {
    const r = await sendEmail({ to: "u@example.com", subject: "s", text: "t" });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, "rate_limited");
    assert.ok(r.detail.includes("HTTP 429"));
    assert.ok(/NOT sent/i.test(r.message));
  } finally {
    mockFetch(realFetch);
    clearEnv();
  }
});

await test("provider 401 -> auth_failed names the env var and never leaks the key", async () => {
  clearEnv();
  process.env.RESEND_API_KEY = "re_SUPERSECRETVALUE123";
  process.env.EMAIL_FROM = "no-reply@example.com";
  calls = [];
  mockFetch(async () => new Response("invalid api key", { status: 401 }));
  try {
    const r = await sendEmail({ to: "u@example.com", subject: "s", text: "t" });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, "auth_failed");
    assert.ok(r.message.includes("RESEND_API_KEY"), "message names the variable");
    assert.ok(!JSON.stringify(r).includes("re_SUPERSECRETVALUE123"), "key value must not appear");
  } finally {
    mockFetch(realFetch);
    clearEnv();
  }
});

await test("provider error bodies are credential-sanitized before reaching the caller", async () => {
  clearEnv();
  process.env.SENDGRID_API_KEY = "SG.SUPERSECRET999";
  process.env.EMAIL_FROM = "no-reply@example.com";
  calls = [];
  mockFetch(
    async () =>
      new Response("denied: Bearer abc123secrettoken and sk-or-v1-abcdefghijklmnop invalid", {
        status: 400,
      })
  );
  try {
    const r = await sendEmail({ to: "u@example.com", subject: "s", text: "t" });
    assert.strictEqual(r.code, "provider_error");
    assert.ok(r.detail.includes("[redacted]"), "token bodies are redacted");
    assert.ok(!r.detail.includes("abc123secrettoken"));
    assert.ok(!r.detail.includes("sk-or-v1-abcdefghijklmnop"));
  } finally {
    mockFetch(realFetch);
    clearEnv();
  }
});

await test("network failure -> provider_error with NOT sent wording, no success text", async () => {
  clearEnv();
  process.env.RESEND_API_KEY = "re_DUMMYKEY123";
  process.env.EMAIL_FROM = "no-reply@example.com";
  calls = [];
  mockFetch(async () => {
    throw new TypeError("fetch failed");
  });
  try {
    const r = await sendEmail({ to: "u@example.com", subject: "s", text: "t" });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, "provider_error");
    assert.ok(/could not be reached/i.test(r.message));
    assert.ok(/NOT sent/i.test(r.message));
  } finally {
    mockFetch(realFetch);
    clearEnv();
  }
});

await test("provider 5xx -> provider_error carrying the HTTP status", async () => {
  clearEnv();
  process.env.RESEND_API_KEY = "re_DUMMYKEY123";
  process.env.EMAIL_FROM = "no-reply@example.com";
  calls = [];
  mockFetch(async () => new Response("boom", { status: 500 }));
  try {
    const r = await sendEmail({ to: "u@example.com", subject: "s", text: "t" });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, "provider_error");
    assert.ok(r.detail.includes("HTTP 500"));
    assert.ok(/NOT sent/i.test(r.message));
  } finally {
    mockFetch(realFetch);
    clearEnv();
  }
});

restoreAll();
console.log(`emailSender: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
