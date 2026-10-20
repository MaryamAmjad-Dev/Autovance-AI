// Unit tests for lib/safeFetch.js URL/address validation (pure parts only;
// no DNS lookups or outbound requests are performed here).
// Run with: npm test
import assert from "node:assert";
import {
  validateTargetUrl,
  isPrivateIPv4,
  isBlockedAddress,
  safeFetch,
  SafeFetchError,
} from "../lib/safeFetch.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("PASS", name);
  } catch (e) {
    failed++;
    console.log("FAIL", name, "->", e.message);
  }
}

// Async variant for the offline end-to-end safeFetch tests below.
async function atest(name, fn) {
  try {
    await fn();
    passed++;
    console.log("PASS", name);
  } catch (e) {
    failed++;
    console.log("FAIL", name, "->", e.message);
  }
}

test("validateTargetUrl: allows plain public http(s) URLs", () => {
  assert.strictEqual(validateTargetUrl("https://example.com/hook").ok, true);
  assert.strictEqual(validateTargetUrl("http://example.com:8080/path?q=1").ok, true);
  assert.strictEqual(validateTargetUrl("  https://example.com  ").ok, true);
});

test("validateTargetUrl: blocks unsafe protocols", () => {
  for (const url of [
    "file:///etc/passwd",
    "ftp://example.com/x",
    "javascript:alert(1)",
    "data:text/html,hi",
    "ws://example.com/socket",
    "gopher://example.com",
  ]) {
    const r = validateTargetUrl(url);
    assert.strictEqual(r.ok, false, url);
  }
});

test("validateTargetUrl: blocks localhost names and internal TLDs", () => {
  for (const url of [
    "http://localhost/api",
    "http://LOCALHOST:3000",
    "http://sub.localhost/x",
    "http://printer.local/",
    "http://db.internal/",
  ]) {
    const r = validateTargetUrl(url);
    assert.strictEqual(r.ok, false, url);
  }
});

test("validateTargetUrl: blocks private/loopback/metadata IP literals", () => {
  for (const url of [
    "http://127.0.0.1/",
    "http://127.8.9.1:8080/",
    "http://10.0.0.5/",
    "http://172.16.1.1/",
    "http://192.168.1.10/",
    "http://169.254.169.254/latest/meta-data/", // cloud metadata
    "http://100.64.0.1/",
    "http://[::1]/",
    "http://[fc00::1]/",
    "http://[fe80::1]/",
  ]) {
    const r = validateTargetUrl(url);
    assert.strictEqual(r.ok, false, url);
  }
});

test("validateTargetUrl: blocks credentials in URL, empty, oversized, unparseable", () => {
  assert.strictEqual(validateTargetUrl("https://user:pass@example.com/").ok, false);
  assert.strictEqual(validateTargetUrl("").ok, false);
  assert.strictEqual(validateTargetUrl("   ").ok, false);
  assert.strictEqual(validateTargetUrl(null).ok, false);
  assert.strictEqual(validateTargetUrl(`https://example.com/${"a".repeat(2100)}`).ok, false);
  assert.strictEqual(validateTargetUrl("not a url at all").ok, false);
});

test("validateTargetUrl: allows public IP literals", () => {
  assert.strictEqual(validateTargetUrl("https://8.8.8.8/lookup").ok, true);
  assert.strictEqual(validateTargetUrl("https://1.1.1.1/").ok, true);
  assert.strictEqual(validateTargetUrl("https://[2606:4700:4700::1111]/").ok, true);
});

