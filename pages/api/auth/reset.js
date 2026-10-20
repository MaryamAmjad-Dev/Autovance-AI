// POST /api/auth/reset — password reset request and confirmation.
//
//   { mode: "request", email }           -> start a reset
//   { mode: "confirm", token, password } -> finish a reset
//
// If no email provider is configured (see lib/emailSender), the request is
// answered with 503 + the names of the missing variables — we never pretend a
// reset email was sent.

import { isEmail, passwordIssues } from "../../../lib/validate.js";
import {
  requestPasswordReset,
  resetPasswordWithToken,
  isCrossSiteRequest
} from "../../../lib/auth.js";
import { rateLimitGuard } from "../../../lib/rateLimit.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  if (isCrossSiteRequest(req)) {
    return res.status(403).json({ ok: false, code: "cross_site", message: "Cross-site request blocked." });
  }

  // Reset flows are unauthenticated by design, so cap request volume per IP
  // (protects the email provider quota and makes token guessing noisy).
  const limited = rateLimitGuard(req, res, { name: "auth-reset", limit: 5, windowMs: 60000 });
  if (limited) return limited;

  const body = req.body || {};
  const mode = body.mode === "confirm" ? "confirm" : body.mode === "request" ? "request" : null;

  if (!mode) {
    return res.status(400).json({ ok: false, message: 'Mode must be "request" or "confirm".' });
  }

  if (mode === "request") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!isEmail(email)) {
      return res.status(400).json({
        ok: false,
        errors: { email: "Enter a valid email address." },
        message: "Invalid email."
      });
    }
    const result = await requestPasswordReset(email, req);
    if (!result.ok) {
      return res.status(503).json({
        ok: false,
        code: result.code,
        missing: result.missing,
        message: result.message
      });
    }
    return res.status(200).json({ ok: true, message: result.message });
  }

  // confirm
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const issues = passwordIssues(body.password);
  if (typeof body.confirm !== "string" || body.confirm !== body.password) {
    return res.status(400).json({
      ok: false,
      errors: { confirm: "Passwords do not match." },
      message: "Please fix the highlighted fields."
    });
  }
  if (issues.length > 0) {
    return res.status(400).json({
      ok: false,
      errors: { password: issues[0] },
      message: "Please fix the highlighted fields."
    });
  }

  const result = await resetPasswordWithToken(token, body.password);
  if (!result.ok) {
    const status = result.code === "expired" ? 410 : 400;
    return res.status(status).json({ ok: false, code: result.code, message: result.message });
  }
  return res.status(200).json({ ok: true, message: result.message });
}
