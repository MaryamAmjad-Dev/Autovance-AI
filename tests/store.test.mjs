// Unit tests for lib/store.js — atomic JSON persistence with corrupt-file
// backups. Uses a fresh temp directory; nothing touches the repo's data/.
// Run with: npm test
import assert from "node:assert";
import fs from "fs";
import os from "os";
import path from "path";
import { createStore } from "../lib/store.js";

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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "av-store-"));
const store = createStore(dir);

test("write then read roundtrip", () => {
  store.write("users", [{ id: 1 }]);
  assert.deepStrictEqual(store.read("users"), [{ id: 1 }]);
});

test("missing file returns the caller's fallback", () => {
  assert.deepStrictEqual(store.read("nothing-here", []), []);
  assert.strictEqual(store.read("nothing-here", null), null);
});

test("a literal null payload also yields the fallback", () => {
  fs.writeFileSync(path.join(dir, "nul.json"), "null");
  assert.deepStrictEqual(store.read("nul", ["fallback"]), ["fallback"]);
});

test("corrupt JSON is backed up before starting fresh (data never silently destroyed)", () => {
  fs.writeFileSync(path.join(dir, "broken.json"), "{ not json !!");
  const got = store.read("broken", ["fallback"]);
  assert.deepStrictEqual(got, ["fallback"]);

  // The original bytes must survive under a .corrupt-<timestamp> backup.
  const backups = fs.readdirSync(dir).filter((f) => f.startsWith("broken.json.corrupt-"));
  assert.strictEqual(backups.length, 1, "exactly one backup file expected");
  const preserved = fs.readFileSync(path.join(dir, backups[0]), "utf8");
  assert.strictEqual(preserved, "{ not json !!");

  // After the backup the store starts clean: a fresh write is valid JSON.
  store.write("broken", { ok: true });
  assert.deepStrictEqual(store.read("broken"), { ok: true });
});

test("write creates the data directory when missing", () => {
  const nested = createStore(path.join(dir, "deep", "nested"));
  nested.write("k", { a: 1 });
  assert.deepStrictEqual(nested.read("k"), { a: 1 });
});

test("file names are sanitized so odd keys cannot escape the data directory", () => {
  store.write("../evil name", { x: 1 });
  // Same odd key resolves to the same sanitized file on read.
  assert.deepStrictEqual(store.read("../evil name"), { x: 1 });
  // And nothing was written outside the store directory.
  assert.ok(!fs.existsSync(path.join(dir, "..", "evil name.json")));
  assert.ok(fs.readdirSync(dir).some((f) => f.endsWith(".json")));
});

test("an unreadable file throws instead of returning a fallback", () => {
  // A directory where the JSON file should be makes readFileSync fail with
  // EISDIR on every platform. Returning the fallback here would be dangerous:
  // the next write would overwrite data we could not read.
  fs.mkdirSync(path.join(dir, "locked.json"));
  assert.throws(() => store.read("locked", []));
});

console.log(`store: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
