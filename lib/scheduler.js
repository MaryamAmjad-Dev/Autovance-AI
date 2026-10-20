// Cron scheduling: standard 5-field cron expressions, JSON-file persistence,
// and an in-process runner.
//
// Honest deployment notes (surfaced by the UI, not hidden):
//   - Jobs are stored on disk and survive restarts.
//   - Automatic execution happens via an in-process tick (every 30s). The tick
//     starts the FIRST TIME an authenticated client requests the Cron Jobs API
//     after a process start (ensureRunner), not automatically at boot.
//     It only runs while a long-lived Node server is serving this app
//     (`npm run dev` / `npm start`). After a restart, jobs do not run again
//     until the Cron Jobs page (or its API) is accessed.
//   - On serverless platforms (e.g. Vercel) there is no such process, so jobs
//     are stored but NOT executed unless an external scheduler hits the API or
//     "Run now" is used.
//   - Each process runs its own tick, so a multi-process deployment could
//     execute a job once per process; run one process or use "Run now" only.

import crypto from "crypto";
import { store } from "./store.js";
import { safeFetch, SafeFetchError } from "./safeFetch.js";

const MAX_HISTORY = 50;
const TICK_MS = 30000;
const MAX_SEARCH_STEPS = 366 * 24 * 60; // look ahead at most one year

const MACROS = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *"
};

const FIELD_RANGES = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7] // day of week (7 == 0)
];

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Feb 29 is allowed here (leap years exist); 30/31 February and 31 April etc.
// are impossible in every year.
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** True when at least one (month, day-of-month) pair named by the fields can occur. */
function hasPossibleDate(fields) {
  for (const month of fields.month) {
    for (const dom of fields.dom) {
      if (dom <= DAYS_IN_MONTH[month - 1]) return true;
    }
  }
  return false;
}

function expandField(field, [min, max], fieldName) {
  const values = new Set();
  for (const part of field.split(",")) {
    const match = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!match) throw new Error(`Invalid ${fieldName} field: "${part}".`);
    const [, base, stepStr] = match;
    const step = stepStr ? Number(stepStr) : 1;
    if (step < 1 || step > Math.max(max, 1)) {
      throw new Error(`Invalid step in ${fieldName} field: "${part}".`);
    }
    let from = min;
    let to = max;
    if (base !== "*") {
      if (base.includes("-")) {
        const [a, b] = base.split("-").map(Number);
        from = a;
        to = b;
      } else {
        from = Number(base);
        to = base.includes("/") ? max : Number(base);
      }
      if (from < min || to > max || from > to) {
        throw new Error(`${fieldName} value out of range (${min}-${max}): "${part}".`);
      }
    }
    for (let v = from; v <= to; v += step) values.add(v);
  }
  return values;
}

