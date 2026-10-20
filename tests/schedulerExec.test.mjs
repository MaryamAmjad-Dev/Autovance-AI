// Execution-level tests for lib/scheduler.js: persistence, the tick loop
// (including the REGRESSION where nextRunAt was never advanced and due jobs
// re-fired every 30s), dow=7 normalization, impossible-schedule rejection,
// per-user ownership, and job editing.
//
// Storage is the default in-memory store (no POSTGRES_URL in tests).
// Log-only jobs execute without network.
// Run with: npm test
import assert from "node:assert";

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

const sched = await import("../lib/scheduler.js");
const { store } = await import("../lib/store.js");

const readJobs = () => store().get("cron-jobs", []);

await test("dow=7 normalizes to Sunday like standard cron", async () => {
  const check = sched.parseCron("0 0 * * 7");
  assert.strictEqual(check.ok, true, "day-of-week 7 must parse");
  // 2026-01-05 is a Monday; the next 00:00 UTC on dow=7 must be a Sunday.
  const next = sched.nextRunAfter("0 0 * * 7", new Date("2026-01-05T00:00:00Z"));
  assert.ok(next, "a next run must exist");
  assert.strictEqual(next.getUTCDay(), 0, "dow=7 must resolve to Sunday");
});

await test("impossible schedules are rejected with an actionable error", () => {
  const r = sched.validateJobInput({
    name: "feb30",
    schedule: "0 0 30 2 *",
    action: { type: "log" },
  });
  assert.strictEqual(r.ok, false);
  assert.ok(/never occurs/i.test(r.errors.schedule), "names the impossible date");
});

await test("leap-day-only schedules are rejected instead of silently never running", () => {
  const r = sched.validateJobInput({
    name: "leap",
    schedule: "0 0 29 2 *",
    action: { type: "log" },
  });
  assert.strictEqual(r.ok, false);
  assert.ok(/leap-year|next year/i.test(r.errors.schedule));
});

await test("webhook jobs: missing URL and bad JSON are rejected; method is normalized", () => {
  const noUrl = sched.validateJobInput({
    name: "w",
    schedule: "* * * * *",
    action: { type: "webhook", url: "" },
  });
  assert.ok(noUrl.errors.action);

  const badBody = sched.validateJobInput({
    name: "w",
    schedule: "* * * * *",
    action: { type: "webhook", url: "https://example.com/h", body: "{oops" },
  });
  assert.ok(/valid JSON/i.test(badBody.errors.action));

  const normalized = sched.validateJobInput({
    name: "w",
    schedule: "* * * * *",
    action: { type: "webhook", url: "https://example.com/h", method: "put" },
  });
  assert.strictEqual(normalized.ok, true);
  assert.strictEqual(normalized.value.action.method, "PUT");
});

let job; // the shared "* * * * *" log job used by the execution tests below

await test("createJob stamps owner, enabled, and a future nextRunAt", async () => {
  const created = await sched.createJob(
    { name: "ticker", schedule: "* * * * *", action: { type: "log" } },
    "alice@example.com"
  );
  assert.strictEqual(created.ok, true);
  job = created.job;
  assert.strictEqual(job.owner, "alice@example.com");
  assert.strictEqual(job.enabled, true);
  assert.ok(job.nextRunAt && new Date(job.nextRunAt).getTime() > Date.now());
  assert.strictEqual(job.lastRun, null);
});

await test("REGRESSION: a due job fires exactly once, then nextRunAt advances (persisted)", async () => {
  // Force the job to be due.
  const jobs = await readJobs();
  const target = jobs.find((j) => j.id === job.id);
  target.nextRunAt = new Date(Date.now() - 1000).toISOString();
  await store().set("cron-jobs", jobs);

  const now = new Date();
  const first = await sched.tick(now);
  assert.strictEqual(first.executed, 1);

  // The old bug: nextRunAt was written to a different array than the one
  // saved, so the job stayed due and re-fired on the very next tick.
  const second = await sched.tick(now);
  assert.strictEqual(second.executed, 0, "must not re-fire before the next window");

  const after = (await readJobs()).find((j) => j.id === job.id);
  assert.ok(new Date(after.nextRunAt).getTime() > now.getTime(), "nextRunAt moved into the future");
  assert.ok(after.lastRun && after.lastRun.ok === true, "run result persisted onto the job");
  const history = await sched.listHistory();
  assert.strictEqual(history[0].jobName, "ticker");
});

