// SSRF-safe outbound HTTP for webhook triggering and cron job execution.
//
// Protections:
//   - only http: and https: (no file:, javascript:, data:, ftp:, ws: …)
//   - no credentials embedded in the URL
//   - blocks localhost / *.localhost / *.local hostnames
//   - resolves the hostname and refuses if ANY resolved address is private,
//     loopback, link-local, metadata, multicast or otherwise non-public
//     (IPv4 and IPv6, including v4-mapped IPv6 addresses)
//   - redirects are NOT followed blindly: redirect: "manual", every hop is
//     re-validated (max 3 hops), so a public URL cannot bounce to an internal
//     one; caller headers are DROPPED when the redirect changes origin
//   - response body read is capped; the request timeout covers headers AND
//     the body read (a slow-drip server cannot hang the caller)
//
// Test seams: safeFetch({ lookup, fetchImpl }) lets automated tests run with
// an offline transport and offline DNS. Production code never sets them.
//
// Known limitation (documented, not silently ignored): between our DNS check
// and the kernel connect(), a hostile resolver could rebind the name to a
// private address (classic DNS-rebinding race). Fully closing that needs a
// custom agent pinning the validated IP, which is not possible cleanly with
// the built-in fetch and no new dependencies.

import dns from "dns/promises";

export class SafeFetchError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "SafeFetchError";
    this.code = code || "blocked";
  }
}

export function isPrivateIPv4(ip) {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // unparseable -> treat as unsafe
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && b === 88) return true; // 192.88.99.0/24 (6to4 relay)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && parts[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

export function isBlockedAddress(ip) {
  // Strip IPv6 brackets: URL.hostname returns literals like "[::1]".
  const addr = String(ip).trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!addr) return true;

  if (addr.includes(":")) {
    return isBlockedIPv6(addr);
  }

  return isPrivateIPv4(addr);
}

/**
 * Parse a full IPv6 address into its 8 16-bit groups (handles "::" compression
 * and a trailing dotted-quad). Returns null when unparseable (treated as
 * unsafe by the caller).
 */
function parseIPv6Groups(input) {
  let addr = String(input);
  // Trailing dotted-quad (e.g. ::ffff:127.0.0.1) -> two hex groups.
  const dotted = addr.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const v4 = dotted[2].split(".").map(Number);
    if (v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hi = (v4[0] << 8) | v4[1];
    const lo = (v4[2] << 8) | v4[3];
    addr = `${dotted[1]}${hi.toString(16)}:${lo.toString(16)}`;
  }

  const side = (s) => {
    if (s === "") return [];
    return s.split(":").map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN));
  };

  const parts = addr.split("::");
  if (parts.length > 2) return null;
  if (parts.length === 2) {
    const head = side(parts[0]);
    const tail = side(parts[1]);
    if (head.includes(NaN) || tail.includes(NaN)) return null;
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    return [...head, ...Array(fill).fill(0), ...tail];
  }
  const all = side(addr);
  if (all.length !== 8 || all.includes(NaN)) return null;
  return all;
}

const v4FromGroups = (hi, lo) =>
  isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);

/**
 * IPv6 blocking, including canonical HEX forms that the older dotted-quad
 * patterns missed: ::ffff:7f00:1 (=127.0.0.1), 64:ff9b::a00:1 (NAT64),
 * 2002:7f00:1:: (6to4), plus deprecated fec0::/10 site-local.
 */
function isBlockedIPv6(addr) {
  const g = parseIPv6Groups(addr);
  if (!g) return true; // unparseable -> unsafe

  // IPv4-mapped (::ffff:a:b) / IPv4-compatible (::a:b): check embedded IPv4.
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && (g[5] === 0xffff || g[5] === 0)) {
    return v4FromGroups(g[6], g[7]);
  }
  // NAT64 64:ff9b::a:b
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return v4FromGroups(g[6], g[7]);
  }
  // 6to4 2002::/16 embeds an IPv4 in groups 1-2.
  if (g[0] === 0x2002) {
    return v4FromGroups(g[1], g[2]);
  }

  const g0 = g[0];
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g0 === 0x2001 && g[1] === 0xdb8) return true; // documentation range
  return false;
}

/**
 * Pure syntax-level validation of a target URL.
 * Returns { ok: true, url: URL } or { ok: false, reason }.
 */
export function validateTargetUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, reason: "URL is empty." };
  }
  const trimmed = raw.trim();
  if (trimmed.length > 2048) {
    return { ok: false, reason: "URL is too long (max 2048 characters)." };
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "URL could not be parsed." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `Protocol "${url.protocol}" is not allowed. Use http(s).` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "Credentials embedded in the URL are not allowed." };
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "URL has no hostname." };

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return { ok: false, reason: `Host "${host}" is a local/private name and is blocked.` };
  }

  // IP literal?
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    if (isBlockedAddress(host)) {
      return { ok: false, reason: `Address "${host}" is private/internal and is blocked.` };
    }
  }

  return { ok: true, url };
}

