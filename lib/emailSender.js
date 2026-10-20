// Email delivery via a real provider API, using the built-in fetch — no new
// dependencies.
//
// Supported providers (first match wins):
//   - Resend     : RESEND_API_KEY  + EMAIL_FROM
//   - SendGrid   : SENDGRID_API_KEY + EMAIL_FROM
//
// When neither is configured, sendEmail() reports not_configured and names
// the missing variables. Nothing is ever "pretend sent": success is only
// reported when the provider's API returns a success status.

export function emailProviderConfig() {
  if (process.env.RESEND_API_KEY) {
    return { name: "resend", envVar: "RESEND_API_KEY", missing: [] };
  }
  if (process.env.SENDGRID_API_KEY) {
    return { name: "sendgrid", envVar: "SENDGRID_API_KEY", missing: [] };
  }
  return { name: null, envVar: null, missing: ["RESEND_API_KEY or SENDGRID_API_KEY"] };
}

export function emailConfigStatus() {
  const provider = emailProviderConfig();
  const missing = [...provider.missing];
  if (provider.name && !process.env.EMAIL_FROM) missing.push("EMAIL_FROM");
  return {
    configured: provider.name !== null && Boolean(process.env.EMAIL_FROM),
    provider: provider.name,
    missing
  };
}

const truncate = (s, n = 300) =>
  String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

// Defense-in-depth: provider error bodies are unreviewed third-party content.
// Strip anything credential-shaped before it can reach a client or a log.
const sanitizeDetail = (s) =>
  truncate(s)
    .replace(/\b(sk|re|sg|rk)-[A-Za-z0-9_\-]{8,}/g, "[redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bapi[_-]?key["':\s]+\S+/gi, "api_key=[redacted]");

/**
 * Send an email. `html` is optional (used for RTL direction wrapping); when
 * present it is sent alongside the plain-text part. Returns:
 *   { ok: true,  provider, message }
 *   { ok: false, code: "not_configured" | "rate_limited" | "auth_failed"
 *               | "provider_error", missing?, detail?, message }
 * Success means only that the provider's API ACCEPTED the request; delivery
 * itself is asynchronous and is never claimed as confirmed.
 */
export async function sendEmail({ to, subject, text, html }) {
  const status = emailConfigStatus();
  if (!status.configured) {
    return {
      ok: false,
      code: "not_configured",
      missing: status.missing,
      message:
        "Email sending is not configured on this server, so nothing was sent. " +
        `Set ${status.missing.join(" and ")} to enable it.`
    };
  }

  const from = process.env.EMAIL_FROM;
  const provider = emailProviderConfig();

  let endpoint;
  let payload;
  let headers;

  if (provider.name === "resend") {
    endpoint = "https://api.resend.com/emails";
    headers = { Authorization: `Bearer ${process.env.RESEND_API_KEY}` };
    payload = { from, to: [to], subject, text, ...(html ? { html } : {}) };
  } else {
    endpoint = "https://api.sendgrid.com/v3/mail/send";
    headers = { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}` };
    payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [
        { type: "text/plain", value: text },
        ...(html ? [{ type: "text/html", value: html }] : [])
      ]
    };
  }

  // Manual abort timer: works on every runtime (AbortSignal.timeout requires
  // newer Node) and is always cleared, so no request can hang forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (err) {
    const aborted = err && (err.name === "AbortError" || err.name === "TimeoutError");
    return {
      ok: false,
      code: "provider_error",
      detail: aborted
        ? `${provider.name} request timed out after 15s`
        : `Network error calling ${provider.name}: ${sanitizeDetail((err && err.message) || "connection failed")}`,
      message: aborted
        ? `The ${provider.name} API did not respond in time; the email was NOT sent.`
        : `The ${provider.name} API could not be reached; the email was NOT sent.`
    };
  } finally {
    clearTimeout(timer);
  }

  // SendGrid returns 202 with an empty body; Resend returns 200 with {id}.
  if (res.status >= 200 && res.status < 300) {
    return {
      ok: true,
      provider: provider.name,
      message: `${provider.name} accepted the email (HTTP ${res.status}). Delivery is asynchronous.`
    };
  }

  let detail = "";
  try {
    detail = sanitizeDetail(await res.text());
  } catch {
    /* ignore */
  }

  if (res.status === 429) {
    return {
      ok: false,
      code: "rate_limited",
      detail: `HTTP 429${detail ? `: ${detail}` : ""}`,
      message: `${provider.name} rate limited the request (HTTP 429); the email was NOT sent. Wait a moment and try again.`
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      code: "auth_failed",
      detail: `HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
      message: `${provider.name} rejected the credentials (HTTP ${res.status}). Check ${provider.envVar} and EMAIL_FROM.`
    };
  }

  return {
    ok: false,
    code: "provider_error",
    detail: `HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
    message: `${provider.name} rejected the email (HTTP ${res.status}); it was NOT sent.`
  };
}
