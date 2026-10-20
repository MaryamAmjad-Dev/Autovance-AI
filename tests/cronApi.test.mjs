// Integration tests for pages/api/cron.js with real sessions and a temp data
// directory: authentication, per-user ownership (no existence disclosure),
// create/list/edit/toggle/run/delete, and honest 404/400 codes. Log-only jobs
// execute without network.
// Run with: npm test
import assert from "node:assert";
import fs from "fs";
import os from "os";
import path from "path";
import handler from "../pages/api/cron.js";
import { createUser, createSession } from "../lib/auth.js";

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("PASS", name);
  } catch (e) {
    failed++;
    console.log("FAIL", name, "->", e.message);
  }
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "av-cronapi-"));
process.chdir(dataDir); // store() resolves cwd lazily; before any usage

function makeRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    },
  };
}

await createUser({ name: "Alice", email: "alice@example.com", password: "hunter2hunter2" });
await createUser({ name: "Bob", email: "bob@example.com", password: "hunter2hunter2" });
const aliceTok = createSession("alice@example.com");
const bobTok = createSession("bob@example.com");

const reqFor = (token, method, body, query) => ({
  method,
  body,
  query,
  headers: {
    cookie: `av_session=${token}`,
    host: "localhost:3000",
  },
});

const LOG_JOB = { name: "daily note", schedule: "0 9 * * *", action: { type: "log" } };

let createdId = null;

await test("unauthenticated -> 401", async () => {
  const res = makeRes();
  await handler({ method: "GET", headers: { host: "localhost:3000" } }, res);
  assert.strictEqual(res.statusCode, 401);
});

await test("unsupported method -> 405 with Allow header", async () => {
  const res = makeRes();
  await handler(reqFor(aliceTok, "PUT", {}), res);
  assert.strictEqual(res.statusCode, 405);
  assert.strictEqual(res.headers.Allow, "GET, POST, PATCH, DELETE");
});

await test("POST creates a job owned by the caller", async () => {
  const res = makeRes();
  await handler(reqFor(aliceTok, "POST", LOG_JOB), res);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(res.body.job.name, "daily note");
  assert.strictEqual(res.body.job.schedule, "0 9 * * *");
  assert.ok(res.body.job.id);
  createdId = res.body.job.id;
});

await test("POST with invalid input -> 400 with field errors", async () => {
  const res = makeRes();
  await handler(reqFor(aliceTok, "POST", { name: "", schedule: "not cron", action: {} }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.ok(res.body.errors.name);
  assert.ok(res.body.errors.schedule);
  assert.ok(res.body.errors.action);
});

await test("GET returns the caller's jobs, history, and real scheduler status", async () => {
  const res = makeRes();
  await handler(reqFor(aliceTok, "GET"), res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body.jobs.some((j) => j.id === createdId));
  assert.ok(Array.isArray(res.body.history));
  assert.strictEqual(typeof res.body.scheduler.active, "boolean");
  assert.ok(res.body.scheduler.intervalSeconds > 0);
});

await test("another user's job is invisible to Bob (no existence disclosure)", async () => {
  const res = makeRes();
  await handler(reqFor(bobTok, "GET"), res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(!res.body.jobs.some((j) => j.id === createdId), "Bob must not see Alice's job");
});

await test("PATCH/DELETE/run on a foreign job all report 404 not_found", async () => {
  const patch = makeRes();
  await handler(reqFor(bobTok, "PATCH", { id: createdId, enabled: false }), patch);
  assert.strictEqual(patch.statusCode, 404);
  assert.strictEqual(patch.body.code, "not_found");

  const del = makeRes();
  await handler(reqFor(bobTok, "DELETE", { id: createdId }), del);
  assert.strictEqual(del.statusCode, 404);
  assert.strictEqual(del.body.code, "not_found");

  const run = makeRes();
  await handler(reqFor(bobTok, "POST", { action: "run", id: createdId }), run);
  assert.strictEqual(run.statusCode, 404);
  assert.strictEqual(run.body.code, "not_found");
});

await test("owner can edit name and schedule through PATCH", async () => {
  const res = makeRes();
  await handler(
    reqFor(aliceTok, "PATCH", { id: createdId, name: "renamed job", schedule: "*/5 * * * *" }),
    res
  );
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.job.name, "renamed job");
  assert.strictEqual(res.body.job.schedule, "*/5 * * * *");
  assert.ok(res.body.job.nextRunAt, "next run recomputed after the edit");
});

await test("PATCH with an invalid schedule -> 400 with errors.schedule", async () => {
  const res = makeRes();
  await handler(reqFor(aliceTok, "PATCH", { id: createdId, schedule: "0 0 30 2 *" }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.ok(/never occurs/i.test(res.body.errors.schedule));
});

await test("PATCH requires an id and at least one change", async () => {
  const noId = makeRes();
  await handler(reqFor(aliceTok, "PATCH", { enabled: true }), noId);
  assert.strictEqual(noId.statusCode, 400);

  const empty = makeRes();
  await handler(reqFor(aliceTok, "PATCH", { id: createdId }), empty);
  assert.strictEqual(empty.statusCode, 400);
});

await test("owner can disable and re-enable the job", async () => {
  const off = makeRes();
  await handler(reqFor(aliceTok, "PATCH", { id: createdId, enabled: false }), off);
  assert.strictEqual(off.body.job.enabled, false);
  const on = makeRes();
  await handler(reqFor(aliceTok, "PATCH", { id: createdId, enabled: true }), on);
  assert.strictEqual(on.body.job.enabled, true);
});

await test("run-now executes the job and reports the real run entry", async () => {
  const res = makeRes();
  await handler(reqFor(aliceTok, "POST", { action: "run", id: createdId }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.run.ok, true);
  assert.ok(/Log-only/i.test(res.body.run.summary));
  assert.ok(res.body.run.startedAt && res.body.run.finishedAt);
});

await test("owner can delete the job; it disappears from the list", async () => {
  const del = makeRes();
  await handler(reqFor(aliceTok, "DELETE", { id: createdId }), del);
  assert.strictEqual(del.statusCode, 200);
  assert.strictEqual(del.body.ok, true);

  const list = makeRes();
  await handler(reqFor(aliceTok, "GET"), list);
  assert.ok(!list.body.jobs.some((j) => j.id === createdId));

  const delAgain = makeRes();
  await handler(reqFor(aliceTok, "DELETE", { id: createdId }), delAgain);
  assert.strictEqual(delAgain.statusCode, 404);
});

console.log(`cronApi: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