/** Resolve a hostname and require every address to be public.
 *  `lookup` is injectable so tests can run fully offline. */
export async function assertPublicHost(hostname, lookup) {
  const doLookup = lookup || dns.lookup;
  const host = String(hostname).toLowerCase().replace(/^\[|\]$/g, "");
  let addresses;
  try {
    addresses = await doLookup(host, { all: true, verbatim: true });
  } catch {
    throw new SafeFetchError(`Could not resolve host "${host}".`, "dns_error");
  }
  if (!addresses || addresses.length === 0) {
    throw new SafeFetchError(`No addresses found for host "${host}".`, "dns_error");
  }
  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      throw new SafeFetchError(
        `Host "${host}" resolves to a private/internal address (${address}); blocked.`,
        "blocked"
      );
    }
  }
}

async function readLimited(res, maxBytes) {
  if (!res.body) return { text: "", truncated: false };
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  let truncated = false;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.length > maxBytes) {
        chunks.push(value.slice(0, maxBytes - total));
        total = maxBytes;
        truncated = true;
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        break;
      }
      chunks.push(value);
      total += value.length;
    }
  } catch {
    /* stream aborted mid-read: keep what we have */
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { text: buf.toString("utf8"), truncated };
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Perform an outbound HTTP request with SSRF protections.
 * Returns:
 *   { ok, status, statusText, body, truncated, redirected, url, ms }
 * Throws SafeFetchError for blocked targets / network failures / timeouts.
 */
export async function safeFetch(rawUrl, options = {}) {
  const {
    method = "POST",
    headers: initialHeaders = {},
    body = null,
    timeoutMs = 10000,
    maxRedirects = 3,
    maxResponseBytes = 65536,
    // Test seams (never set by application code): allow an offline transport
    // and offline DNS in automated tests without weakening production checks.
    lookup = null,
    fetchImpl = null
  } = options;

  const doFetch = fetchImpl || globalThis.fetch;

  let currentUrl = rawUrl;
  let currentMethod = method;
  let currentBody = body;
  let currentHeaders = { ...initialHeaders };

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = validateTargetUrl(currentUrl);
    if (!check.ok) {
      throw new SafeFetchError(`Blocked: ${check.reason}`, "blocked");
    }
    await assertPublicHost(check.url.hostname, lookup);

    const controller = new AbortController();
    // The timer stays armed while the RESPONSE BODY is read, so a slow-drip
    // server cannot hold the request open indefinitely after headers arrive.
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    let res;
    try {
      res = await doFetch(check.url.toString(), {
        method: currentMethod,
        headers: { ...currentHeaders },
        body: currentBody,
        redirect: "manual",
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timer);
      if (err && err.name === "AbortError") {
        throw new SafeFetchError(
          `Request timed out after ${timeoutMs / 1000}s.`,
          "timeout"
        );
      }
      throw new SafeFetchError(
        `Network error: ${(err && err.message) || "request failed"}`,
        "network"
      );
    }

    if (REDIRECT_STATUSES.has(res.status)) {
      clearTimeout(timer);
      const location = res.headers.get("location");
      try {
        if (res.body) await res.body.cancel();
      } catch {
        /* ignore */
      }
      if (!location) {
        throw new SafeFetchError(`Server responded ${res.status} without a Location header.`, "network");
      }
      if (hop === maxRedirects) {
        throw new SafeFetchError(`Too many redirects (max ${maxRedirects}).`, "blocked");
      }
      // Re-validate the next hop; 303 (and browser convention for 301/302 on
      // POST) downgrades to GET without a body.
      const nextUrl = new URL(location, check.url);
      if (nextUrl.origin !== check.url.origin) {
        // Never forward caller-supplied headers (Authorization, X-Token, …)
        // to a different origin than the one they were intended for.
        currentHeaders = {};
      }
      currentUrl = nextUrl.toString();
      if (currentMethod !== "GET" && (res.status === 303 || res.status === 302 || res.status === 301)) {
        currentMethod = "GET";
        currentBody = null;
      }
      continue;
    }

    let read;
    try {
      read = await readLimited(res, maxResponseBytes);
    } finally {
      clearTimeout(timer);
    }
    if (controller.signal.aborted) {
      // The abort fired while streaming the body: report a timeout instead of
      // presenting a partial read as a complete response.
      throw new SafeFetchError(
        `Request timed out after ${timeoutMs / 1000}s while reading the response.`,
        "timeout"
      );
    }
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      body: read.text,
      truncated: read.truncated,
      redirected: hop > 0,
      url: check.url.toString(),
      ms: Date.now() - startedAt,
      contentType: res.headers.get("content-type") || ""
    };
  }

  throw new SafeFetchError("Too many redirects.", "blocked");
}
