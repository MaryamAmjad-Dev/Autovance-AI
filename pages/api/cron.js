// Cron jobs API (session required, per-user ownership).
//
//   GET    -> list jobs owned by the caller + recent history + scheduler status
//   POST   -> create a job  { name, schedule, action }   (owned by caller)
//             run now       { action: "run", id }
//   PATCH  -> enable/disable { id, enabled }
//             edit fields    { id, name?, schedule?, action? } (any subset)
//   DELETE -> remove        { id }
//
// Ownership: jobs created after owner scoping belong to the creating account.
// Legacy jobs without an owner field stay visible/manageable to any signed-in
// account so existing deployments keep working. Jobs the caller does not own
// report 404 "Job not found." (no existence disclosure).
//
// Jobs persist to data/cron-jobs.json. Automatic execution happens only while
// a long-lived Node server is running (see lib/scheduler.js); the response
// always reports the real scheduler status instead of claiming more.

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
  publicJob
} from "../../lib/scheduler.js";

const notFound = (res) =>
  res.status(404).json({ ok: false, code: "not_found", message: "Job not found." });

export default async function handler(req, res) {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Not authenticated. Log in first." });
  }
  const owner = user.email;

  ensureRunner();

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      jobs: visibleJobs(owner).map(publicJob),
      history: listHistory(),
      scheduler: runnerStatus()
    });
  }

  if (req.method === "POST") {
    const body = req.body || {};

    if (body.action === "run") {
      if (typeof body.id !== "string" || !body.id) {
        return res.status(400).json({ ok: false, message: "Provide a job id." });
      }
      const job = listJobs().find((j) => j.id === body.id);
      if (!job || !canManage(job, owner)) return notFound(res);
      const result = await runJobNow(body.id);
      if (!result.ok) return notFound(res);
      return res.status(200).json({ ok: true, run: result.run });
    }

    const created = createJob(body, owner);
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
    const job = listJobs().find((j) => j.id === body.id);
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

    const updated = updateJob(body.id, patch);
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
    const job = listJobs().find((j) => j.id === id);
    if (!job || !canManage(job, owner)) return notFound(res);
    const removed = deleteJob(id);
    if (!removed.ok) return notFound(res);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ ok: false, error: "Method not allowed." });
}
