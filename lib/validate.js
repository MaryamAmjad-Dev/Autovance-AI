// Shared input validation used by API routes (server-side re-validation is
// authoritative; the UI mirrors these rules for fast feedback).

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Hop-by-hop / request-smuggling headers a caller must never set on our
// behalf. `host` is also blocked so requests cannot be aimed at internal
// virtual hosts.
const FORBIDDEN_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "expect",
  "te",
  "trailer",
  "via",
  "proxy-authorization",
  "proxy-authenticate",
  "proxy-connection"
]);

export function isEmail(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return v.length > 0 && v.length <= 254 && EMAIL_RE.test(v);
}

/** Password policy: at least 8 chars with a letter and a digit. */
export function passwordIssues(password) {
  const issues = [];
  if (typeof password !== "string" || password.length < 8) {
    issues.push("Password must be at least 8 characters long.");
  }
  if (typeof password === "string" && !/[a-zA-Z]/.test(password)) {
    issues.push("Password must contain at least one letter.");
  }
  if (typeof password === "string" && !/[0-9]/.test(password)) {
    issues.push("Password must contain at least one number.");
  }
  if (typeof password === "string" && password.length > 200) {
    issues.push("Password must be at most 200 characters long.");
  }
  return issues;
}

function str(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function validateSignup({ name, email, password, confirm } = {}) {
  const errors = {};
  const cleanName = str(name, 80);
  const cleanEmail = str(email, 254).toLowerCase();

  if (!cleanName) errors.name = "Name is required.";
  else if (cleanName.length < 2) errors.name = "Name must be at least 2 characters.";

  if (!cleanEmail) errors.email = "Email is required.";
  else if (!isEmail(cleanEmail)) errors.email = "Enter a valid email address.";

  const pwIssues = passwordIssues(password);
  if (pwIssues.length > 0) errors.password = pwIssues[0];
  if (typeof confirm !== "string" || confirm !== password) {
    errors.confirm = "Passwords do not match.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { name: cleanName, email: cleanEmail, password }
  };
}

export function validateLogin({ email, password } = {}) {
  const errors = {};
  const cleanEmail = str(email, 254).toLowerCase();
  if (!cleanEmail) errors.email = "Email is required.";
  else if (!isEmail(cleanEmail)) errors.email = "Enter a valid email address.";
  if (typeof password !== "string" || password.length === 0) {
    errors.password = "Password is required.";
  } else if (password.length > 200) {
    errors.password = "Password is too long.";
  }
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { email: cleanEmail, password }
  };
}

/**
 * Validate webhook invocation input.
 * Returns { ok, errors, value } where value is normalized:
 *   { url, method, headers (object), body (string|null) }
 */
export function validateWebhookInput(input = {}) {
  const errors = {};

  const url = typeof input.url === "string" ? input.url.trim() : "";
  if (!url) errors.url = "Webhook URL is required.";
  else if (url.length > 2048) errors.url = "URL is too long (max 2048 characters).";

  const method =
    typeof input.method === "string" && input.method
      ? input.method.toUpperCase()
      : "POST";
  if (!HTTP_METHODS.includes(method)) {
    errors.method = `Method must be one of: ${HTTP_METHODS.join(", ")}.`;
  }

  // Headers: accept an object, or a JSON string that parses to an object.
  let rawHeaders = input.headers;
  if (typeof rawHeaders === "string") {
    const trimmed = rawHeaders.trim();
    if (trimmed) {
      try {
        rawHeaders = JSON.parse(trimmed);
      } catch {
        errors.headers = "Headers must be valid JSON in the form {\"X-Key\": \"value\"}.";
        rawHeaders = null;
      }
    } else {
      rawHeaders = {};
    }
  }
  if (rawHeaders === undefined || rawHeaders === null) rawHeaders = {};
  if (typeof rawHeaders !== "object" || Array.isArray(rawHeaders)) {
    if (!errors.headers) errors.headers = "Headers must be a JSON object.";
    rawHeaders = {};
  }

  const headers = {};
  if (!errors.headers) {
    const entries = Object.entries(rawHeaders);
    if (entries.length > 20) {
      errors.headers = "Too many headers (max 20).";
    } else {
      for (const [key, value] of entries) {
        const name = String(key).trim();
        if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$/.test(name)) {
          errors.headers = `Invalid header name: "${name.slice(0, 40)}".`;
          break;
        }
        if (FORBIDDEN_HEADERS.has(name.toLowerCase())) {
          errors.headers = `Header "${name}" is not allowed.`;
          break;
        }
        if (typeof value !== "string" || value.length > 1024 || /[\r\n]/.test(value)) {
          errors.headers = `Header "${name}" must be a single-line string up to 1024 chars.`;
          break;
        }
        headers[name] = value;
      }
    }
  }

  // Body: optional; when present it must be a JSON document (the UI is a
  // JSON payload editor) and is forwarded verbatim as a string.
  let body = null;
  if (input.body !== undefined && input.body !== null && input.body !== "") {
    const raw = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
    if (raw.length > 20000) {
      errors.body = "Payload is too large (max 20000 characters).";
    } else {
      try {
        JSON.parse(raw);
        body = raw;
      } catch {
        errors.body = "Payload must be valid JSON.";
      }
    }
  }

  if (body !== null && (method === "GET" || method === "DELETE")) {
    errors.body = `${method} requests cannot include a payload.`;
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { url, method, headers, body }
  };
}
