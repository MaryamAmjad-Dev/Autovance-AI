import { useCallback, useEffect, useRef, useState } from "react";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import ParticleBackground from "../components/layout/ParticleBackground";
import { requireAuth } from "../lib/requireAuth";

const PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every 30 minutes", value: "*/30 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Daily at 09:00 UTC", value: "0 9 * * *" },
  { label: "Weekdays at 09:00 UTC", value: "0 9 * * 1-5" },
  { label: "Every Sunday at 00:00 UTC", value: "0 0 * * 0" },
  { label: "Custom expression…", value: "__custom" }
];

// Schedules are parsed and computed in UTC (see lib/scheduler.js), so every
// displayed timestamp is rendered in UTC with an explicit label instead of a
// silent browser-local conversion that would misrepresent when jobs run.
const formatUtc = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleString("en-GB", { timeZone: "UTC", hour12: false })} UTC`;
};

export async function getServerSideProps(ctx) {
  return requireAuth(ctx);
}

export default function CronPage() {
  const [jobs, setJobs] = useState([]);
  const [history, setHistory] = useState([]);
  const [scheduler, setScheduler] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loadingList, setLoadingList] = useState(true);

  // Create form
  const [name, setName] = useState("");
  const [preset, setPreset] = useState(PRESETS[4].value); // daily 09:00
  const [custom, setCustom] = useState("");
  const [actionType, setActionType] = useState("webhook");
  const [actionUrl, setActionUrl] = useState("");
  const [actionBody, setActionBody] = useState("");
  const [errors, setErrors] = useState({});
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState(null); // {type, message}

  const [busyId, setBusyId] = useState(null);
  // Refs close the same-tick double-click window that state alone cannot:
  // a second click can fire before React re-renders with the disabled button.
  const busyRef = useRef(null);
  const creatingRef = useRef(false);

  // Inline editing of an existing job
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState(null); // { name, preset, custom, url, body, isWebhook }
  const [editErrors, setEditErrors] = useState({});
  const [confirmDeleteId, setConfirmDeleteId] = useState(null); // two-step delete

  const claimJob = (id) => {
    if (busyRef.current) return false; // one in-flight job operation at a time
    busyRef.current = id;
    setBusyId(id);
    return true;
  };
  const releaseJob = () => {
    busyRef.current = null;
    setBusyId(null);
  };

  // Editing a create-form field invalidates the panel notice: it described
  // the previous submit, not what is now in the form.
  const onEditCreate = (setter) => (e) => {
    setter(e.target.value);
    setNotice(null);
  };

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/cron");
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setLoadError((data && data.message) || `Could not load jobs (${res.status}).`);
      } else {
        setJobs(data.jobs);
        setHistory(data.history);
        setScheduler(data.scheduler);
        setLoadError("");
      }
    } catch {
      setLoadError("Network error while loading jobs.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createJob = async () => {
    if (creatingRef.current) return; // no duplicate creation submissions
    setErrors({});
    setNotice(null);

    const schedule = preset === "__custom" ? custom.trim() : preset;
    const local = {};
    if (!name.trim()) local.name = "Job name is required.";
    if (!schedule) local.schedule = "Schedule is required.";
    if (actionType === "webhook") {
      if (!actionUrl.trim()) local.action = "Webhook URL is required for webhook actions.";
      if (actionBody.trim()) {
        try {
          JSON.parse(actionBody);
        } catch {
          local.action = "Payload must be valid JSON.";
        }
      }
    }
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }

    creatingRef.current = true;
    setCreating(true);
    try {
      const res = await fetch("/api/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          schedule,
          action:
            actionType === "webhook"
              ? { type: "webhook", url: actionUrl.trim(), method: "POST", body: actionBody.trim() || undefined }
              : { type: "log" }
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setErrors((data && data.errors) || {});
        setNotice({ type: "error", message: (data && data.message) || "Could not create the job." });
      } else {
        setNotice({ type: "success", message: `Job "${data.job.name}" created. It will run ${data.job.scheduleLabel}.` });
        setName("");
        setActionUrl("");
        setActionBody("");
        setCustom("");
        await refresh();
      }
    } catch {
      setNotice({ type: "error", message: "Network error while creating the job." });
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const toggleJob = async (job) => {
    if (!claimJob(job.id)) return;
    try {
      const res = await fetch("/api/cron", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, enabled: !job.enabled })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setNotice({ type: "error", message: (data && data.message) || "Could not update the job." });
      }
      await refresh();
    } catch {
      setNotice({ type: "error", message: "Network error while updating the job." });
    } finally {
      releaseJob();
    }
  };

  const runNow = async (job) => {
    if (!claimJob(job.id)) return;
    setNotice(null);
    try {
      const res = await fetch("/api/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", id: job.id })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok || !data.run) {
        setNotice({ type: "error", message: (data && data.message) || "Run failed." });
      } else {
        setNotice({
          type: data.run.ok ? "success" : "error",
          message: `Ran "${job.name}": ${data.run.summary}`
        });
      }
      await refresh();
    } catch {
      setNotice({ type: "error", message: "Network error while running the job." });
    } finally {
      releaseJob();
    }
  };

  const removeJob = async (job) => {
    if (!claimJob(job.id)) return;
    try {
      const res = await fetch(`/api/cron?id=${encodeURIComponent(job.id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setNotice({ type: "error", message: (data && data.message) || "Could not delete the job." });
      } else {
        setNotice({ type: "success", message: `Job "${job.name}" deleted.` });
      }
      await refresh();
    } catch {
      setNotice({ type: "error", message: "Network error while deleting the job." });
    } finally {
      setConfirmDeleteId(null);
      releaseJob();
    }
  };

  const startEdit = (job) => {
    if (busyRef.current || creatingRef.current) return;
    const presetMatch = PRESETS.find((p) => p.value === job.schedule);
    setEditErrors({});
    setConfirmDeleteId(null);
    setEditingId(job.id);
    setEdit({
      name: job.name,
      preset: presetMatch ? presetMatch.value : "__custom",
      custom: presetMatch ? "" : job.schedule,
      isWebhook: !!(job.action && job.action.type === "webhook"),
      url: job.action && job.action.type === "webhook" ? job.action.url : "",
      body:
        job.action && job.action.body && Object.keys(job.action.body).length > 0
          ? JSON.stringify(job.action.body, null, 2)
          : ""
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEdit(null);
    setEditErrors({});
  };

  const onEditChange = (setter) => (e) => {
    setter(e.target.value);
    setEditErrors({}); // previous field errors referred to the old value
  };

  const saveEdit = async () => {
    if (!editingId || !edit || busyRef.current) return;
    const schedule = edit.preset === "__custom" ? edit.custom.trim() : edit.preset;
    const local = {};
    if (!edit.name.trim()) local.name = "Job name is required.";
    if (!schedule) local.schedule = "Schedule is required.";
    if (edit.isWebhook) {
      if (!edit.url.trim()) local.action = "Webhook URL is required.";
      if (edit.body.trim()) {
        try {
          JSON.parse(edit.body);
        } catch {
          local.action = "Payload must be valid JSON.";
        }
      }
    }
    if (Object.keys(local).length > 0) {
      setEditErrors(local);
      return;
    }

    if (!claimJob(editingId)) return;
    try {
      const res = await fetch("/api/cron", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          name: edit.name.trim(),
          schedule,
          action: edit.isWebhook
            ? { type: "webhook", url: edit.url.trim(), method: "POST", body: edit.body.trim() || undefined }
            : { type: "log" }
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        // Server-side validation errors map onto the same field names.
        setEditErrors((data && data.errors) || {});
        setNotice({ type: "error", message: (data && data.message) || "Could not update the job." });
      } else {
        setNotice({ type: "success", message: `Job "${data.job.name}" updated.` });
        cancelEdit();
        await refresh();
      }
    } catch {
      setNotice({ type: "error", message: "Network error while updating the job." });
    } finally {
      releaseJob();
    }
  };

  return (
    <div className="container">
      <ParticleBackground count={50} />
      <Navbar />

      <main className="center">
        <h1 className="title">⏱ Cron Automation</h1>
        <p className="subtitle">Create, schedule, run and monitor recurring jobs</p>

        {/* Honest scheduler status */}
        <div className="aui-note" role="status">
          <strong>Scheduler status:</strong>{" "}
          {scheduler
            ? scheduler.active
              ? `In-process runner active on this server (checks every ${scheduler.intervalSeconds}s). Enabled jobs run automatically while this server stays up (the runner starts the first time this page or its API is accessed after a server restart).`
              : `No runner is active in this server process right now. Jobs are stored and can always be run manually; automatic execution needs a long-running server (npm start), and after a restart the runner starts again the first time this page or its API is accessed.`
            : "Loading…"}
          {scheduler && scheduler.platform.startsWith("serverless") && (
            <> On serverless hosting there is no long-running process, so jobs will not execute automatically here.</>
          )}
        </div>

        {/* CREATE */}
        <section className="panel">
          <h2>New job</h2>

          {notice && (
            <div className={notice.type === "success" ? "aui-success" : "aui-error"} role={notice.type === "success" ? "status" : "alert"}>
              {notice.message}
            </div>
          )}

          <div className="aui-field">
            <label className="aui-label" htmlFor="job-name">Job name</label>
            <input
              id="job-name"
              className="aui-input"
              placeholder="e.g. Daily invoice digest"
              value={name}
              onChange={onEditCreate(setName)}
              disabled={creating}
              aria-invalid={errors.name ? "true" : undefined}
              aria-describedby={errors.name ? "job-name-error" : undefined}
            />
            {errors.name && <p className="aui-field-error" id="job-name-error">{errors.name}</p>}
          </div>

          <div className="aui-field">
            <label className="aui-label" htmlFor="job-schedule">Schedule (UTC)</label>
            <select
              id="job-schedule"
              className="aui-select"
              value={preset}
              onChange={onEditCreate(setPreset)}
              disabled={creating}
              aria-invalid={errors.schedule ? "true" : undefined}
              aria-describedby={errors.schedule ? "job-schedule-error" : undefined}
            >
              {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            {preset === "__custom" && (
              <input
                id="job-custom"
                className="aui-input"
                style={{ marginTop: 8 }}
                placeholder="Cron expression, e.g. 30 8 * * 1-5"
                aria-label="Custom cron expression (minute hour day-of-month month day-of-week, UTC)"
                value={custom}
                onChange={onEditCreate(setCustom)}
                disabled={creating}
              />
            )}
            {errors.schedule && <p className="aui-field-error" id="job-schedule-error">{errors.schedule}</p>}
          </div>

          <div className="aui-field">
            <label className="aui-label" htmlFor="job-action">Action</label>
            <select
              id="job-action"
              className="aui-select"
              value={actionType}
              onChange={onEditCreate(setActionType)}
              disabled={creating}
            >
              <option value="webhook">Call a webhook (SSRF-protected)</option>
              <option value="log">Log only (no external call)</option>
            </select>
          </div>

          {actionType === "webhook" && (
            <>
              <div className="aui-field">
                <label className="aui-label" htmlFor="job-url">Webhook URL</label>
                <input
                  id="job-url"
                  className="aui-input"
                  placeholder="https://example.com/api/hook"
                  value={actionUrl}
                  onChange={onEditCreate(setActionUrl)}
                  disabled={creating}
                  aria-invalid={errors.action ? "true" : undefined}
                />
              </div>
              <div className="aui-field">
                <label className="aui-label" htmlFor="job-body">Payload (optional JSON)</label>
                <textarea
                  id="job-body"
                  className="aui-textarea mono"
                  placeholder={'{"event": "scheduled"}'}
                  value={actionBody}
                  onChange={onEditCreate(setActionBody)}
                  disabled={creating}
                  aria-invalid={errors.action ? "true" : undefined}
                />
              </div>
            </>
          )}
          {errors.action && <p className="aui-field-error" id="job-action-error">{errors.action}</p>}

          <button className="aui-button" onClick={createJob} disabled={creating}>
            {creating && <span className="spinner" aria-hidden="true" />}
            {creating ? "Creating…" : "Create job"}
          </button>
        </section>

        {/* LIST */}
        <section className="panel">
          <h2>Jobs ({jobs.length})</h2>
          {loadError && <div className="aui-error" role="alert">{loadError}</div>}
          {loadingList && (
            <p className="spinnerRow"><span className="spinner" aria-hidden="true" /> Loading jobs…</p>
          )}
          {!loadingList && jobs.length === 0 && !loadError && (
            <p className="empty">No jobs yet. Create one above.</p>
          )}

          {jobs.map((job) => (
            <div key={job.id} className="jobWrap">
              <div className={`job ${job.enabled ? "" : "disabled"}`}>
                <div className="jobInfo">
                  <strong>{job.name}</strong>
                  <span className="schedule">{job.schedule} · {job.scheduleLabel}</span>
                  <span className="action">
                    {job.action.type === "webhook"
                      ? `${job.action.method} ${job.action.url}`
                      : "Log only (no external action)"}
                  </span>
                  <span className="meta">
                    {job.enabled
                      ? `Next run: ${job.nextRunAt ? formatUtc(job.nextRunAt) : "Not scheduled"}`
                      : "Disabled"}
                    {job.lastRun
                      ? ` · Last run: ${job.lastRun.ok ? "✅" : "❌"} ${formatUtc(job.lastRun.at)} · ${job.lastRun.summary}`
                      : ""}
                  </span>
                </div>
                <div className="jobActions">
                  <button
                    className="aui-button secondary small"
                    disabled={busyId !== null || creating}
                    onClick={() => (editingId === job.id ? cancelEdit() : startEdit(job))}
                    aria-expanded={editingId === job.id}
                  >
                    {editingId === job.id ? "Cancel edit" : "Edit"}
                  </button>
                  <button
                    className="aui-button secondary small"
                    disabled={busyId !== null || creating}
                    onClick={() => runNow(job)}
                  >
                    Run now
                  </button>
                  <button
                    className="aui-button secondary small"
                    disabled={busyId !== null || creating}
                    onClick={() => toggleJob(job)}
                  >
                    {job.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    className={`aui-button ${confirmDeleteId === job.id ? "danger" : "secondary"} small`}
                    disabled={busyId !== null || creating}
                    onClick={() => {
                      if (confirmDeleteId !== job.id) {
                        setConfirmDeleteId(job.id); // first click arms confirmation
                        return;
                      }
                      removeJob(job);
                    }}
                  >
                    {confirmDeleteId === job.id ? "Confirm delete?" : "Delete"}
                  </button>
                </div>
              </div>

              {editingId === job.id && edit && (
                <div className="editBox">
                  <h3>Edit “{job.name}”</h3>

                  <div className="aui-field">
                    <label className="aui-label" htmlFor="edit-name">Job name</label>
                    <input
                      id="edit-name"
                      className="aui-input"
                      value={edit.name}
                      onChange={onEditChange((v) => setEdit({ ...edit, name: v }))}
                      disabled={busyId !== null}
                      aria-invalid={editErrors.name ? "true" : undefined}
                      aria-describedby={editErrors.name ? "edit-name-error" : undefined}
                    />
                    {editErrors.name && <p className="aui-field-error" id="edit-name-error">{editErrors.name}</p>}
                  </div>

                  <div className="aui-field">
                    <label className="aui-label" htmlFor="edit-schedule">Schedule (UTC)</label>
                    <select
                      id="edit-schedule"
                      className="aui-select"
                      value={edit.preset}
                      onChange={onEditChange((v) => setEdit({ ...edit, preset: v }))}
                      disabled={busyId !== null}
                      aria-invalid={editErrors.schedule ? "true" : undefined}
                      aria-describedby={editErrors.schedule ? "edit-schedule-error" : undefined}
                    >
                      {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    {edit.preset === "__custom" && (
                      <input
                        id="edit-custom"
                        className="aui-input"
                        style={{ marginTop: 8 }}
                        placeholder="Cron expression, e.g. 30 8 * * 1-5"
                        aria-label="Custom cron expression (minute hour day-of-month month day-of-week, UTC)"
                        value={edit.custom}
                        onChange={onEditChange((v) => setEdit({ ...edit, custom: v }))}
                        disabled={busyId !== null}
                      />
                    )}
                    {editErrors.schedule && <p className="aui-field-error" id="edit-schedule-error">{editErrors.schedule}</p>}
                  </div>

                  {edit.isWebhook && (
                    <>
                      <div className="aui-field">
                        <label className="aui-label" htmlFor="edit-url">Webhook URL</label>
                        <input
                          id="edit-url"
                          className="aui-input"
                          placeholder="https://example.com/api/hook"
                          value={edit.url}
                          onChange={onEditChange((v) => setEdit({ ...edit, url: v }))}
                          disabled={busyId !== null}
                          aria-invalid={editErrors.action ? "true" : undefined}
                        />
                      </div>
                      <div className="aui-field">
                        <label className="aui-label" htmlFor="edit-body">Payload (optional JSON)</label>
                        <textarea
                          id="edit-body"
                          className="aui-textarea mono"
                          placeholder={'{"event": "scheduled"}'}
                          value={edit.body}
                          onChange={onEditChange((v) => setEdit({ ...edit, body: v }))}
                          disabled={busyId !== null}
                          aria-invalid={editErrors.action ? "true" : undefined}
                        />
                      </div>
                    </>
                  )}
                  {editErrors.action && <p className="aui-field-error">{editErrors.action}</p>}

                  <div className="editActions">
                    <button className="aui-button small" onClick={saveEdit} disabled={busyId !== null}>
                      {busyId === editingId && <span className="spinner" aria-hidden="true" />}
                      {busyId === editingId ? "Saving…" : "Save changes"}
                    </button>
                    <button className="aui-button secondary small" onClick={cancelEdit} disabled={busyId !== null}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>

        {/* HISTORY */}
        <section className="panel">
          <h2>Execution history</h2>
          {history.length === 0 ? (
            <p className="empty">No executions recorded yet.</p>
          ) : (
            <ul className="history">
              {history.slice(0, 20).map((h) => (
                <li key={h.id} className={h.ok ? "ok" : "bad"}>
                  <span className="when">{formatUtc(h.startedAt)}</span>
                  <span className="who">{h.jobName}</span>
                  <span className="what">{h.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <Footer />

      <style jsx>{`
        .container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--page-bg);
          color: var(--page-text);
        }

        .center {
          flex: 1;
          text-align: center;
          padding: 40px 16px 10px;
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 860px;
          margin: 0 auto;
          animation: fadeUp 0.8s ease;
        }

        .title {
          font-size: 38px;
          animation: glowText 2s infinite alternate;
        }

        .subtitle {
          color: var(--page-muted);
          margin-bottom: 22px;
        }

        .panel {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          box-shadow: var(--card-shadow);
          border-radius: 14px;
          padding: 22px;
          margin-bottom: 20px;
          text-align: left;
        }

        .panel h2 {
          font-size: 15px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--page-muted);
          margin-bottom: 14px;
        }

        .empty {
          color: var(--page-hint);
          font-size: 14px;
        }

        .mono { font-family: monospace; font-size: 13px; }

        .job {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: flex-start;
          padding: 14px;
          border: 1px solid var(--card-border);
          border-radius: 10px;
          background: var(--subtle-bg);
          transition: opacity 0.2s ease;
        }

        .job.disabled { opacity: 0.6; }

        .jobWrap { margin-bottom: 10px; }

        .editBox {
          padding: 14px;
          border: 1px solid var(--focus, var(--card-border));
          border-radius: 10px;
          margin-top: -4px;
          background: var(--card-bg);
        }

        .editBox h3 {
          font-size: 13px;
          margin-bottom: 10px;
          color: var(--page-muted);
        }

        .editActions {
          display: flex;
          gap: 8px;
          margin-top: 4px;
          flex-wrap: wrap;
        }

        .jobInfo {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 13px;
          min-width: 0;
        }

        .schedule, .action, .meta {
          color: var(--page-hint);
          word-break: break-word;
        }

        .jobActions {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
          flex-wrap: wrap;
        }

        .small {
          padding: 7px 10px;
          font-size: 12px;
        }

        .history {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .history li {
          display: flex;
          gap: 12px;
          padding: 8px 4px;
          border-bottom: 1px solid var(--card-border);
          font-size: 13px;
          flex-wrap: wrap;
        }

        .history .when { color: var(--page-hint); min-width: 150px; }
        .history .who { min-width: 130px; font-weight: 600; }
        .history .ok .what { color: var(--success); }
        .history .bad .what { color: var(--danger); }

        @keyframes glowText {
          from { text-shadow: 0 0 5px #a855f7; }
          to { text-shadow: 0 0 20px #a855f7; }
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 768px) {
          .title { font-size: 28px; }

          .panel { padding: 16px; }

          .job { flex-direction: column; }

          .history .when, .history .who { min-width: 0; }
        }
      `}</style>
    </div>
  );
}
