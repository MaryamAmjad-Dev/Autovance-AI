// Minimal, honest authentication on top of the JSON store.
//
// - Passwords are hashed with scrypt (built-in crypto, no dependencies);
//   plaintext passwords are never stored or logged.
// - Sessions are server-side records addressed by a random token that lives
//   only in an httpOnly cookie, so there is no signing secret to manage and
//   logout genuinely revokes the session.
// - Password reset tokens are single-use, expire after 30 minutes, and are
//   stored hashed. Delivery depends on an email provider (see lib/emailSender);
//   when none is configured the API reports that honestly instead of pretending.

import crypto from "crypto";
import { store } from "./store.js";
import { emailProviderConfig, sendEmail } from "./emailSender.js";

export const SESSION_COOKIE = "av_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes

const scryptAsync = (password, salt, keylen, opts) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, opts, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scryptAsync(password, salt, 64, SCRYPT_OPTS);
  return `scrypt$${SCRYPT_OPTS.N}$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [algo, n, salt, hex] = String(stored).split("$");
    if (algo !== "scrypt" || !salt || !hex) return false;
    const expected = Buffer.from(hex, "hex");
    if (expected.length === 0) return false;
    const actual = await scryptAsync(password, salt, expected.length, {
      ...SCRYPT_OPTS,
      N: Number(n) || SCRYPT_OPTS.N
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// A fixed dummy hash so that verifying a password for a NON-EXISTENT account
// costs the same scrypt work as a real verification. Without this, responses
// for unknown emails are measurably faster and leak which addresses exist.
// The salt is all zeros purely as a placeholder; it is never a stored secret.
const DUMMY_PASSWORD_HASH = `scrypt$${SCRYPT_OPTS.N}$${"00".repeat(16)}$${"00".repeat(64)}`;

export async function verifyPasswordDummy(password) {
  return verifyPassword(password, DUMMY_PASSWORD_HASH);
}

export const hashToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

export const newToken = () => crypto.randomBytes(32).toString("hex");

// ---------------------------------------------------------------- users

export function findUserByEmail(email) {
  const users = store().read("users", []);
  const target = String(email).toLowerCase();
  return users.find((u) => u.email === target) || null;
}

export async function createUser({ name, email, password }) {
  const target = String(email).toLowerCase();
  // Cheap pre-check for the common case (fast rejection)…
  const pre = store().read("users", []);
  if (pre.some((u) => u.email === target)) {
    return { ok: false, code: "email_taken" };
  }
  const passwordHash = await hashPassword(password);
  // …then a synchronous read/check/write with no awaits in between, so two
  // concurrent signups cannot both pass a stale read and clobber each other
  // (the second one re-checks the freshly read array).
  const users = store().read("users", []);
  if (users.some((u) => u.email === target)) {
    return { ok: false, code: "email_taken" };
  }
  const user = {
    id: crypto.randomUUID(),
    name,
    email: target,
    passwordHash,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  store().write("users", users);
  return { ok: true, user: publicUser(user) };
}

export const publicUser = (user) =>
  user ? { name: user.name, email: user.email } : null;

// ------------------------------------------------------------- sessions

export function createSession(email) {
  const token = newToken();
  const sessions = store().read("sessions", {});
  sessions[hashToken(token)] = {
    email: String(email).toLowerCase(),
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  store().write("sessions", sessions);
  return token;
}

export function getSessionUser(rawToken) {
  if (!rawToken) return null;
  const s = store().read("sessions", {});
  const record = s[hashToken(rawToken)];
  if (!record) return null;
  if (record.expiresAt < Date.now()) {
    delete s[hashToken(rawToken)];
    store().write("sessions", s);
    return null;
  }
  return publicUser(findUserByEmail(record.email));
}

export function destroySession(rawToken) {
  if (!rawToken) return;
  const s = store().read("sessions", {});
  delete s[hashToken(rawToken)];
  store().write("sessions", s);
}

export function destroySessionsFor(email) {
  const s = store().read("sessions", {});
  const target = String(email).toLowerCase();
  for (const [key, record] of Object.entries(s)) {
    if (record.email === target) delete s[key];
  }
  store().write("sessions", s);
}

// -------------------------------------------------------------- cookies

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      out[key] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

export function getUserFromRequest(req) {
  const cookies = parseCookies(req && req.headers && req.headers.cookie);
  return getSessionUser(cookies[SESSION_COOKIE]);
}

export function tokenFromRequest(req) {
  const cookies = parseCookies(req && req.headers && req.headers.cookie);
  return cookies[SESSION_COOKIE] || null;
}

function isLocalHost(req) {
  const host = (req && req.headers && req.headers.host) || "";
  // Exact hostname match (a bare substring test would let
  // "localhost.attacker.tld" count as local).
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
}

function forwardedIsHttps(req) {
  const raw = req && req.headers && req.headers["x-forwarded-proto"];
  if (!raw) return false;
  return String(raw).split(",")[0].trim().toLowerCase() === "https";
}

/**
 * Secure flag: set whenever the request arrived over HTTPS (per the proxy
 * header, which can only ever ADD security, never remove it) or, outside
 * development, whenever the host is not exactly localhost. Trusting this
 * header only in the secure direction avoids both the spoofable "any localhost
 * substring" downgrade and missing Secure behind TLS-terminating proxies.
 */
function cookieShouldBeSecure(req) {
  if (forwardedIsHttps(req)) return true;
  if (process.env.NODE_ENV !== "production") return false;
  return !isLocalHost(req);
}

export function sessionCookie(token, req) {
  const secure = cookieShouldBeSecure(req);
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    secure ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSessionCookie(req) {
  const secure = cookieShouldBeSecure(req);
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    secure ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * Same-origin guard for state-changing auth endpoints (login-CSRF). Browsers
 * send Origin on cross-origin POSTs, so a present Origin must match this
 * host; clients that send no Origin (curl, native apps) are allowed.
 * Returns true when the request looks cross-site.
 */
export function isCrossSiteRequest(req) {
  const origin = req && req.headers && req.headers.origin;
  if (!origin) return false;
  const host = req && req.headers && req.headers.host;
  try {
    return new URL(String(origin)).host !== String(host || "");
  } catch {
    return true; // unparsable Origin: treat as cross-site
  }
}

// ------------------------------------------------------- password reset

export function createResetToken(email) {
  const token = newToken();
  const tokens = store().read("reset-tokens", {});
  tokens[hashToken(token)] = {
    email: String(email).toLowerCase(),
    expiresAt: Date.now() + RESET_TTL_MS
  };
  store().write("reset-tokens", tokens);
  return token;
}

/**
 * Base URL for links sent by email. In production this MUST come from
 * APP_BASE_URL: the Host / X-Forwarded-* headers are client-influenced and
 * must not decide the domain of an email carrying a single-use reset token
 * (Host-header poisoning would deliver a valid token to an attacker domain).
 * In development only, the request headers are used as a convenience.
 * Returns null when no trustworthy base URL can be determined.
 */
export function appBaseUrl(req) {
  const configured = typeof process.env.APP_BASE_URL === "string" ? process.env.APP_BASE_URL.trim() : "";
  if (configured) {
    if (/^https?:\/\/[^/\s]+/i.test(configured)) return configured.replace(/\/+$/, "");
    return null; // misconfigured value: never silently fall back to headers
  }
  if (process.env.NODE_ENV === "production") return null;
  const host = (req && req.headers && req.headers.host) || "localhost:3000";
  const proto = (req && req.headers && req.headers["x-forwarded-proto"]) || "http";
  return `${proto}://${host}`;
}

