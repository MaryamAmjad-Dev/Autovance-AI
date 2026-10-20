// POST /api/email — actually send an email through a configured provider.
//
// Requires a logged-in session. Validation is server-side. A success response
// is only returned when the provider's API accepted the message; when no
// provider is configured the response is 503 naming the missing variables.

import { isEmail } from "../../lib/validate.js";
import { getUserFromRequest } from "../../lib/auth.js";
import { sendEmail, emailConfigStatus } from "../../lib/emailSender.js";
import { getLanguage, buildRtlHtml, EMAIL_LANGUAGES } from "../../lib/emailLanguage.js";
import { rateLimitGuard } from "../../lib/rateLimit.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  if (!getUserFromRequest(req)) {
    return res.status(401).json({ ok: false, error: "Not authenticated. Log in first." });
  }

  // Caps provider-quota consumption and accidental repeated submissions from
  // the same client (the UI also disables the button while a send is running).
  const limited = rateLimitGuard(req, res, { name: "email-send", limit: 10, windowMs: 60000 });
  if (limited) return limited;

  const body = req.body || {};
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  // Optional UI language: unknown ids fall back to English (never an error,
  // the language only affects the optional RTL HTML wrapper).
  const language = EMAIL_LANGUAGES.some((l) => l.id === body.language)
    ? body.language
    : "english";

  const errors = {};
  if (!to) errors.to = "Recipient email is required.";
  else if (!isEmail(to)) errors.to = "Enter a valid recipient email.";
  if (!subject) errors.subject = "Subject is required.";
  else if (subject.length > 200) errors.subject = "Subject must be at most 200 characters.";
  if (!message) errors.message = "Message body is required.";
  else if (message.length > 20000) errors.message = "Message body is too long (max 20000 characters).";

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ ok: false, errors, message: "Please fix the highlighted fields." });
  }

  const status = emailConfigStatus();
  if (!status.configured) {
    // Name the missing configuration instead of pretending anything was sent.
    return res.status(503).json({
      ok: false,
      code: "not_configured",
      missing: status.missing,
      message:
        "Email sending is not configured on this server, so nothing was sent. " +
        `Set ${status.missing.join(" and ")} to enable real delivery.`
    });
  }

  const lang = getLanguage(language);
  // RTL languages get an HTML part with dir="rtl" alongside the plain text so
  // Urdu and mixed Urdu/English content render correctly in mail clients.
  const html = lang.rtl ? buildRtlHtml(message, language) : undefined;

  const result = await sendEmail({ to, subject, text: message, html });
  if (!result.ok) {
    // Provider rate limits pass through as 429 (with honest "not sent" copy);
    // everything else is an upstream/configuration failure on our side.
    const status = result.code === "rate_limited" ? 429 : 502;
    if (status === 429) res.setHeader("Retry-After", "60");
    return res.status(status).json({
      ok: false,
      code: result.code,
      detail: result.detail,
      missing: result.missing,
      retryable: result.code === "rate_limited",
      message: result.message
    });
  }

  return res.status(200).json({ ok: true, provider: result.provider, message: result.message });
}
