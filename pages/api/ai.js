// Legacy free-text AI endpoint, consumed by /dashboard, /email, and /form.
// Aligned with /api/propose to share the same server-side configuration and
// error-handling conventions, while PRESERVING its original success shape:
//   200 { result: string }
// Failures now return explicit JSON errors instead of a misleading 200.

import { rateLimitGuard } from "../../lib/rateLimit.js";

const DEFAULT_MODEL = "openrouter/free"; // fallback when AI_MODEL is unset; verified in the live catalog 2026-10-20
const MAX_PROMPT_CHARS = 2000;
const UPSTREAM_TIMEOUT_MS = 45000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  // This endpoint spends provider quota and is intentionally reachable without
  // a session (public research pages), so cap it per IP to prevent quota burn.
  const limited = rateLimitGuard(req, res, { name: "ai", limit: 20, windowMs: 60000 });
  if (limited) return limited;

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

  if (!prompt) {
    return res.status(400).json({
      ok: false,
      error: "invalid_request",
      message: "A non-empty 'prompt' string is required.",
    });
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return res.status(400).json({
      ok: false,
      error: "invalid_request",
      message: `'prompt' must be at most ${MAX_PROMPT_CHARS} characters.`,
    });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    // Variable NAME only — never expose values or constructed headers.
    return res.status(503).json({
      ok: false,
      error: "missing_environment_variable",
      variable: "OPENROUTER_API_KEY",
      message: "The AI service is not configured on the server.",
    });
  }

  const model = process.env.AI_MODEL || DEFAULT_MODEL;

  let upstream;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "user", content: prompt }
        ]
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
  } catch (error) {
    // Log only the error message — never the key or request headers.
    console.error("ai: upstream request failed:", error && error.message ? error.message : error);
    return res.status(502).json({
      ok: false,
      error: "upstream_failure",
      message: "Could not reach the AI provider."
    });
  }

  if (!upstream.ok) {
    const s = upstream.status;
    // Drain the error body so the connection is released. The body is never
    // logged or forwarded (no secrets, no unreviewed provider content).
    await upstream.text().catch(() => "");
    console.error("ai: upstream returned status", s);

    if (s === 429) {
      // Rate limiting / capacity (established live on 2026-10-20: free-model
      // upstream shared pool, with the key itself valid and quota unused).
      const retryAfter = upstream.headers.get("retry-after");
      return res.status(429).json({
        ok: false,
        error: "rate_limited",
        retryable: true,
        ...(retryAfter ? { retry_after: retryAfter } : {}),
        message:
          "The AI provider is rate limiting requests (HTTP 429). This may be a rate limit, exhausted free-tier capacity, or provider capacity limits. Please wait a few minutes and try again."
      });
    }
    if (s === 401 || s === 403) {
      return res.status(502).json({
        ok: false,
        error: "auth_failed",
        message: `The AI provider rejected the server credentials (status ${s}). Check the OPENROUTER_API_KEY configuration.`
      });
    }
    if (s === 404) {
      return res.status(502).json({
        ok: false,
        error: "model_not_found",
        message: "The configured AI model was not found (status 404). Check the AI_MODEL configuration."
      });
    }
    return res.status(502).json({
      ok: false,
      error: "upstream_failure",
      message: `The AI provider responded with status ${s}.`
    });
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    return res.status(502).json({
      ok: false,
      error: "upstream_failure",
      message: "The AI provider returned an unreadable response."
    });
  }

  const content =
    data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : "";

  // Legacy response shape expected by existing client pages.
  return res.status(200).json({ result: content || "No response" });
}
