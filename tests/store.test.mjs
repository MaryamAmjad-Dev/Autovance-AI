// Unit tests for lib/store.js — async JSON persistence with corrupt-file
// backups, plus the locked update() contract. Uses a fresh temp directory;
// nothing touches the repo's data/.
// Run with: npm test
import assert from "node:assert";
import fs from "fs";
import os from "os";
import path from "path";
import { createStore } from "../lib/store.js";

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "av-store-"));
const store = createStore(dir);

test("set then get roundtrip", async () => {
  await store.set("users", [{ id: 1 }]);
  assert.deepStrictEqual(await store.get("users"), [{ id: 1 }]);
});

test("missing file returns the caller's fallback", async () => {
  assert.deepStrictEqual(await store.get("nothing-here", []), []);
  assert.strictEqual(await store.get("nothing-here", null), null);
});

test("a literal null payload also yields the fallback", async () => {
  fs.writeFileSync(path.join(dir, "nul.json"), "null");
  assert.deepStrictEqual(await store.get("nul", ["fallback"]), ["fallback"]);
});

test("corrupt JSON is backed up before starting fresh (data never silently destroyed)", async () => {
  fs.writeFileSync(path.join(dir, "broken.json"), "{ not json !!");
  const got = await store.get("broken", ["fallback"]);
  assert.deepStrictEqual(got, ["fallback"]);

  // The original bytes must survive under a .corrupt-<timestamp> backup.
  const backups = fs.readdirSync(dir).filter((f) => f.startsWith("broken.json.corrupt-"));
  assert.strictEqual(backups.length, 1, "exactly one backup file expected");
  const preserved = fs.readFileSync(path.join(dir, backups[0]), "utf8");
  assert.strictEqual(preserved, "{ not json !!");

  // After the backup the store starts clean: a fresh write is valid JSON.
  await store.set("broken", { ok: true });
  assert.deepStrictEqual(await store.get("broken"), { ok: true });
});

test("set creates the data directory when missing", async () => {
  const nested = createStore(path.join(dir, "deep", "nested"));
  await nested.set("k", { a: 1 });
  assert.deepStrictEqual(await nested.get("k"), { a: 1 });
});

test("file names are sanitized so odd keys cannot escape the data directory", async () => {
  await store.set("../evil name", { x: 1 });
  // Same odd key resolves to the same sanitized file on read.
  assert.deepStrictEqual(await store.get("../evil name"), { x: 1 });
  // And nothing was written outside the store directory.
  assert.ok(!fs.existsSync(path.join(dir, "..", "evil name.json")));
  assert.ok(fs.readdirSync(dir).some((f) => f.endsWith(".json")));
});

test("an unreadable file throws instead of returning a fallback", async () => {
  // A directory where the JSON file should be makes readFileSync fail with
  // EISDIR on every platform. Returning the fallback here would be dangerous:
  // the next write would overwrite data we could not read.
  fs.mkdirSync(path.join(dir, "locked.json"));
  await assert.rejects(() => store.get("locked", []));
});

test("update persists an in-place mutation and returns the callback's value", async () => {
  await store.set("counter", { n: 1 });
  const seen = await store.update("counter", { n: 0 }, (data) => {
    data.n += 1;
    return data.n;
  });
  assert.strictEqual(seen, 2, "update returns what the callback returned");
  assert.deepStrictEqual(await store.get("counter"), { n: 2 }, "mutation persisted");
});

test("update on a missing key starts from the caller's fallback", async () => {
  await store.update("fresh-key", { items: ["a"] }, (data) => {
    data.items.push("b");
  });
  assert.deepStrictEqual(await store.get("fresh-key"), { items: ["a", "b"] });
});

test("a throwing callback aborts the write (previous value untouched)", async () => {
  await store.set("safe", { v: "before" });
  await assert.rejects(
    () =>
      store.update("safe", { v: "fallback" }, (data) => {
        data.v = "mutated-then-abort";
        throw new Error("boom");
      }),
    /boom/
  );
  assert.deepStrictEqual(await store.get("safe"), { v: "before" }, "no write on throw");
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log("PASS", name);
  } catch (e) {
    failed++;
    console.log("FAIL", name, "->", e.message);
  }
}

console.log(`store: ${tests.length - failed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
