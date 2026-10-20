// Cron jobs API (session required, per-user ownership).
//
//   GET    -> list jobs owned by the caller + recent history + scheduler status
//   POST   -> create a job  { name, schedule, action }   (owned by caller)
//             run now       { action: "run", id }
//   PATCH  -> enable/disable { id, enabled }
//             edit fields    { id, name?, schedule?, action? } (any subset)
//   DELETE -> remove        { id }
//
// Vercel cron invocation (Authorization: Bearer ${CRON_SECRET}) -> run every
// due job once and report the result. On serverless there is no long-lived
// in-process runner, so scheduled execution happens inside this invocation.
//
// Ownership: jobs created after owner scoping belong to the creating account.
// Legacy jobs without an owner field stay visible/manageable to any signed-in
// account so existing deployments keep working. Jobs the caller does not own
// report 404 "Job not found." (no existence disclosure).
//
// Jobs persist via lib/store.js (Postgres in production, in-memory for tests).
// Automatic execution happens only while a long-lived Node server is running
// or when Vercel's cron invokes this route; the response always reports the
// real scheduler status instead of claiming more.

import crypto from "crypto";
import { getUserFromRequest } from "../../lib/auth.js";
import {
  ensureRunner,
  runnerStatus,
  listJobs,
  listHistory,
  createJob,
  updateJob,
  deleteJob,
  runJobNow,
  canManage,
  visibleJobs,
  publicJob,
  tick
} from "../../lib/scheduler.js";

const notFound = (res) =>
  res.status(404).json({ ok: false, code: "not_found", message: "Job not found." });

/**
 * True when the request carries `Authorization: Bearer <CRON_SECRET>` with
 * the configured secret. Compared as SHA-256 digests via timingSafeEqual so
 * neither the value nor its length leaks through the comparison.
 */
function cronAuthorized(req) {
  const secret =
    typeof process.env.CRON_SECRET === "string" ? process.env.CRON_SECRET.trim() : "";
  if (!secret) return false;
  const header = String((req.headers && req.headers.authorization) || "");
  if (!header.startsWith("Bearer ")) return false;
  const provided = header.slice("Bearer ".length);
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (cronAuthorized(req)) {
    // Scheduler invocation: no session, no cookie — run what is due and say
    // exactly what happened.
    const result = await tick();
    return res.status(200).json({
      ok: true,
      invokedBy: "cron_secret",
      executed: result.executed ?? 0,
      skipped: Boolean(result.skipped),
      scheduler: runnerStatus()
    });
  }

  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Not authenticated. Log in first." });
  }
  const owner = user.email;

  ensureRunner();

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      jobs: (await visibleJobs(owner)).map(publicJob),
      history: await listHistory(),
      scheduler: runnerStatus()
    });
  }

  if (req.method === "POST") {
    const body = req.body || {};

    if (body.action === "run") {
      if (typeof body.id !== "string" || !body.id) {
        return res.status(400).json({ ok: false, message: "Provide a job id." });
      }
      const jobs = await listJobs();
      const job = jobs.find((j) => j.id === body.id);
      if (!job || !canManage(job, owner)) return notFound(res);
      const result = await runJobNow(body.id);
      if (!result.ok) return notFound(res);
      return res.status(200).json({ ok: true, run: result.run });
    }

    const created = await createJob(body, owner);
    if (!created.ok) {
      return res.status(400).json({
        ok: false,
        errors: created.errors,
        message: "Please fix the highlighted fields."
      });
    }
    return res.status(201).json({ ok: true, job: publicJob(created.job) });
  }

  if (req.method === "PATCH") {
    const body = req.body || {};
    if (typeof body.id !== "string" || !body.id) {
      return res.status(400).json({ ok: false, message: "Provide a job id." });
    }
    const jobs = await listJobs();
    const job = jobs.find((j) => j.id === body.id);
    if (!job || !canManage(job, owner)) return notFound(res);

    const patch = {};
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (body.name !== undefined) patch.name = body.name;
    if (body.schedule !== undefined) patch.schedule = body.schedule;
    if (body.action !== undefined) patch.action = body.action;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({
        ok: false,
        message: "Provide an enabled flag or the job fields to edit."
      });
    }

    const updated = await updateJob(body.id, patch);
    if (!updated.ok) {
      if (updated.code === "not_found") return notFound(res);
      return res.status(400).json({
        ok: false,
        errors: updated.errors,
        message: "Please fix the highlighted fields."
      });
    }
    return res.status(200).json({ ok: true, job: publicJob(updated.job) });
  }

  if (req.method === "DELETE") {
    const id = (req.body && req.body.id) || (req.query && req.query.id);
    if (typeof id !== "string" || !id) {
      return res.status(400).json({ ok: false, message: "Provide a job id." });
    }
    const jobs = await listJobs();
    const job = jobs.find((j) => j.id === id);
    if (!job || !canManage(job, owner)) return notFound(res);
    const removed = await deleteJob(id);
    if (!removed.ok) return notFound(res);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ ok: false, error: "Method not allowed." });
}

// Vercel: a tick may run several due jobs (each with its own fetch budget).
export const config = { maxDuration: 60 };
