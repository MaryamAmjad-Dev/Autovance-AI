// POST /api/auth/logout — revoke the current session and clear the cookie.

import {
  tokenFromRequest,
  destroySession,
  clearSessionCookie,
  isCrossSiteRequest
} from "../../../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  if (isCrossSiteRequest(req)) {
    return res.status(403).json({ ok: false, code: "cross_site", message: "Cross-site request blocked." });
  }

  await destroySession(tokenFromRequest(req));
  res.setHeader("Set-Cookie", clearSessionCookie(req));
  return res.status(200).json({ ok: true });
}
