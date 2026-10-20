// POST /api/auth/signup — create an account and start a session.
// No dependencies; password is stored only as a scrypt hash.

import { validateSignup } from "../../../lib/validate.js";
import {
  createUser,
  createSession,
  sessionCookie,
  publicUser,
  findUserByEmail,
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

  // Caps signup floods that would otherwise grow the users table unbounded.
  const limited = rateLimitGuard(req, res, { name: "auth-signup", limit: 10, windowMs: 60000 });
  if (limited) return limited;

  const { ok, errors, value } = validateSignup(req.body || {});
  if (!ok) {
    return res.status(400).json({ ok: false, errors, message: "Please fix the highlighted fields." });
  }

  // Extra existence check with a friendlier message than a race-y duplicate.
  if (await findUserByEmail(value.email)) {
    return res.status(409).json({
      ok: false,
      errors: { email: "An account with this email already exists. Try logging in." },
      message: "Email already registered."
    });
  }

  const created = await createUser(value);
  if (!created.ok) {
    return res.status(409).json({
      ok: false,
      errors: { email: "An account with this email already exists. Try logging in." },
      message: "Email already registered."
    });
  }

  const token = await createSession(value.email);
  res.setHeader("Set-Cookie", sessionCookie(token, req));
  return res.status(201).json({ ok: true, user: publicUser(created.user) });
}
