// POST /api/webhook — invoke an external HTTP endpoint on the user's behalf.
//
// Requires a logged-in session. All input is validated server-side and the
// outbound request goes through lib/safeFetch (SSRF protection: private and
// local targets blocked, unsafe protocols blocked, redirects re-validated,
// timeout + response-size limits). The client never talks to the target
// directly and no credentials exist in browser code.

import { validateWebhookInput } from "../../lib/validate.js";
import { getUserFromRequest } from "../../lib/auth.js";
import { safeFetch, SafeFetchError } from "../../lib/safeFetch.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  if (!(await getUserFromRequest(req))) {
    return res.status(401).json({ ok: false, error: "Not authenticated. Log in first." });
  }

  const { ok, errors, value } = validateWebhookInput(req.body || {});
  if (!ok) {
    return res.status(400).json({ ok: false, errors, message: "Please fix the highlighted fields." });
  }

  try {
    const result = await safeFetch(value.url, {
      method: value.method,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Autovance-AI-Webhook/1.0",
        ...value.headers
      },
      body: value.body,
      timeoutMs: 10000
    });

    return res.status(200).json({
      ok: true,
      result: {
        status: result.status,
        statusText: result.statusText,
        ok: result.ok,
        ms: result.ms,
        redirected: result.redirected,
        truncated: result.truncated,
        contentType: result.contentType,
        body: result.body
      }
    });
  } catch (err) {
    if (err instanceof SafeFetchError) {
      const status = err.code === "blocked" ? 400 : 502;
      return res.status(status).json({
        ok: false,
        code: err.code,
        message: err.message
      });
    }
    return res.status(502).json({
      ok: false,
      code: "failed",
      message: `Webhook failed: ${(err && err.message) || "unknown error"}`
    });
  }
}