/**
 * Start a reset request. Returns:
 *   { ok: true,  message }                      — email actually accepted by provider
 *   { ok: false, code: "not_configured", ... }  — no provider configured (or no
 *                                                 trustworthy base URL in production)
 *   { ok: true,  message }                      — unknown email (no enumeration;
 *                                                  only when provider is configured)
 */
export async function requestPasswordReset(email, req) {
  const provider = emailProviderConfig();
  if (!provider.name) {
    return {
      ok: false,
      code: "not_configured",
      missing: provider.missing,
      message:
        "Password-reset emails cannot be sent because no email provider is configured."
    };
  }

  // Checked BEFORE the user lookup so a missing base URL affects every request
  // equally and cannot be used to probe which addresses exist.
  const base = appBaseUrl(req);
  if (!base) {
    return {
      ok: false,
      code: "not_configured",
      missing: ["APP_BASE_URL"],
      message:
        "Password-reset emails need the APP_BASE_URL environment variable set to the public URL of this deployment."
    };
  }

  const user = findUserByEmail(email);
  if (!user) {
    // Do not reveal whether the address exists.
    return {
      ok: true,
      message: "If that email has an account, a reset link has been sent."
    };
  }

  const token = createResetToken(user.email);
  const link = `${base}/reset-confirm?token=${token}`;

  const sent = await sendEmail({
    to: user.email,
    subject: "Reset your Autovance AI password",
    text:
      `Hello ${user.name},\n\n` +
      `Use the link below within 30 minutes to choose a new password:\n${link}\n\n` +
      `If you did not request this, you can ignore this email.`
  });

  if (!sent.ok) {
    return { ok: false, code: sent.code, detail: sent.detail, message: sent.message };
  }
  return {
    ok: true,
    message: "If that email has an account, a reset link has been sent."
  };
}

export async function resetPasswordWithToken(token, newPassword) {
  if (!token || typeof token !== "string" || token.length > 200) {
    return { ok: false, code: "invalid_token", message: "Reset link is invalid." };
  }
  const key = hashToken(token);

  // Synchronous pre-checks so the caller gets the accurate error.
  const preTokens = store().read("reset-tokens", {});
  const preRecord = preTokens[key];
  if (!preRecord) {
    return { ok: false, code: "invalid_token", message: "Reset link is invalid or already used." };
  }
  if (preRecord.expiresAt < Date.now()) {
    delete preTokens[key];
    store().write("reset-tokens", preTokens);
    return { ok: false, code: "expired", message: "Reset link has expired. Request a new one." };
  }

  // Hash BEFORE the authoritative check so everything below runs as one
  // synchronous read/validate/write block. An earlier version awaited the hash
  // between reading and writing, which let two concurrent confirms with the
  // same token both pass the single-use check.
  const passwordHash = await hashPassword(newPassword);

  const tokens = store().read("reset-tokens", {});
  const record = tokens[key];
  if (!record) {
    return { ok: false, code: "invalid_token", message: "Reset link is invalid or already used." };
  }
  if (record.expiresAt < Date.now()) {
    delete tokens[key];
    store().write("reset-tokens", tokens);
    return { ok: false, code: "expired", message: "Reset link has expired. Request a new one." };
  }

  const users = store().read("users", []);
  const user = users.find((u) => u.email === record.email);
  if (!user) {
    delete tokens[key];
    store().write("reset-tokens", tokens);
    return { ok: false, code: "invalid_token", message: "Reset link is invalid." };
  }

  user.passwordHash = passwordHash;
  store().write("users", users);
  delete tokens[key];
  store().write("reset-tokens", tokens);
  destroySessionsFor(user.email); // force re-login everywhere

  return { ok: true, message: "Password updated. You can now log in." };
}
