// Unit tests for lib/scheduler.js cron parsing + scheduling maths + job input
// validation. (No file I/O, no network.)
// Run with: npm test
import assert from "node:assert";
import {
  parseCron,
  validateCron,
  nextRunAfter,
  describeCron,
  validateJobInput,
} from "../lib/scheduler.js";

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

const at = (iso) => new Date(iso);

test("parseCron: valid expressions parse into field sets", () => {
  const r = parseCron("*/5 9-17 * * 1-5");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.fields.minute.size, 12); // 0,5,...,55
  assert.strictEqual(r.fields.hour.size, 9);
  assert.strictEqual(r.fields.dow.size, 5);
  assert.strictEqual(validateCron("* * * * *").ok, true);
});

test("parseCron: rejects wrong field count and out-of-range values", () => {
  assert.strictEqual(parseCron("* * * *").ok, false);
  assert.strictEqual(parseCron("60 * * * *").ok, false);
  assert.strictEqual(parseCron("* 24 * * *").ok, false);
  assert.strictEqual(parseCron("* * 0 * *").ok, false); // day-of-month min is 1
  assert.strictEqual(parseCron("* * * 13 *").ok, false);
  assert.strictEqual(parseCron("* * * * 8").ok, false);
  assert.strictEqual(parseCron("*/0 * * * *").ok, false);
  assert.strictEqual(parseCron("a b c d e").ok, false);
  assert.strictEqual(parseCron("").ok, false);
  assert.strictEqual(parseCron(null).ok, false);
  assert.ok(parseCron("60 * * * *").error.includes("minute"));
});

test("parseCron: @macros expand to expressions", () => {
  assert.strictEqual(parseCron("@hourly").ok, true);
  assert.strictEqual(parseCron("@daily").ok, true);
  assert.strictEqual(parseCron("@weekly").ok, true);
});

test("nextRunAfter: every-5-minutes rolls to the next multiple of 5", () => {
  const next = nextRunAfter("*/5 * * * *", at("2026-01-01T10:07:31Z"));
  assert.strictEqual(next.toISOString(), "2026-01-01T10:10:00.000Z");
});

test("nextRunAfter: daily job rolls to tomorrow once the time passed", () => {
  const same = nextRunAfter("0 9 * * *", at("2026-01-01T08:00:00Z"));
  assert.strictEqual(same.toISOString(), "2026-01-01T09:00:00.000Z");
  const tomorrow = nextRunAfter("0 9 * * *", at("2026-01-01T10:00:00Z"));
  assert.strictEqual(tomorrow.toISOString(), "2026-01-02T09:00:00.000Z");
});

test("nextRunAfter: weekday restriction skips the weekend (2026-01-01 is a Thursday)", () => {
  const friday = nextRunAfter("0 9 * * 1-5", at("2026-01-01T10:00:00Z"));
  assert.strictEqual(friday.toISOString(), "2026-01-02T09:00:00.000Z"); // Friday
  const monday = nextRunAfter("0 9 * * 1", at("2026-01-01T10:00:00Z"));
  assert.strictEqual(monday.toISOString(), "2026-01-05T09:00:00.000Z"); // next Monday
});

test("nextRunAfter: Feb-29 style yearly job finds the next year", () => {
  const next = nextRunAfter("0 0 1 1 *", at("2026-01-02T00:00:00Z"));
  assert.strictEqual(next.toISOString(), "2027-01-01T00:00:00.000Z");
});

test("nextRunAfter: invalid expression returns null (never throws)", () => {
  assert.strictEqual(nextRunAfter("bad expr", new Date()), null);
});

test("describeCron: known presets get friendly labels, others fall back", () => {
  assert.strictEqual(describeCron("*/5 * * * *"), "every 5 minutes");
  assert.strictEqual(describeCron("0 9 * * *"), "daily at 09:00 UTC");
  assert.ok(describeCron("15 14 1 * *").length > 0);
  assert.ok(describeCron("not valid").length > 0);
});

test("describeCron: macro values and names never recurse infinitely", () => {
  // Regression: expressions equal to a macro value used to loop forever.
  assert.strictEqual(describeCron("0 0 1 1 *"), "@yearly (00:00 UTC on day 1 of the month in month Jan)");
  assert.strictEqual(describeCron("0 0 * * 0"), "every Sunday at 00:00 UTC");
  assert.strictEqual(describeCron("0 * * * *"), "every hour, on the hour");
  assert.strictEqual(describeCron("@hourly"), "every hour, on the hour");
  assert.strictEqual(describeCron("@daily"), "@daily (00:00 UTC)");
  assert.strictEqual(describeCron("@monthly"), "@monthly (00:00 UTC on day 1 of the month)");
});

test("validateJobInput: log jobs are accepted without a URL", () => {
  const r = validateJobInput({ name: "Heartbeat", schedule: "* * * * *", action: { type: "log" } });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.value.action, { type: "log" });
});

test("validateJobInput: webhook jobs need a URL and valid JSON body", () => {
  const missingUrl = validateJobInput({
    name: "Ping",
    schedule: "*/5 * * * *",
    action: { type: "webhook" },
  });
  assert.strictEqual(missingUrl.ok, false);
  assert.ok(missingUrl.errors.action);

  const badBody = validateJobInput({
    name: "Ping",
    schedule: "*/5 * * * *",
    action: { type: "webhook", url: "https://example.com", body: "{oops" },
  });
  assert.ok(badBody.errors.action);

  const good = validateJobInput({
    name: " Ping ",
    schedule: "*/5 * * * *",
    action: { type: "webhook", url: " https://example.com/hook ", method: "post", body: '{"a":1}' },
  });
  assert.strictEqual(good.ok, true);
  assert.strictEqual(good.value.name, "Ping");
  assert.strictEqual(good.value.action.method, "POST");
  assert.strictEqual(good.value.action.body, '{"a":1}');
});

test("validateJobInput: name and schedule are required and validated", () => {
  const r = validateJobInput({ name: "", schedule: "nope", action: { type: "log" } });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.name);
  assert.ok(r.errors.schedule);
});

console.log(`scheduler: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
