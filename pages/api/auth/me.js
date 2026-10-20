// GET /api/auth/me — who is logged in (200) or nobody (401).

import { getUserFromRequest, publicUser } from "../../../lib/auth.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Not authenticated." });
  }
  return res.status(200).json({ ok: true, user: publicUser(user) });
}
