#!/usr/bin/env node
// Live HTTP smoke battery against a running Autovance AI production server.
//
//   node scripts/smoke.mjs [baseUrl]                full battery
//   node scripts/smoke.mjs --login-only email pass  restart-persistence probe
//
// The full battery signs up two throwaway users, exercises auth/session,
// origin guard, cron lifecycle + ownership, form validation + read-back,
// webhook SSRF blocking, honest email/reset "not_configured" paths, and one
// real /api/propose call (accepting 200 or an honestly-mapped provider
// failure; 503 missing_environment_variable FAILS because the key must be
// configured when this check is expected to run live).
//
// Exit code: number of failed checks. Never prints secrets or env values.

const base = (
  process.argv[2] && !process.argv[2].startsWith("--")
    ? process.argv[2]
    : process.env.SMOKE_BASE_URL || "http://localhost:3456"
).replace(/\/$/, "");

const results = [];
let failures = 0;

function check(name, cond, detail = "") {
  results.push({ name, pass: Boolean(cond), detail });
  if (!cond) failures += 1;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function sessionCookie(res) {
  const list =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.has("set-cookie")
        ? [res.headers.get("set-cookie")]
        : [];
  const hit = list.find((c) => c.startsWith("av_session="));
  return hit ? hit.split(";")[0] : null;
}

async function req(method, path, { body, cookie, origin } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  const res = await fetch(`${base}${path}`, {
    method,
    redirect: "manual",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { res, json, cookie: sessionCookie(res) };
}

function uniqueUser() {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const password = `Smoke-Pass-${id}-9!`;
  return { name: `Smoke ${id}`, email: `smoke-${id}@example.com`, password, confirm: password };
}

async function login(user) {
  const out = await req("POST", "/api/auth/login", { body: user });
  return out.json && out.json.ok ? out.cookie : null;
}

async function fullBattery() {
  console.log(`Smoke battery against ${base}\n`);

  const pages = [
    ["/", 200], ["/about", 200], ["/team", 200], ["/login", 200], ["/signup", 200],
    ["/workflows", 200], ["/reset-password", 200], ["/reset-confirm", 200]
  ];
  for (const [path, want] of pages) {
    const { res } = await req("GET", path);
    check(`GET ${path} → ${want}`, res.status === want, `got ${res.status}`);
  }

  const gated = ["/dashboard", "/email", "/cron", "/form", "/webhook"];
  for (const path of gated) {
    const { res } = await req("GET", path);
    check(`GET ${path} → 307 (auth gate)`, res.status === 307, `got ${res.status}`);
  }

  const apiGates = [
    ["GET", "/api/auth/me"], ["GET", "/api/cron"], ["GET", "/api/form"],
    ["POST", "/api/email"], ["POST", "/api/webhook"]
  ];
  for (const [method, path] of apiGates) {
    const { res } = await req(method, path, { body: method === "POST" ? {} : undefined });
    check(`${method} ${path} unauthenticated → 401`, res.status === 401, `got ${res.status}`);
  }

  const a = uniqueUser();
  const b = uniqueUser();

  const signupA = await req("POST", "/api/auth/signup", { body: a });
  check("signup user A → 201", signupA.res.status === 201 && signupA.json?.ok === true, `got ${signupA.res.status}`);
  const cookieA = signupA.cookie;
  check("signup sets av_session cookie", Boolean(cookieA));

  const dup = await req("POST", "/api/auth/signup", { body: a });
  check("duplicate signup → 409", dup.res.status === 409, `got ${dup.res.status}`);

  const me = await req("GET", "/api/auth/me", { cookie: cookieA });
  check("GET /api/auth/me with session → 200", me.res.status === 200 && me.json?.user?.email === a.email);

  const badLogin = await req("POST", "/api/auth/login", { body: { email: a.email, password: "Wrong-Pass-123!" } });
  check("login wrong password → 401", badLogin.res.status === 401, `got ${badLogin.res.status}`);

  const goodLogin = await req("POST", "/api/auth/login", { body: a });
  check("login correct password → 200", goodLogin.res.status === 200 && Boolean(goodLogin.cookie));

  const evilOrigin = await req("POST", "/api/auth/signup", {
    body: uniqueUser(),
    origin: "https://evil.example"
  });
  check("signup with foreign Origin → 403 cross_site", evilOrigin.res.status === 403 && evilOrigin.json?.code === "cross_site", `got ${evilOrigin.res.status}`);

  const signupB = await req("POST", "/api/auth/signup", { body: b });
  const cookieB = signupB.cookie;

  const cronCreate = await req("POST", "/api/cron", {
    cookie: cookieA,
    body: { name: "smoke job", schedule: "*/5 * * * *", action: { type: "log" } }
  });
  check("cron create → 201", cronCreate.res.status === 201 && cronCreate.json?.ok === true, `got ${cronCreate.res.status}`);
  const jobId = cronCreate.json?.job?.id;

  const cronListA = await req("GET", "/api/cron", { cookie: cookieA });
  check("cron list (A) contains job", Array.isArray(cronListA.json?.jobs) && cronListA.json.jobs.some((j) => j.id === jobId));
  check("cron scheduler reports in-process honestly", cronListA.json?.scheduler !== undefined && JSON.stringify(cronListA.json.scheduler).length > 0, JSON.stringify(cronListA.json?.scheduler));

  const cronListB = await req("GET", "/api/cron", { cookie: cookieB });
  check("cron list (B) does NOT contain A's job", Array.isArray(cronListB.json?.jobs) && !cronListB.json.jobs.some((j) => j.id === jobId));

  const cronPatchB = await req("PATCH", "/api/cron", { cookie: cookieB, body: { id: jobId, enabled: false } });
  check("cron PATCH by non-owner B → 404", cronPatchB.res.status === 404, `got ${cronPatchB.res.status}`);

  const cronPatchA = await req("PATCH", "/api/cron", { cookie: cookieA, body: { id: jobId, name: "smoke job v2" } });
  check("cron PATCH by owner A → 200", cronPatchA.res.status === 200 && cronPatchA.json?.job?.name === "smoke job v2");

  const cronRun = await req("POST", "/api/cron", { cookie: cookieA, body: { action: "run", id: jobId } });
  check("cron run-now → 200", cronRun.res.status === 200 && cronRun.json?.ok === true, `got ${cronRun.res.status}`);

  const cronDeleteB = await req("DELETE", "/api/cron", { cookie: cookieB, body: { id: jobId } });
  check("cron DELETE by non-owner B → 404", cronDeleteB.res.status === 404, `got ${cronDeleteB.res.status}`);

  const cronDeleteA = await req("DELETE", "/api/cron", { cookie: cookieA, body: { id: jobId } });
  check("cron DELETE by owner A → 200", cronDeleteA.res.status === 200 && cronDeleteA.json?.ok === true);

  const cronBadSchedule = await req("POST", "/api/cron", {
    cookie: cookieA,
    body: { name: "bad", schedule: "99 * * * *", action: { type: "log" } }
  });
  check("cron invalid schedule → 400", cronBadSchedule.res.status === 400, `got ${cronBadSchedule.res.status}`);

  const formGet = await req("GET", "/api/form", { cookie: cookieA });
  check("form GET schema → 200", formGet.res.status === 200 && Array.isArray(formGet.json?.schema?.fields));
  check("form followup reported honestly", formGet.json && typeof formGet.json.followupConfigured === "boolean",
    formGet.json?.followupConfigured ? "configured" : "not_configured");

  const formBad = await req("POST", "/api/form", { cookie: cookieA, body: { values: { name: "", email: "nope", message: "" } } });
  check("form invalid submission → 422", formBad.res.status === 422, `got ${formBad.res.status}`);

  const formOk = await req("POST", "/api/form", {
    cookie: cookieA,
    body: { values: { name: "Smoke Tester", email: "smoke@example.com", message: "Automated smoke submission." } }
  });
  check("form valid submission → 201", formOk.res.status === 201 && formOk.json?.ok === true, `got ${formOk.res.status}`);
  check("form followup result reported honestly", formOk.json?.followup && typeof formOk.json.followup.executed === "boolean",
    JSON.stringify(formOk.json?.followup));

  const formSubs = await req("GET", "/api/form?submissions=1", { cookie: cookieA });
  check("form submissions read-back contains submission", Array.isArray(formSubs.json?.submissions) && formSubs.json.submissions.length > 0);

  const formCross = await req("GET", "/api/form?submissions=1", { cookie: cookieB });
  check("form schema shared (single-deployment limitation, documented)", formCross.res.status === 200);

  const webhookLoopback = await req("POST", "/api/webhook", {
    cookie: cookieA,
    body: { url: "http://127.0.0.1:9/hook", method: "POST", body: "{}" }
  });
  check("webhook loopback target → 400 SSRF-blocked", webhookLoopback.res.status === 400, `got ${webhookLoopback.res.status}`);

  const webhookBad = await req("POST", "/api/webhook", { cookie: cookieA, body: { url: "not-a-url" } });
  check("webhook malformed url → 400", webhookBad.res.status === 400, `got ${webhookBad.res.status}`);

  const emailUnconfigured = await req("POST", "/api/email", {
    cookie: cookieA,
    body: { to: "smoke@example.com", subject: "Smoke", message: "Body", language: "english" }
  });
  const emCode = emailUnconfigured.json?.code;
  // Honest outcomes: 200 (provider accepted), 503 not_configured (no key),
  // or 502 with a mapped provider code (e.g. auth_failed when the sender
  // domain is unverified on the provider side) — never a fake success.
  check(
    "email send reported honestly (accepted / not_configured / provider-blocked)",
    emailUnconfigured.res.status === 200 ||
      (emailUnconfigured.res.status === 503 && emCode === "not_configured") ||
      (emailUnconfigured.res.status === 502 && Boolean(emCode)),
    `got ${emailUnconfigured.res.status}${emCode ? ` code=${emCode}` : ""}`
  );

  const emailBad = await req("POST", "/api/email", {
    cookie: cookieA,
    body: { to: "not-an-email", subject: "", message: "" }
  });
  check("email invalid input → 400", emailBad.res.status === 400, `got ${emailBad.res.status}`);

  const resetReq = await req("POST", "/api/auth/reset", { body: { mode: "request", email: a.email } });
  check(
    "password reset request reported honestly (200 sent / 503 blocked with code)",
    resetReq.res.status === 200 ||
      (resetReq.res.status === 503 && Boolean(resetReq.json?.code)),
    `got ${resetReq.res.status}${resetReq.json?.code ? ` code=${resetReq.json.code}` : ""}`
  );

  console.log("\nLive /api/propose (up to 60s)...");
  const propose = await req("POST", "/api/propose", {
    body: {
      request: "Email a short weekly summary of new signups to the team lead every Friday.",
      context: "The team lead prefers concise bullet points."
    }
  });
  const pStatus = propose.res.status;
  if (pStatus === 200 && propose.json?.ok === true) {
    const p = propose.json.proposal || {};
    check("propose live → 200 structured proposal", Array.isArray(p.plan) && p.plan.length > 0,
      `model=${propose.json.meta?.model} steps=${p.plan?.length} valid=${propose.json.validation?.valid}`);
    check("propose separates model text from deterministic meta", Boolean(propose.json.meta?.grounding) && Boolean(propose.json.meta?.limitations));
  } else if (pStatus === 429 && propose.json?.error === "rate_limited") {
    check("propose live → 429 rate_limited surfaced honestly", true, `retryable=${propose.json.retryable}`);
  } else if (pStatus === 502 && propose.json?.ok === false) {
    check("propose live → 502 provider failure mapped honestly", true, `error=${propose.json.error}`);
  } else if (pStatus === 503 && propose.json?.error === "missing_environment_variable") {
    check("propose live → key missing but expected configured", false, "OPENROUTER_API_KEY not visible to server");
  } else {
    check("propose live → unexpected response", false, `status=${pStatus}`);
  }

  return { email: a.email, password: a.password };
}

async function loginOnly(email, password) {
  const cookie = await login({ email, password });
  check("restart persistence: original user can log in again", Boolean(cookie));
}

const args = process.argv.slice(2);
if (args[0] === "--login-only") {
  const [, email, password] = args;
  await loginOnly(email, password);
} else {
  const user = await fullBattery();
  if (user) console.log(`\n(throwaway user: ${user.email} — password stored only in this shell session)`);
}

console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures === 0 ? 0 : 1);
