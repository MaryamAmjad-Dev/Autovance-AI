import { useCallback, useEffect, useRef, useState } from "react";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import ParticleBackground from "../components/layout/ParticleBackground";
import { requireAuth } from "../lib/requireAuth";
import { describeAiFailure } from "../lib/aiError";

const FIELD_TYPES = ["text", "email", "number", "textarea", "select"];

const newFieldDraft = () => ({
  name: `field_${Math.random().toString(36).slice(2, 7)}`,
  label: "",
  type: "text",
  required: false
});

// Stored-submission timestamps are rendered in UTC with an explicit label so
// they cannot be misread against the UTC-based scheduler times elsewhere.
const formatSubmissionTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleString("en-GB", { timeZone: "UTC", hour12: false })} UTC`;
};

export async function getServerSideProps(ctx) {
  return requireAuth(ctx);
}

export default function FormPage() {
  const [schema, setSchema] = useState(null);
  const [followupConfigured, setFollowupConfigured] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  // Configuration editor state
  const [formName, setFormName] = useState("");
  const [fields, setFields] = useState([]);
  const [configErrors, setConfigErrors] = useState({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [configNotice, setConfigNotice] = useState(null);

  // Submission state
  const [values, setValues] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const submittingRef = useRef(false); // closes the double-submit window

  // Stored submissions (read back so saved data is actually visible)
  const [submissions, setSubmissions] = useState([]);
  const [submissionsTotal, setSubmissionsTotal] = useState(0);
  const [subsError, setSubsError] = useState("");

  // Optional AI assist (existing /api/ai feature, kept)
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [aiError, setAiError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/form");
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setLoadError((data && data.message) || `Could not load the form (${res.status}).`);
      } else {
        setSchema(data.schema);
        setFollowupConfigured(Boolean(data.followupConfigured));
        setFormName(data.schema.name);
        setFields(data.schema.fields.map((f) => ({ ...f })));
        setLoadError("");
      }
    } catch {
      setLoadError("Network error while loading the form.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const refreshSubmissions = useCallback(async () => {
    try {
      const res = await fetch("/api/form?submissions=1");
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.ok) {
        setSubmissions(Array.isArray(data.submissions) ? data.submissions : []);
        setSubmissionsTotal(Number(data.total) || 0);
        setSubsError("");
      } else {
        setSubsError((data && data.message) || `Could not load submissions (${res.status}).`);
      }
    } catch {
      setSubsError("Network error while loading submissions.");
    }
  }, []);

  useEffect(() => {
    refreshSubmissions();
  }, [refreshSubmissions]);

  const updateField = (i, patch) => {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
    // A saved-configuration banner described the previous configuration.
    setConfigNotice(null);
  };

  const saveConfig = async () => {
    if (savingConfig) return; // no duplicate saves in flight
    setConfigErrors({});
    setConfigNotice(null);

    const local = {};
    if (!formName.trim()) local.name = "Form name is required.";
    fields.forEach((f, i) => {
      if (!f.label || !f.label.trim()) local[`Field ${i + 1}`] = "Every field needs a label.";
      if (!/^[a-z][a-z0-9_-]{0,29}$/.test(String(f.name || "").trim())) {
        local[`Field ${i + 1} key`] = "Keys must be lowercase letters/digits/_/- and start with a letter.";
      }
      if (f.type === "select") {
        const opts = (f.options || []).map((o) => String(o).trim()).filter(Boolean);
        if (opts.length === 0) local[`Field ${i + 1} options`] = "Select fields need at least one option.";
        if (opts.length > 20) local[`Field ${i + 1} options`] = "Select fields allow at most 20 options.";
      }
    });
    if (fields.length === 0) local.fields = "Add at least one field.";
    if (Object.keys(local).length > 0) {
      setConfigErrors(local);
      return;
    }

    setSavingConfig(true);
    try {
      const res = await fetch("/api/form", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          fields: fields.map((f) => ({
            name: f.name.trim(),
            label: f.label.trim(),
            type: f.type,
            required: Boolean(f.required),
            ...(f.type === "select"
              ? {
                  options: (f.options || [])
                    .map((o) => String(o).trim())
                    .filter(Boolean)
                    .slice(0, 20)
                }
              : {}),
            ...(f.type === "textarea" ? { maxLength: 2000 } : { maxLength: 500 })
          }))
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setConfigErrors((data && data.errors) || {});
        setConfigNotice({ type: "error", message: (data && data.message) || "Could not save the configuration." });
      } else {
        setSchema(data.schema);
        setConfigNotice({ type: "success", message: "Form configuration saved." });
      }
    } catch {
      setConfigNotice({ type: "error", message: "Network error while saving." });
    } finally {
      setSavingConfig(false);
    }
  };

  const submitForm = async () => {
    if (submittingRef.current) return; // no duplicate submissions in flight
    setFieldErrors({});
    setSubmitError("");
    setSubmitResult(null);
    setAiResult("");

    // Client mirror of the rules for instant feedback (server re-validates).
    const local = {};
    (schema.fields || []).forEach((f) => {
      const v = String(values[f.name] || "").trim();
      const max = Number.isInteger(f.maxLength) ? f.maxLength : 500;
      if (!v && f.required) local[f.name] = `${f.label} is required.`;
      else if (v && v.length > max) local[f.name] = `${f.label} must be at most ${max} characters.`;
      else if (v && f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
        local[f.name] = `${f.label} must be a valid email address.`;
      } else if (v && f.type === "number" && Number.isNaN(Number(v))) {
        local[f.name] = `${f.label} must be a number.`;
      }
    });
    if (Object.keys(local).length > 0) {
      setFieldErrors(local);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch("/api/form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setFieldErrors((data && data.errors) || {});
        setSubmitError((data && data.message) || `Submission failed (${res.status}).`);
      } else {
        setSubmitResult(data);
        // Show what was actually persisted, straight from the server.
        refreshSubmissions();
      }
    } catch {
      setSubmitError("Network error while submitting.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const suggestAI = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiError("");
    try {
      const summary = (schema.fields || [])
        .map((f) => `${f.label}: ${values[f.name] || "(empty)"}`)
        .join(" · ");
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: `Generate a smart response for this form submission: ${summary}` })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.result) {
        setAiError(describeAiFailure(res.status, data));
      } else {
        setAiResult(data.result);
      }
    } catch {
      setAiError(describeAiFailure(0, null));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="container">
      <ParticleBackground count={50} />
      <Navbar />

      <main className="center">
        <h1 className="title">📩 Form Actions</h1>
        <p className="subtitle">
          Configure fields, collect validated submissions, and run a follow-up action
        </p>

        {loading && (
          <p className="spinnerRow"><span className="spinner" aria-hidden="true" /> Loading form…</p>
        )}
        {loadError && <div className="aui-error" role="alert">{loadError}</div>}

        {schema && !loading && (
          <>
            {/* 1. CONFIGURATION */}
            <section className="panel">
              <h2>1. Configure fields</h2>

              {configNotice && (
                <div
                  className={configNotice.type === "success" ? "aui-success" : "aui-error"}
                  role={configNotice.type === "success" ? "status" : "alert"}
                >
                  {configNotice.message}
                </div>
              )}
              {configErrors.fields && <div className="aui-error" role="alert">{configErrors.fields}</div>}

              <div className="aui-field">
                <label className="aui-label" htmlFor="form-name">Form name</label>
                <input
                  id="form-name"
                  className="aui-input"
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    setConfigNotice(null); // banner described the previous save
                  }}
                  disabled={savingConfig}
                  aria-invalid={configErrors.name ? "true" : undefined}
                  aria-describedby={configErrors.name ? "form-name-error" : undefined}
                />
                {configErrors.name && <p className="aui-field-error" id="form-name-error">{configErrors.name}</p>}
              </div>

              {fields.map((f, i) => (
                <div key={i} className="fieldRow">
                  {/* Every server-side key for this row ("Field 2",
                      "Field 2 label", "Field 2 options", …) renders here.
                      The trailing-space check keeps "Field 1" from also
                      matching "Field 10". */}
                  {Object.entries(configErrors)
                    .filter(
                      ([k]) =>
                        k === `Field ${i + 1}` || k.startsWith(`Field ${i + 1} `)
                    )
                    .map(([k, msg]) => (
                      <p key={k} className="aui-field-error">{msg}</p>
                    ))}
                  <input
                    className="aui-input labelIn"
                    placeholder="Label"
                    value={f.label || ""}
                    onChange={(e) => updateField(i, { label: e.target.value })}
                    disabled={savingConfig}
                    aria-label={`Label for field ${i + 1}`}
                  />
                  <input
                    className="aui-input keyIn mono"
                    placeholder="key"
                    value={f.name || ""}
                    onChange={(e) => updateField(i, { name: e.target.value })}
                    disabled={savingConfig}
                    aria-label={`Key for field ${i + 1}`}
                  />
                  <select
                    className="aui-select typeIn"
                    value={f.type}
                    onChange={(e) =>
                      updateField(i, {
                        type: e.target.value,
                        // A brand-new select needs at least one option to be valid.
                        ...(e.target.value === "select" &&
                        (!Array.isArray(f.options) || f.options.length === 0)
                          ? { options: ["Option 1"], optionsRaw: "Option 1" }
                          : {})
                      })
                    }
                    disabled={savingConfig}
                    aria-label={`Type for field ${i + 1}`}
                  >
                    {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <label className="reqIn">
                    <input
                      type="checkbox"
                      checked={Boolean(f.required)}
                      onChange={(e) => updateField(i, { required: e.target.checked })}
                      disabled={savingConfig}
                    />{" "}
                    required
                  </label>
                  <button
                    className="aui-button danger small"
                    onClick={() => {
                      setFields((prev) => prev.filter((_, idx) => idx !== i));
                      setConfigNotice(null);
                    }}
                    disabled={savingConfig}
                  >
                    Remove
                  </button>
                  {f.type === "select" && (
                    <input
                      className="aui-input optionsIn"
                      placeholder="Options, comma-separated (e.g. Yes, No, Maybe)"
                      value={
                        typeof f.optionsRaw === "string"
                          ? f.optionsRaw
                          : (f.options || []).join(", ")
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        updateField(i, {
                          optionsRaw: raw,
                          // Keep the parsed array in sync for saving/validation,
                          // but display the raw text so commas survive typing.
                          options: raw
                            .split(",")
                            .map((o) => o.trim())
                            .filter((o) => o.length > 0)
                        });
                      }}
                      disabled={savingConfig}
                      aria-label={`Options for field ${i + 1} (comma-separated)`}
                    />
                  )}
                </div>
              ))}

              <div className="configActions">
                <button className="aui-button secondary" onClick={() => setFields((p) => [...p, newFieldDraft()])} disabled={savingConfig}>
                  + Add field
                </button>
                <button className="aui-button" onClick={saveConfig} disabled={savingConfig}>
                  {savingConfig && <span className="spinner" aria-hidden="true" />}
                  {savingConfig ? "Saving…" : "Save configuration"}
                </button>
              </div>
            </section>

            {/* 2. LIVE FORM */}
            <section className="panel">
              <h2>2. Fill &amp; submit</h2>

              <div className="aui-note">
                Follow-up action:{" "}
                {followupConfigured ? (
                  <>Configured. Submissions are forwarded to the follow-up webhook.</>
                ) : (
                  <>No follow-up webhook is configured (<code>FORM_FOLLOWUP_WEBHOOK_URL</code> is unset), so submissions are only stored.</>
                )}
              </div>

              {submitError && <div className="aui-error" role="alert">{submitError}</div>}
              {submitResult && (
                <div className="aui-success" role="status">
                  ✅ Submission stored{submitResult.submission ? ` (${submitResult.submission.id})` : ""}.
                  {submitResult.followup && submitResult.followup.executed && (
                    <> Follow-up: {submitResult.followup.ok ? "✅" : "❌"} {submitResult.followup.summary}.</>
                  )}
                  {submitResult.followup && !submitResult.followup.executed && (
                    <> No follow-up executed ({submitResult.followup.reason}).</>
                  )}
                </div>
              )}

              {(schema.fields || []).map((f) => {
                // Editing any value invalidates the "stored" banner: it
                // described a previous submission, not the current values.
                const onValue = (e) => {
                  const value = e.target.value;
                  setValues((v) => ({ ...v, [f.name]: value }));
                  setSubmitResult(null);
                  setSubmitError("");
                  setAiResult("");
                  setAiError("");
                };
                return (
                <div key={f.name} className="aui-field">
                  <label className="aui-label" htmlFor={`live-${f.name}`}>
                    {f.label}{f.required ? " *" : ""}
                  </label>
                  {f.type === "textarea" ? (
                    <textarea
                      id={`live-${f.name}`}
                      className="aui-textarea"
                      value={values[f.name] || ""}
                      onChange={onValue}
                      disabled={submitting}
                      aria-invalid={fieldErrors[f.name] ? "true" : undefined}
                      aria-describedby={fieldErrors[f.name] ? `live-err-${f.name}` : undefined}
                    />
                  ) : f.type === "select" ? (
                    <select
                      id={`live-${f.name}`}
                      className="aui-select"
                      value={values[f.name] || ""}
                      onChange={onValue}
                      disabled={submitting}
                      aria-invalid={fieldErrors[f.name] ? "true" : undefined}
                      aria-describedby={fieldErrors[f.name] ? `live-err-${f.name}` : undefined}
                    >
                      <option value="">Choose…</option>
                      {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      id={`live-${f.name}`}
                      className="aui-input"
                      type={f.type === "number" ? "number" : f.type === "email" ? "email" : "text"}
                      value={values[f.name] || ""}
                      onChange={onValue}
                      disabled={submitting}
                      aria-invalid={fieldErrors[f.name] ? "true" : undefined}
                      aria-describedby={fieldErrors[f.name] ? `live-err-${f.name}` : undefined}
                    />
                  )}
                  {fieldErrors[f.name] && (
                    <p className="aui-field-error" id={`live-err-${f.name}`}>{fieldErrors[f.name]}</p>
                  )}
                </div>
                );
              })}

              <button className="aui-button" onClick={submitForm} disabled={submitting}>
                {submitting && <span className="spinner" aria-hidden="true" />}
                {submitting ? "Submitting…" : "Submit"}
              </button>

              {submitResult && (
                <div className="aiAssist">
                  <button className="aui-button secondary" onClick={suggestAI} disabled={aiLoading}>
                    {aiLoading && <span className="spinner" aria-hidden="true" />}
                    {aiLoading ? "Thinking…" : "Suggest an AI reply (optional)"}
                  </button>
                  {aiError && <p className="aui-field-error">{aiError}</p>}
                  {aiResult && (
                    <div className="aiOut">
                      <p>{aiResult}</p>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* 3. STORED SUBMISSIONS */}
            <section className="panel">
              <h2>3. Stored submissions ({submissionsTotal})</h2>
              <div className="subsActions">
                <p className="subsNote">
                  Shows the most recent submissions read back from server storage.
                </p>
                <button className="aui-button secondary small" onClick={refreshSubmissions}>
                  Refresh
                </button>
              </div>
              {subsError && <div className="aui-error" role="alert">{subsError}</div>}
              {submissions.length === 0 && !subsError && (
                <p className="empty">No submissions stored yet.</p>
              )}
              <ul className="subsList">
                {submissions.map((s) => (
                  <li key={s.id} className="subItem">
                    <span className="subMeta">
                      {formatSubmissionTime(s.submittedAt)} · {s.id}
                      {s.submittedBy ? ` · by ${s.submittedBy}` : ""}
                    </span>
                    <dl className="subValues">
                      {Object.entries(s.values || {}).map(([k, v]) => (
                        <div key={k} className="subValue">
                          <dt>{k}</dt>
                          <dd>{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
              {submissionsTotal > submissions.length && (
                <p className="subsNote">
                  Showing the {submissions.length} most recent of {submissionsTotal} stored.
                </p>
              )}
            </section>
          </>
        )}
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
          max-width: 820px;
          margin: 0 auto;
          animation: fadeUp 0.8s ease;
        }

        .title {
          font-size: 38px;
          animation: glowText 2s infinite alternate;
        }

        .subtitle {
          color: var(--page-muted);
          margin-bottom: 24px;
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

        .fieldRow {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          padding: 10px;
          border: 1px solid var(--card-border);
          border-radius: 10px;
          margin-bottom: 10px;
          background: var(--subtle-bg);
        }

        .labelIn { flex: 2 1 160px; }
        .keyIn { flex: 1 1 110px; }
        .typeIn { flex: 0 0 110px; width: auto; }

        .reqIn {
          font-size: 13px;
          color: var(--text-secondary);
          display: inline-flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
        }

        .mono { font-family: monospace; }

        .small { padding: 7px 10px; font-size: 12px; }

        .configActions {
          display: flex;
          gap: 10px;
          margin-top: 6px;
          flex-wrap: wrap;
        }

        .aiAssist {
          margin-top: 16px;
        }

        .aiOut {
          margin-top: 10px;
          padding: 14px;
          border-radius: 8px;
          background: var(--subtle-bg);
          border: 1px solid var(--card-border);
          font-size: 14px;
          white-space: pre-wrap;
        }

        .aiOut .aiTag {
          display: inline-block;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          padding: 2px 7px;
          border-radius: 6px;
          background: rgba(252,211,77,0.3);
          color: var(--tag-model-text);
          white-space: normal;
          margin-bottom: 6px;
        }

        .aiOut p {
          margin: 0;
          white-space: pre-wrap;
        }

        .optionsIn {
          flex: 1 0 100%;
        }

        .empty {
          color: var(--page-hint);
          font-size: 14px;
        }

        .subsActions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 8px;
        }

        .subsNote {
          color: var(--page-hint);
          font-size: 12px;
          margin: 0;
        }

        .subsList {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .subItem {
          padding: 10px;
          border: 1px solid var(--card-border);
          border-radius: 10px;
          margin-bottom: 8px;
          background: var(--subtle-bg);
        }

        .subMeta {
          display: block;
          font-size: 12px;
          color: var(--page-hint);
          margin-bottom: 6px;
          word-break: break-word;
        }

        .subValues {
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .subValue {
          display: flex;
          gap: 8px;
          font-size: 13px;
        }

        .subValue dt {
          font-weight: 600;
          min-width: 110px;
          word-break: break-word;
        }

        .subValue dd {
          margin: 0;
          color: var(--text-secondary);
          word-break: break-word;
          white-space: pre-wrap;
        }

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

          .fieldRow { flex-direction: column; align-items: stretch; }

          .typeIn { width: 100%; }
        }
      `}</style>
    </div>
  );
}