test("isPrivateIPv4: covers the private ranges", () => {
  assert.strictEqual(isPrivateIPv4("0.1.2.3"), true);
  assert.strictEqual(isPrivateIPv4("10.255.255.255"), true);
  assert.strictEqual(isPrivateIPv4("100.64.1.1"), true);
  assert.strictEqual(isPrivateIPv4("100.128.1.1"), false); // above CGNAT range
  assert.strictEqual(isPrivateIPv4("127.0.0.1"), true);
  assert.strictEqual(isPrivateIPv4("169.254.0.1"), true);
  assert.strictEqual(isPrivateIPv4("172.31.255.255"), true);
  assert.strictEqual(isPrivateIPv4("172.32.0.1"), false);
  assert.strictEqual(isPrivateIPv4("192.168.0.1"), true);
  assert.strictEqual(isPrivateIPv4("224.0.0.1"), true);
  assert.strictEqual(isPrivateIPv4("255.255.255.255"), true);
  assert.strictEqual(isPrivateIPv4("8.8.8.8"), false);
  assert.strictEqual(isPrivateIPv4("999.1.1.1"), true); // unparseable -> unsafe
});

test("isBlockedAddress: IPv6 forms including v4-mapped and NAT64", () => {
  assert.strictEqual(isBlockedAddress("::1"), true);
  assert.strictEqual(isBlockedAddress("::"), true);
  assert.strictEqual(isBlockedAddress("::ffff:127.0.0.1"), true); // v4-mapped loopback
  assert.strictEqual(isBlockedAddress("::ffff:8.8.8.8"), false);
  assert.strictEqual(isBlockedAddress("64:ff9b::10.0.0.1"), true); // NAT64 to private
  assert.strictEqual(isBlockedAddress("fc00::1"), true);
  assert.strictEqual(isBlockedAddress("fd12::1"), true);
  assert.strictEqual(isBlockedAddress("fe80::1"), true);
  assert.strictEqual(isBlockedAddress("ff02::1"), true);
  assert.strictEqual(isBlockedAddress("2001:db8::1"), true); // documentation
  assert.strictEqual(isBlockedAddress("2606:4700:4700::1111"), false);
  assert.strictEqual(isBlockedAddress(""), true);
});

test("SafeFetchError carries a machine-readable code", () => {
  const err = new SafeFetchError("nope", "blocked");
  assert.ok(err instanceof Error);
  assert.strictEqual(err.code, "blocked");
  assert.strictEqual(err.message, "nope");
});

test("REGRESSION: hex-form IPv6 literals are blocked at the URL level", () => {
  for (const url of [
    "http://[::ffff:7f00:1]/", // 127.0.0.1 in hex (v4-mapped)
    "http://[0:0:0:0:0:ffff:7f00:1]/", // same, uncompressed
    "http://[64:ff9b::a00:1]/", // NAT64 -> 10.0.0.1
    "http://[2002:7f00:1::]/", // 6to4 -> 127.0.0.1
    "http://[fec0::1]/", // deprecated site-local
  ]) {
    assert.strictEqual(validateTargetUrl(url).ok, false, url);
  }
  // A public address written in the same hex style must stay allowed.
  assert.strictEqual(validateTargetUrl("http://[::ffff:808:808]/").ok, true, "8.8.8.8 is public");
});

// ---------------------------------------------------------------- offline
// safeFetch end-to-end behaviour with the injectable DNS + transport seams.
// No network access happens anywhere below.

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

await atest("safeFetch: a private DNS answer blocks the request before fetch is called", async () => {
  let fetchCalled = false;
  await assert.rejects(
    () =>
      safeFetch("http://sneaky.example/hook", {
        lookup: async () => [{ address: "10.1.2.3", family: 4 }],
        fetchImpl: async () => {
          fetchCalled = true;
          return new Response("ok");
        },
      }),
    (err) => err instanceof SafeFetchError && err.code === "blocked"
  );
  assert.strictEqual(fetchCalled, false, "the transport must never be reached");
});

await atest("safeFetch: DNS failure reports dns_error", async () => {
  await assert.rejects(
    () =>
      safeFetch("http://nope.example/x", {
        lookup: async () => {
          throw new Error("ENOTFOUND");
        },
        fetchImpl: async () => new Response("ok"),
      }),
    (err) => err instanceof SafeFetchError && err.code === "dns_error"
  );
});