await test("runJobNow executes a log job and reports the honest summary; unknown id is not_found", async () => {
  const r = await sched.runJobNow(job.id);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.run.ok, true);
  assert.ok(/Log-only/i.test(r.run.summary), "log jobs state that no external action happened");
  const missing = await sched.runJobNow("does-not-exist");
  assert.strictEqual(missing.ok, false);
  assert.strictEqual(missing.code, "not_found");
});

await test("ownership: jobs are visible and manageable only by their owner", async () => {
  assert.ok((await sched.visibleJobs("alice@example.com")).some((j) => j.id === job.id));
  assert.ok(!(await sched.visibleJobs("bob@example.com")).some((j) => j.id === job.id), "other users must not see it");
  assert.strictEqual(sched.canManage(job, "alice@example.com"), true);
  assert.strictEqual(sched.canManage(job, "bob@example.com"), false);
  assert.strictEqual(sched.canManage(job, ""), false);
});

await test("legacy ownerless jobs stay shared for migration compatibility", async () => {
  const legacy = await sched.createJob(
    { name: "legacy", schedule: "0 0 * * *", action: { type: "log" } }
    // no owner argument on purpose
  );
  assert.strictEqual(legacy.ok, true);
  assert.strictEqual(legacy.job.owner, undefined);
  assert.strictEqual(sched.canManage(legacy.job, "anyone@example.com"), true);
  assert.ok((await sched.visibleJobs("bob@example.com")).some((j) => j.id === legacy.job.id));
});

await test("updateJob edits name/schedule and recomputes nextRunAt", async () => {
  const upd = await sched.updateJob(job.id, { name: "renamed", schedule: "*/5 * * * *" });
  assert.strictEqual(upd.ok, true);
  assert.strictEqual(upd.job.name, "renamed");
  assert.strictEqual(upd.job.schedule, "*/5 * * * *");
  const stored = (await readJobs()).find((j) => j.id === job.id);
  assert.strictEqual(stored.name, "renamed", "edit is persisted");
  assert.ok(stored.nextRunAt, "nextRunAt recomputed after a schedule edit");
});

await test("updateJob rejects invalid edits without partially applying them", async () => {
  const before = (await readJobs()).find((j) => j.id === job.id);
  const bad = await sched.updateJob(job.id, { schedule: "not a cron expression" });
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.errors.schedule);
  const after = (await readJobs()).find((j) => j.id === job.id);
  assert.strictEqual(after.schedule, before.schedule, "schedule unchanged after failed edit");
  assert.strictEqual(after.name, before.name);
});

await test("enable/disable toggles and is persisted", async () => {
  const off = await sched.updateJob(job.id, { enabled: false });
  assert.strictEqual(off.ok, true);
  assert.strictEqual(off.job.enabled, false);
  assert.strictEqual((await readJobs()).find((j) => j.id === job.id).enabled, false);
  const on = await sched.updateJob(job.id, { enabled: true });
  assert.strictEqual(on.job.enabled, true);
  assert.ok(on.job.nextRunAt, "re-enabling recomputes nextRunAt");
});

await test("deleteJob removes the job and reports not_found on repeat", async () => {
  assert.strictEqual((await sched.deleteJob(job.id)).ok, true);
  assert.strictEqual((await sched.deleteJob(job.id)).code, "not_found");
  assert.ok(!(await readJobs()).some((j) => j.id === job.id), "gone from storage");
});

console.log(`schedulerExec: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