/** Parse a 5-field cron expression (or @macro). Returns {ok, fields?, error?}. */
export function parseCron(expr) {
  if (typeof expr !== "string" || !expr.trim()) {
    return { ok: false, error: "Schedule is empty." };
  }
  let normalized = expr.trim().toLowerCase();
  if (MACROS[normalized]) normalized = MACROS[normalized];
  const parts = normalized.split(/\s+/);
  if (parts.length !== 5) {
    return {
      ok: false,
      error: "Schedule must have 5 fields: minute hour day-of-month month day-of-week."
    };
  }
  try {
    const [minute, hour, dom, month, dow] = [
      expandField(parts[0], FIELD_RANGES[0], "minute"),
      expandField(parts[1], FIELD_RANGES[1], "hour"),
      expandField(parts[2], FIELD_RANGES[2], "day-of-month"),
      expandField(parts[3], FIELD_RANGES[3], "month"),
      expandField(parts[4], FIELD_RANGES[4], "day-of-week")
    ];
    // Standard cron treats day-of-week 7 as Sunday (0). Date.getUTCDay()
    // only ever returns 0-6, so 7 must be normalized or it would never match.
    if (dow.has(7)) {
      dow.delete(7);
      dow.add(0);
    }
    return { ok: true, fields: { minute, hour, dom, month, dow } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export const validateCron = parseCron;

function dayMatches(fields, date) {
  const domMatch = fields.dom.has(date.getUTCDate());
  const dowMatch = fields.dow.has(date.getUTCDay());
  // Vixie cron semantics: when both day fields are restricted, either may match.
  const domRestricted = fields.dom.size < 31;
  const dowRestricted = fields.dow.size < 7;
  if (domRestricted && dowRestricted) return domMatch || dowMatch;
  if (domRestricted) return domMatch;
  if (dowRestricted) return dowMatch;
  return true;
}

/** First time (UTC, minute precision) strictly after `from` that matches. */
export function nextRunAfter(expr, from = new Date()) {
  const parsed = parseCron(expr);
  if (!parsed.ok) return null;
  const { fields } = parsed;

  const cursor = new Date(from.getTime());
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  for (let i = 0; i < MAX_SEARCH_STEPS; i++) {
    if (
      fields.month.has(cursor.getUTCMonth() + 1) &&
      dayMatches(fields, cursor) &&
      fields.hour.has(cursor.getUTCHours()) &&
      fields.minute.has(cursor.getUTCMinutes())
    ) {
      return new Date(cursor.getTime());
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return null;
}

/** Best-effort human description; falls back to the raw expression. */
export function describeCron(expr) {
  const trimmed = typeof expr === "string" ? expr.trim() : "";
  const parsed = parseCron(trimmed);
  if (!parsed.ok) return trimmed;
  const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
  // Macro names (@daily etc.) describe their expanded form — no recursion.
  const expanded = MACROS[normalized] || normalized;
  if (expanded === "*/5 * * * *") return "every 5 minutes";
  if (expanded === "*/10 * * * *") return "every 10 minutes";
  if (expanded === "*/30 * * * *") return "every 30 minutes";
  if (expanded === "* * * * *") return "every minute";
  if (expanded === "0 * * * *") return "every hour, on the hour";
  if (expanded === "0 9 * * *") return "daily at 09:00 UTC";
  if (expanded === "0 9 * * 1-5") return "weekdays at 09:00 UTC";
  if (expanded === "0 0 * * 0") return "every Sunday at 00:00 UTC";

  const macroKey = Object.keys(MACROS).find((k) => MACROS[k] === expanded);
  const [min, hour, dom, month, dow] = expanded.split(/\s+/);

  const bits = [];
  if (hour !== "*" && !hour.includes("/")) bits.push(`${hour.padStart(2, "0")}:${min.padStart(2, "0")} UTC`);
  else if (min !== "*" && !min.includes("/")) bits.push(`at minute ${min}`);
  if (min.startsWith("*/")) bits.push(`every ${min.slice(2)} minutes`);
  if (dow !== "*") bits.push(`on ${dow.split(",").map((d) => DOW_NAMES[Number(d) % 7] || d).join(", ")}`);
  if (dom !== "*") bits.push(`on day ${dom} of the month`);
  if (month !== "*") bits.push(`in month ${month.split(",").map((m) => MONTH_NAMES[Number(m) - 1] || m).join(", ")}`);
  const text = bits.length ? bits.join(" ") : trimmed;
  return macroKey ? `${macroKey} (${text})` : text;
}

// ----------------------------------------------------------------- jobs

let idCounter = 0;
const newId = () => `job_${Date.now().toString(36)}_${(idCounter++).toString(36)}${crypto.randomBytes(2).toString("hex")}`;

export async function listJobs() {
  return store().get("cron-jobs", []);
}

async function pushHistory(entry) {
  await store().update("cron-history", [], (history) => {
    history.unshift(entry);
    history.splice(MAX_HISTORY);
  });
}

export async function listHistory() {
  return store().get("cron-history", []);
}

/** Validate a job-creation request. Returns {ok, errors, value}. */
export function validateJobInput(input = {}) {
  const errors = {};
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  if (!name) errors.name = "Job name is required.";

  const schedule = typeof input.schedule === "string" ? input.schedule.trim() : "";
  const cronCheck = parseCron(schedule);
  if (!cronCheck.ok) {
    errors.schedule = cronCheck.error;
  } else if (!hasPossibleDate(cronCheck.fields)) {
    // Reject before the (expensive) forward scan: these can never match.
    errors.schedule = "This schedule names a date that never occurs (for example 30 February).";
  } else if (nextRunAfter(schedule, new Date()) === null) {
    // A statically possible date that does not occur within the search window
    // (only leap-year-only dates). Reject rather than silently never running.
    errors.schedule =
      "This schedule does not match within the next year. Leap-year-only dates such as 29 February are not supported.";
  }

  let action = null;
  const rawAction = input.action;
  if (rawAction && typeof rawAction === "object") {
    const type = rawAction.type === "log" ? "log" : rawAction.type === "webhook" ? rawAction.type : null;
    if (!type) {
      errors.action = 'Action type must be "webhook" or "log".';
    } else if (type === "webhook") {
      const url = typeof rawAction.url === "string" ? rawAction.url.trim() : "";
      const method =
        typeof rawAction.method === "string" && rawAction.method
          ? rawAction.method.toUpperCase()
          : "POST";
      let body = null;
      if (rawAction.body !== undefined && rawAction.body !== null && rawAction.body !== "") {
        const raw = typeof rawAction.body === "string" ? rawAction.body : JSON.stringify(rawAction.body);
        try {
          JSON.parse(raw);
          body = raw.slice(0, 20000);
        } catch {
          errors.action = "Job payload must be valid JSON.";
        }
      }
      if (!url) errors.action = "Webhook URL is required for webhook actions.";
      else if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        errors.action = "Unsupported webhook method.";
      }
      if (!errors.action) action = { type, url, method, body };
    } else {
      action = { type: "log" };
    }
  } else {
    errors.action = "An action is required.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { name, schedule, action }
  };
}

export async function createJob(input, owner) {
  const check = validateJobInput(input);
  if (!check.ok) return { ok: false, errors: check.errors };
  const now = new Date();
  const job = {
    id: newId(),
    ...check.value,
    enabled: true,
    // Owner scoping: jobs created after this field was introduced belong to
    // the creating account; legacy jobs without an owner stay shared so
    // existing deployments keep working.
    ...(owner ? { owner } : {}),
    createdAt: now.toISOString(),
    nextRunAt: nextRunAfter(check.value.schedule, now)?.toISOString() || null,
    lastRun: null
  };
  // Locked update so two concurrent creates both land in the stored array.
  await store().update("cron-jobs", [], (jobs) => {
    jobs.push(job);
  });
  return { ok: true, job };
}

/** A job can be listed/edited/run by `owner` when it has no owner (legacy) or matches. */
export function canManage(job, owner) {
  if (!job || typeof owner !== "string" || !owner) return false;
  return !job.owner || job.owner === owner;
}

/** Jobs visible to `owner` (their own plus legacy ownerless jobs). */
export async function visibleJobs(owner) {
  const jobs = await listJobs();
  return jobs.filter((j) => canManage(j, owner));
}

export async function updateJob(id, patch = {}) {
  try {
    return await store().update("cron-jobs", [], (jobs) => {
      const job = jobs.find((j) => j.id === id);
      if (!job) {
        const err = new Error("Job not found.");
        err.code = "not_found";
        throw err;
      }

      const wantsEdit =
        patch.name !== undefined || patch.schedule !== undefined || patch.action !== undefined;
      if (wantsEdit) {
        const merged = {
          name: patch.name !== undefined ? patch.name : job.name,
          schedule: patch.schedule !== undefined ? patch.schedule : job.schedule,
          action: patch.action !== undefined ? patch.action : job.action
        };
        const check = validateJobInput(merged);
        if (!check.ok) {
          const err = new Error("Invalid job fields.");
          err.code = "invalid";
          err.errors = check.errors;
          throw err;
        }
        job.name = check.value.name;
        job.schedule = check.value.schedule;
        job.action = check.value.action;
      }

      if (typeof patch.enabled === "boolean") job.enabled = patch.enabled;

      if ((wantsEdit || patch.enabled === true) && job.enabled) {
        job.nextRunAt = nextRunAfter(job.schedule, new Date())?.toISOString() || null;
      }

      return { ok: true, job };
    });
  } catch (err) {
    if (err && err.code === "not_found") return { ok: false, code: "not_found" };
    if (err && err.code === "invalid") return { ok: false, errors: err.errors };
    throw err;
  }
}

export async function deleteJob(id) {
  try {
    return await store().update("cron-jobs", [], (jobs) => {
      const next = jobs.filter((j) => j.id !== id);
      if (next.length === jobs.length) {
        const err = new Error("Job not found.");
        err.code = "not_found";
        throw err;
      }
      jobs.length = 0;
      jobs.push(...next);
      return { ok: true };
    });
  } catch (err) {
    if (err && err.code === "not_found") return { ok: false, code: "not_found" };
    throw err;
  }
}

// -------------------------------------------------------------- running

async function executeJob(job) {
  const startedAt = new Date().toISOString();
  let ok = true;
  let summary;

  if (job.action.type === "webhook") {
    try {
      const res = await safeFetch(job.action.url, {
        method: job.action.method || "POST",
        headers: { "Content-Type": "application/json" },
        body: job.action.body || null,
        timeoutMs: 10000
      });
      ok = res.ok;
      summary = `HTTP ${res.status} in ${res.ms}ms${res.truncated ? " (body truncated)" : ""}`;
    } catch (err) {
      ok = false;
      summary =
        err instanceof SafeFetchError
          ? `Blocked/failed: ${err.message}`
          : `Failed: ${(err && err.message) || "unknown error"}`;
    }
  } else {
    summary = "Log-only job recorded (no external action).";
  }

  const entry = {
    id: `run_${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`,
    jobId: job.id,
    jobName: job.name,
    startedAt,
    finishedAt: new Date().toISOString(),
    ok,
    summary
  };
  await pushHistory(entry);

  await store().update("cron-jobs", [], (jobs) => {
    const fresh = jobs.find((j) => j.id === job.id);
    if (fresh) fresh.lastRun = { at: entry.startedAt, ok, summary };
  });
  return entry;
}

/** Run one job immediately (synchronously reports the real result). */
export async function runJobNow(id) {
  const jobs = await listJobs();
  const job = jobs.find((j) => j.id === id);
  if (!job) return { ok: false, code: "not_found" };
  const entry = await executeJob(job);
  return { ok: true, run: entry };
}

// Ticking flag lives on globalThis so a dev-mode hot reload (which creates a
// fresh module instance) still shares it with the already running interval.
const TICKING_KEY = "__autovance_cron_ticking__";

/** Process every enabled job whose nextRunAt is due. */
export async function tick(now = new Date()) {
  const g = globalThis;
  if (g[TICKING_KEY]) return { skipped: true, executed: 0 };
  g[TICKING_KEY] = true;
  try {
    const jobs = await listJobs();
    const due = jobs.filter(
      (j) => j.enabled && j.nextRunAt && new Date(j.nextRunAt).getTime() <= now.getTime()
    );
    let executed = 0;
    for (const job of due) {
      await executeJob(job);
      // Re-read inside a locked update, mutate THAT array, and let the store
      // persist it. (An earlier version called saveJobs(listJobs()) after
      // mutating a different array, so nextRunAt was never persisted and due
      // jobs re-fired every tick.)
      await store().update("cron-jobs", [], (current) => {
        const fresh = current.find((j) => j.id === job.id);
        if (fresh) fresh.nextRunAt = nextRunAfter(fresh.schedule, now)?.toISOString() || null;
      });
      executed++;
    }
    return { executed };
  } finally {
    g[TICKING_KEY] = false;
  }
}

// In-process runner (works under `next dev` / `next start`; see header note).
const RUNNER_KEY = "__autovance_cron_runner__";

export function ensureRunner() {
  const g = globalThis;
  if (!g[RUNNER_KEY]) {
    const state = {
      startedAt: new Date().toISOString(),
      lastTickAt: null,
      intervalSeconds: TICK_MS / 1000
    };
    const timer = setInterval(() => {
      tick(new Date())
        .then(() => {
          state.lastTickAt = new Date().toISOString();
        })
        .catch((err) => {
          // Never let a bad tick crash the server.
          console.error("[cron] tick failed:", err && err.message);
        });
    }, TICK_MS);
    if (typeof timer.unref === "function") timer.unref();
    g[RUNNER_KEY] = state;
  }
  return g[RUNNER_KEY];
}

export function runnerStatus() {
  const g = globalThis;
  const runner = g[RUNNER_KEY];
  return {
    active: Boolean(runner),
    startedAt: runner ? runner.startedAt : null,
    intervalSeconds: TICK_MS / 1000,
    platform: process.env.VERCEL ? "serverless (Vercel)" : "long-running Node server"
  };
}

export function publicJob(job) {
  return {
    id: job.id,
    name: job.name,
    schedule: job.schedule,
    scheduleLabel: describeCron(job.schedule),
    action:
      job.action.type === "webhook"
        ? { type: "webhook", url: job.action.url, method: job.action.method || "POST" }
        : { type: "log" },
    enabled: job.enabled,
    createdAt: job.createdAt,
    nextRunAt: job.nextRunAt,
    lastRun: job.lastRun
  };
}
