#!/usr/bin/env node
// Evaluation runner for the /workflows research prototype (RESEARCH.md §6).
//
// Usage:
//   node scripts/evaluate.mjs plan
//       Print the frozen run plan summary and suite hash. No network. Always safe.
//
//   node scripts/evaluate.mjs run [--base http://localhost:3000] [--reps 3]
//                                 [--delay 3500] [--limit N] [--out evaluation/<runId>]
//       Execute the frozen plan against a RUNNING app, storing every raw
//       response verbatim (plus inputs, timestamps and failures) under the
//       output directory. Never overwrites an existing run.
//
//   node scripts/evaluate.mjs score <run-dir>
//       (Re)compute the metrics report from stored records only. No network,
//       no model calls — fully reproducible from the raw data.
//
// Exit codes: 0 = run/report completed (a fully BLOCKED run still exits 0 but
// its report says RESULTS PENDING); 2 = usage error; 3 = infrastructure error
// (cannot write output, missing run directory).
//
// Honesty rules enforced here:
//   - raw responses are stored byte-for-byte as received (JSON re-serialized
//     only for storage; `rawBody` keeps the exact text);
//   - unavailable requests (503 not configured, 429, 5xx, network errors) are
//     recorded, never dropped;
//   - no API key is ever printed, committed, or read into the report — only
//     the model slug from server metadata.

import fs from "fs";
import path from "path";
import { runPlan, scenarioSuiteHash, formatReport, summariseRun } from "../lib/evaluation.js";

const USAGE = `usage:
  node scripts/evaluate.mjs plan
  node scripts/evaluate.mjs run [--base URL] [--reps N] [--delay MS] [--limit N] [--out DIR]
  node scripts/evaluate.mjs score <run-dir>`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function nowIso() {
  return new Date().toISOString();
}

function planCommand() {
  const plan = runPlan({ reps: 3 });
  console.log("Frozen evaluation plan (RESEARCH.md §6)");
  console.log(`  suite hash:    ${scenarioSuiteHash()}`);
  console.log(`  scenarios:     8 x variants plain/context/foil x 3 reps = ${plan.length} requests`);
  console.log("  metrics:       M1–M8 as defined in RESEARCH.md §6.1");
  console.log("");
  console.log("Run with a live server:");
  console.log("  npm run dev   # or: npm start (after npm run build)");
  console.log("  node scripts/evaluate.mjs run --base http://localhost:3000");
  return 0;
}

async function runCommand(args) {
  const base = String(args.base || "http://localhost:3000").replace(/\/$/, "");
  const reps = Math.max(1, Number(args.reps || 3) || 3);
  const delayMs = Math.max(0, Number(args.delay || 3500) || 3500);
  const limit = args.limit ? Math.max(1, Number(args.limit) || 0) : Infinity;

  const plan = runPlan({ reps }).slice(0, limit);
  const runId = `run-${nowIso().replace(/[:.]/g, "-")}`;
  const outDir = args.out ? String(args.out) : path.join("evaluation", runId);

  if (fs.existsSync(outDir)) {
    console.error(`error: ${outDir} already exists — refusing to overwrite a previous run`);
    return 3;
  }
  fs.mkdirSync(path.join(outDir, "raw"), { recursive: true });

  const manifest = {
    runId,
    startedAt: nowIso(),
    finishedAt: null,
    suiteHash: scenarioSuiteHash(),
    base,
    reps,
    planned: plan.length,
    delayMs,
    model: null, // filled from the first successful response metadata
    note: "Raw outputs stored verbatim under raw/. Results are pending until scored."
  };

  const records = [];
  let rateLimitSleepMs = 0;

  for (let i = 0; i < plan.length; i += 1) {
    const item = plan[i];
    if (rateLimitSleepMs > 0) {
      await new Promise((r) => setTimeout(r, rateLimitSleepMs));
      rateLimitSleepMs = 0;
    }

    const record = {
      scenarioId: item.scenarioId,
      variant: item.variant,
      repetition: item.repetition,
      input: item.input,
      timestamp: nowIso(),
      httpStatus: null,
      latencyMs: null,
      response: null,
      rawBody: null,
      error: null
    };

    const started = Date.now();
    try {
      const res = await fetch(`${base}/api/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.input),
        signal: AbortSignal.timeout(60000)
      });
      record.latencyMs = Date.now() - started;
      record.httpStatus = res.status;
      record.rawBody = await res.text();
      try {
        record.response = JSON.parse(record.rawBody);
      } catch {
        record.response = null;
        record.error = "response_not_json";
      }
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after"));
        rateLimitSleepMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 60000;
      }
      if (!manifest.model && record.response && record.response.meta && record.response.meta.model) {
        manifest.model = record.response.meta.model;
      }
    } catch (err) {
      record.latencyMs = Date.now() - started;
      record.error = `network: ${(err && err.message) || "unknown"}`;
    }

    records.push(record);
    const rawName = `${String(i + 1).padStart(3, "0")}-${item.scenarioId}-${item.variant}-r${item.repetition}.json`;
    fs.writeFileSync(path.join(outDir, "raw", rawName), JSON.stringify(record, null, 2), "utf8");

    const status = record.error || record.httpStatus;
    console.log(`[${i + 1}/${plan.length}] ${item.scenarioId}/${item.variant}/r${item.repetition} -> ${status}`);

    if (i < plan.length - 1 && delayMs > 0 && rateLimitSleepMs === 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  manifest.finishedAt = nowIso();
  fs.writeFileSync(path.join(outDir, "records.json"), JSON.stringify(records, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  const summary = summariseRun(records);
  writeReport(outDir, manifest, records);

  console.log("");
  console.log(`Run stored: ${outDir}`);
  console.log(
    `Outcomes: responded ${summary.counts.responded}, parse-failure ${summary.counts.parse_fail}, unavailable ${summary.counts.unavailable}`
  );
  if (summary.blocked) {
    console.log("RESULTS PENDING/BLOCKED: no model output produced — see REPORT.md.");
  } else {
    console.log(`Report: ${path.join(outDir, "REPORT.md")}`);
  }
  return 0;
}

function writeReport(outDir, manifest, records) {
  const report = formatReport(manifest, records);
  fs.writeFileSync(path.join(outDir, "REPORT.md"), report, "utf8");
}

function scoreCommand(args) {
  const dir = args._[1];
  if (!dir) {
    console.error("error: score requires a run directory\n" + USAGE);
    return 2;
  }
  const manifestPath = path.join(dir, "manifest.json");
  const recordsPath = path.join(dir, "records.json");
  if (!fs.existsSync(manifestPath) || !fs.existsSync(recordsPath)) {
    console.error(`error: ${dir} does not look like a run directory (manifest.json / records.json missing)`);
    return 3;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const records = JSON.parse(fs.readFileSync(recordsPath, "utf8"));
  writeReport(dir, manifest, records);

  const summary = summariseRun(records);
  console.log(`Scored ${records.length} records from ${dir}`);
  console.log(
    `Outcomes: responded ${summary.counts.responded}, parse-failure ${summary.counts.parse_fail}, unavailable ${summary.counts.unavailable}`
  );
  if (summary.blocked) console.log("RESULTS PENDING/BLOCKED — report states pending, no numbers inferred.");
  console.log(`Report: ${path.join(dir, "REPORT.md")}`);
  return 0;
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  if (command === "plan") return planCommand();
  if (command === "run") return runCommand(args);
  if (command === "score") return scoreCommand({ ...args, _: [command, ...args._] });

  console.error(USAGE);
  return 2;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`fatal: ${(err && err.stack) || err}`);
    process.exit(3);
  });
