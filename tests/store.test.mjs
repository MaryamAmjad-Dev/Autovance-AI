// Unit tests for lib/store.js — in-memory persistence with the locked
// update() contract. No files, no database; runs fully offline.
// Run with: npm test
import assert from "node:assert";
import { createMemoryStore, store } from "../lib/store.js";

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const s = createMemoryStore();

test("set then get roundtrip", async () => {
  await s.set("users", [{ id: 1 }]);
  assert.deepStrictEqual(await s.get("users"), [{ id: 1 }]);
});

test("missing key returns the caller's fallback", async () => {
  assert.deepStrictEqual(await s.get("nothing-here", []), []);
  assert.strictEqual(await s.get("nothing-here", null), null);
});

test("a literal null value also yields the fallback", async () => {
  await s.set("nul", null);
  assert.deepStrictEqual(await s.get("nul", ["fallback"]), ["fallback"]);
});

test("overwriting an existing key replaces the value", async () => {
  await s.set("counter", { n: 1 });
  await s.set("counter", { n: 2 });
  assert.deepStrictEqual(await s.get("counter"), { n: 2 });
});

test("update persists an in-place mutation and returns the callback's value", async () => {
  await s.set("update-test", { n: 1 });
  const seen = await s.update("update-test", { n: 0 }, (data) => {
    data.n += 1;
    return data.n;
  });
  assert.strictEqual(seen, 2, "update returns what the callback returned");
  assert.deepStrictEqual(await s.get("update-test"), { n: 2 }, "mutation persisted");
});

test("update on a missing key starts from the caller's fallback", async () => {
  await s.update("fresh-key", { items: ["a"] }, (data) => {
    data.items.push("b");
  });
  assert.deepStrictEqual(await s.get("fresh-key"), { items: ["a", "b"] });
});

test("a throwing callback aborts the write (previous value untouched)", async () => {
  await s.set("safe", { v: "before" });
  await assert.rejects(
    () =>
      s.update("safe", { v: "fallback" }, (data) => {
        data.v = "mutated-then-abort";
        throw new Error("boom");
      }),
    /boom/
  );
  assert.deepStrictEqual(await s.get("safe"), { v: "before" }, "no write on throw");
});

test("concurrent updates on the same key are serialized (no lost writes)", async () => {
  await s.set("counter2", { n: 0 });
  await Promise.all([
    s.update("counter2", { n: 0 }, (d) => { d.n += 1; }),
    s.update("counter2", { n: 0 }, (d) => { d.n += 1; }),
    s.update("counter2", { n: 0 }, (d) => { d.n += 1; }),
  ]);
  assert.deepStrictEqual(await s.get("counter2"), { n: 3 });
});

test("store() returns a working default (memory when no POSTGRES_URL)", async () => {
  const def = store();
  assert.ok(def.kind === "memory" || def.kind === "postgres", "store has a valid kind");
  await def.set("__probe__", { ok: true });
  assert.deepStrictEqual(await def.get("__probe__"), { ok: true });
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
