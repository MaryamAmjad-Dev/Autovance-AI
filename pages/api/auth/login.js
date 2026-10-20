// POST /api/auth/login — verify credentials and start a session.
// Generic failure message: never reveals whether an email exists.

import { validateLogin } from "../../../lib/validate.js";
import {
  findUserByEmail,
  verifyPassword,
  verifyPasswordDummy,
  createSession,
  sessionCookie,
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

  // Brute-force damper (scrypt already slows each guess; this caps volume).
  const limited = rateLimitGuard(req, res, { name: "auth-login", limit: 10, windowMs: 60000 });
  if (limited) return limited;

  const { ok, errors, value } = validateLogin(req.body || {});
  if (!ok) {
    return res.status(400).json({ ok: false, errors, message: "Please fix the highlighted fields." });
  }

  const user = await findUserByEmail(value.email);
  // Unknown accounts still pay the full scrypt cost, so response time does
  // not reveal whether an email is registered.
  const passwordOk = user
    ? await verifyPassword(value.password, user.passwordHash)
    : await verifyPasswordDummy(value.password);

  if (!user || !passwordOk) {
    return res.status(401).json({
      ok: false,
      errors: { form: "Email or password is incorrect." },
      message: "Email or password is incorrect."
    });
  }

  const token = await createSession(user.email);
  res.setHeader("Set-Cookie", sessionCookie(token, req));
  return res.status(200).json({
    ok: true,
    user: { name: user.name, email: user.email }
  });
}