await atest("safeFetch: a public target goes through and returns the response", async () => {
  const r = await safeFetch("https://example.com/hook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"a":1}',
    lookup: publicLookup,
    fetchImpl: async () => new Response("hello world", { status: 200 }),
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body, "hello world");
  assert.strictEqual(r.redirected, false);
  assert.strictEqual(typeof r.ms, "number");
});

await atest("safeFetch: transport failure reports network", async () => {
  await assert.rejects(
    () =>
      safeFetch("https://example.com/hook", {
        lookup: publicLookup,
        fetchImpl: async () => {
          throw new TypeError("fetch failed");
        },
      }),
    (err) => err instanceof SafeFetchError && err.code === "network"
  );
});

await atest("safeFetch: cross-origin redirects DROP caller headers, same-origin keeps them", async () => {
  const crossCalls = [];
  const cross = await safeFetch("https://example.com/start", {
    method: "POST",
    headers: { Authorization: "Bearer supersecret", "X-Custom": "1" },
    lookup: publicLookup,
    fetchImpl: async (url, opts) => {
      crossCalls.push({ url, headers: opts.headers });
      if (crossCalls.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://other.example/hook" },
        });
      }
      return new Response("done", { status: 200 });
    },
  });
  assert.strictEqual(crossCalls.length, 2);
  assert.ok(crossCalls[0].headers.Authorization, "first hop carries the caller's headers");
  assert.ok(!("Authorization" in crossCalls[1].headers), "cross-origin hop must not leak Authorization");
  assert.ok(!("X-Custom" in crossCalls[1].headers), "cross-origin hop must not leak custom headers");
  assert.strictEqual(cross.body, "done");
  assert.strictEqual(cross.redirected, true);

  const sameCalls = [];
  await safeFetch("https://example.com/start", {
    method: "POST",
    headers: { Authorization: "Bearer supersecret" },
    lookup: publicLookup,
    fetchImpl: async (url, opts) => {
      sameCalls.push({ url, headers: opts.headers });
      if (sameCalls.length === 1) {
        return new Response(null, { status: 302, headers: { location: "/next" } });
      }
      return new Response("done", { status: 200 });
    },
  });
  assert.strictEqual(sameCalls.length, 2);
  assert.ok(
    "Authorization" in sameCalls[1].headers,
    "same-origin redirect may keep the caller's headers"
  );
});

await atest("safeFetch: a redirect into a private address is re-validated and blocked", async () => {
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      safeFetch("https://example.com/lure", {
        lookup: publicLookup,
        fetchImpl: async () => {
          fetchCalls++;
          return new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1/internal" },
          });
        },
      }),
    (err) => err instanceof SafeFetchError && err.code === "blocked"
  );
  assert.strictEqual(fetchCalls, 1, "the internal hop must never be fetched");
});

await atest("REGRESSION: a slow-drip body read is reported as a timeout, not partial success", async () => {
  await assert.rejects(
    () =>
      safeFetch("https://example.com/slow", {
        lookup: publicLookup,
        timeoutMs: 60,
        fetchImpl: async (url, opts) => ({
          status: 200,
          ok: true,
          statusText: "OK",
          headers: new Headers({ "content-type": "text/plain" }),
          body: {
            getReader: () => ({
              read: () =>
                new Promise((_, reject) => {
                  opts.signal.addEventListener("abort", () =>
                    reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }))
                  );
                }),
              cancel: async () => {},
            }),
          },
        }),
      }),
    (err) => err instanceof SafeFetchError && err.code === "timeout"
  );
});

await atest("a null-body response is returned as an empty body, not a crash", async () => {
  const r = await safeFetch("https://example.com/empty", {
    lookup: publicLookup,
    fetchImpl: async () => new Response(null, { status: 204 }),
  });
  assert.strictEqual(r.status, 204);
  assert.strictEqual(r.body, "");
  assert.strictEqual(r.truncated, false);
});

console.log(`safeFetch: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
