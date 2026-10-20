// Simple in-memory fixed-window rate limiter. No dependencies.
//
// Where it is used: authentication endpoints (login, signup, reset), the
// public AI endpoints (/api/ai, /api/propose) which spend provider quota, and
// email sending (provider quota). All return 429 with Retry-After.
//
// Honest limitations (documented, not hidden):
//   - Counters live in this process only. A multi-process or serverless
//     deployment enforces the limit per process, not globally.
//   - The client key uses the first X-Forwarded-For value when present
//     (correct behind a trusted proxy such as Vercel) and the socket address
//     otherwise. A direct-to-Node attacker can vary that header, so this is a
//     brute-force damper, not a security boundary.

const buckets = new Map();
const MAX_BUCKETS = 5000;

function clientIp(req) {
  const fwd = req && req.headers && req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim()) return fwd.split(",")[0].trim();
  return (req && req.socket && req.socket.remoteAddress) || "unknown";
}

function sweep(now) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Record one hit against `key`. Returns { allowed, remaining, resetAt }. */
export function rateLimit(key, { limit, windowMs, now = Date.now() }) {
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: 1 <= limit, remaining: Math.max(0, limit - 1), resetAt };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

/** Clear all counters (tests only). */
export function resetRateLimits() {
  buckets.clear();
}

/**
 * Guard helper for route handlers. Returns null when the request may proceed,
 * otherwise a finished res.status(...).json(...) response (429) already sent.
 */
export function rateLimitGuard(req, res, { name, limit, windowMs }) {
  const result = rateLimit(`${name}:${clientIp(req)}`, { limit, windowMs });
  if (result.allowed) return null;
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  res.setHeader("Retry-After", String(retryAfter));
  res.status(429).json({
    ok: false,
    code: "rate_limited",
    retryable: true,
    retry_after: retryAfter,
    message: `Too many requests. Please wait ${retryAfter} seconds and try again.`
  });
  return res; // sentinel: caller returns this
}
