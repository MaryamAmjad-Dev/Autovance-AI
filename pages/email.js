import { useState } from "react";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import ParticleBackground from "../components/layout/ParticleBackground";
import { requireAuth } from "../lib/requireAuth";
import { describeAiFailure } from "../lib/aiError";
import {
  EMAIL_LANGUAGES,
  getLanguage,
  buildEmailPrompt,
  parseGeneratedEmail,
  likelyLanguageMismatch
} from "../lib/emailLanguage";

export async function getServerSideProps(ctx) {
  return requireAuth(ctx);
}

export default function EmailPage() {
  // AI generator
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState("english");
  const [draft, setDraft] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState("");
  const [genWarning, setGenWarning] = useState("");

  // Real sending
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({});
  const [sendState, setSendState] = useState(null); // {type:'success'|'error'|'blocked'|'loading', ...}
  const [showPreview, setShowPreview] = useState(false);

  const lang = getLanguage(language);

  // Editing any field invalidates a success banner: it described the previous
  // content, not what is now in the form.
  const onFieldChange = (setter) => (e) => {
    setter(e.target.value);
    setSendState((prev) => (prev && prev.type === "success" ? null : prev));
  };

  const changeLanguage = (e) => {
    setLanguage(e.target.value);
    setGenWarning(""); // any previous script hint referred to the old language
  };

  const generateEmail = async () => {
    if (!prompt.trim() || genLoading) return;
    setGenLoading(true);
    setGenError("");
    setGenWarning("");

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: buildEmailPrompt(prompt.trim(), language) })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.result) {
        setGenError(describeAiFailure(res.status, data));
      } else {
        const parsed = parseGeneratedEmail(data.result);
        setDraft(parsed.body || data.result);
        setDraftSubject(parsed.subject);
        // Advisory only. Urdu has a detectable script; for English and Roman
        // Urdu no reliable detector exists, so none is claimed.
        if (likelyLanguageMismatch(data.result, language)) {
          setGenWarning(
            "No Urdu script was detected in the generated text. The model may have ignored the language instruction; edit the draft or generate it again."
          );
        }
      }
    } catch {
      setGenError(describeAiFailure(0, null));
    } finally {
      setGenLoading(false);
    }
  };

  const useAsMessage = () => {
    setMessage(draft);
    if (!subject.trim()) {
      setSubject(draftSubject || (prompt.trim() ? `Re: ${prompt.trim().slice(0, 80)}` : ""));
    }
    setSendState(null); // the banner described older content
  };

  const sendEmail = async () => {
    if (sendState && sendState.type === "loading") return; // no duplicate sends
    setErrors({});
    setSendState(null);

    // Client-side checks (the server re-validates).
    const local = {};
    if (!to.trim()) local.to = "Recipient email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to.trim())) local.to = "Enter a valid recipient email.";
    if (!subject.trim()) local.subject = "Subject is required.";
    if (!message.trim()) local.message = "Message body is required.";
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }

    setSendState({ type: "loading" });
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), subject: subject.trim(), message, language })
      });
      const data = await res.json().catch(() => null);

      if (res.status === 503) {
        setSendState({
          type: "blocked",
          message: (data && data.message) || "Email provider is not configured.",
          missing: (data && data.missing) || []
        });
      } else if (!res.ok || !data || !data.ok) {
        setErrors((data && data.errors) || {});
        setSendState({
          type: "error",
          message: (data && data.message) || `Sending failed (${res.status}).`
        });
      } else {
        // Only reached when the provider API actually accepted the message.
        setSendState({ type: "success", message: data.message, provider: data.provider });
      }
    } catch {
      setSendState({ type: "error", message: "Network error while sending." });
    }
  };

  return (
    <div className="container">
      <ParticleBackground count={60} />
      <Navbar />

      <main className="center">
        <h1 className="title">Email Automation ✉️</h1>
        <p className="subtitle">Generate smart emails using AI, then send them through your configured provider</p>

        {/* AI GENERATOR */}
        <section className="panel">
          <h2>1. Generate with AI</h2>
          <div className="langRow">
            <label className="aui-label" htmlFor="email-language">Language</label>
            <select
              id="email-language"
              className="aui-select"
              value={language}
              onChange={changeLanguage}
              disabled={genLoading}
            >
              {EMAIL_LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
            <span className="langHint">
              {lang.rtl ? "Right-to-left (Urdu script)" : "Left-to-right"}
            </span>
          </div>

          <div className="inputBox">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Write email for client meeting..."
              aria-label="Email topic"
              onKeyDown={(e) => { if (e.key === "Enter") generateEmail(); }}
              disabled={genLoading}
            />
            <button onClick={generateEmail} disabled={genLoading}>
              {genLoading && <span className="spinner" aria-hidden="true" />}
              {genLoading ? "Generating..." : "Generate Email"}
            </button>
          </div>

          {genError && <div className="aui-error" role="alert">{genError}</div>}
          {genWarning && <div className="aui-note" role="status">⚠️ {genWarning}</div>}

          {draft && (
            <div className="draftBox" dir={lang.rtl ? "rtl" : "ltr"} lang={lang.lang}>
              <h3>
                Generated Email{" "}
                <span className="aiTag">model-generated · unverified</span>
              </h3>
              {draftSubject && (
                <p className="draftSubject"><strong>Subject:</strong> {draftSubject}</p>
              )}
              <p>{draft}</p>
              <button className="aui-button secondary small" onClick={useAsMessage}>
                Use as message below
              </button>
            </div>
          )}
        </section>

        {/* REAL SENDING */}
        <section className="panel">
          <h2>2. Send</h2>

          {sendState && sendState.type === "success" && (
            <div className="aui-success" role="status">
              ✅ {sendState.message}
            </div>
          )}
          {sendState && sendState.type === "error" && (
            <div className="aui-error" role="alert">❌ {sendState.message}</div>
          )}
          {sendState && sendState.type === "blocked" && (
            <div className="aui-note" role="status">
              ⚠️ <strong>Missing configuration.</strong> {sendState.message}
              {sendState.missing.length > 0 && (
                <> Set <code>{sendState.missing.join(" and ")}</code> in the server environment to enable sending.</>
              )}
            </div>
          )}

          <div className="aui-field">
            <label className="aui-label" htmlFor="email-to">To</label>
            <input
              id="email-to"
              className="aui-input"
              type="email"
              placeholder="recipient@example.com"
              value={to}
              onChange={onFieldChange(setTo)}
              aria-invalid={errors.to ? "true" : undefined}
              aria-describedby={errors.to ? "email-to-error" : undefined}
            />
            {errors.to && <p className="aui-field-error" id="email-to-error">{errors.to}</p>}
          </div>

          <div className="aui-field">
            <label className="aui-label" htmlFor="email-subject">Subject</label>
            <input
              id="email-subject"
              className="aui-input"
              type="text"
              placeholder="Subject line"
              value={subject}
              onChange={onFieldChange(setSubject)}
              dir={lang.rtl ? "rtl" : undefined}
              lang={lang.rtl ? lang.lang : undefined}
              aria-invalid={errors.subject ? "true" : undefined}
              aria-describedby={errors.subject ? "email-subject-error" : undefined}
            />
            {errors.subject && <p className="aui-field-error" id="email-subject-error">{errors.subject}</p>}
          </div>

          <div className="aui-field">
            <label className="aui-label" htmlFor="email-message">Message</label>
            <textarea
              id="email-message"
              className="aui-textarea"
              placeholder="Write or paste the email body..."
              value={message}
              onChange={onFieldChange(setMessage)}
              dir={lang.rtl ? "rtl" : undefined}
              lang={lang.rtl ? lang.lang : undefined}
              aria-invalid={errors.message ? "true" : undefined}
              aria-describedby={errors.message ? "email-message-error" : undefined}
            />
            {errors.message && <p className="aui-field-error" id="email-message-error">{errors.message}</p>}
          </div>

          {showPreview && (
            <div className="previewBox" role="status">
              <h3>
                Preview <span className="previewMeta">{lang.label} · {lang.rtl ? "right-to-left" : "left-to-right"}</span>
              </h3>
              <p className="previewLine"><strong>To:</strong> {to || <em>not set</em>}</p>
              <p className="previewLine"><strong>Subject:</strong> {subject || <em>not set</em>}</p>
              <div
                className="previewBody"
                dir={lang.rtl ? "rtl" : "ltr"}
                lang={lang.lang}
              >
                {message || <em>No message yet.</em>}
              </div>
            </div>
          )}

          <div className="sendRow">
            <button
              type="button"
              className="aui-button secondary"
              onClick={() => setShowPreview((v) => !v)}
              aria-expanded={showPreview}
            >
              {showPreview ? "Hide preview" : "Preview"}
            </button>
            <button className="aui-button" onClick={sendEmail} disabled={sendState && sendState.type === "loading"}>
              {sendState && sendState.type === "loading" && <span className="spinner" aria-hidden="true" />}
              {sendState && sendState.type === "loading" ? "Sending…" : "Send Email"}
            </button>
          </div>
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
          max-width: 800px;
          margin: 0 auto;
          animation: fadeUp 0.8s ease;
        }

        .title {
          font-size: 38px;
          animation: glowText 2s infinite alternate;
        }

        .subtitle {
          color: var(--page-muted);
          margin-bottom: 26px;
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

        .langRow {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }

        .langRow .aui-select {
          max-width: 220px;
        }

        .langHint {
          color: var(--page-hint);
          font-size: 12px;
        }

        .inputBox {
          display: flex;
          gap: 10px;
        }

        input {
          flex: 1;
          min-width: 0;
          padding: 13px;
          border-radius: 10px;
          border: 1px solid var(--input-border);
          background: var(--input-bg);
          color: var(--page-text);
          font-size: 14px;
        }

        .inputBox button {
          padding: 13px 20px;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, #8b5cf6, #6366f1);
          color: white;
          cursor: pointer;
          transition: 0.3s;
          font-size: 14px;
        }

        .inputBox button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 0 16px rgba(168,85,247,0.5);
        }

        .inputBox button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .draftBox {
          margin-top: 16px;
          padding: 16px;
          border-radius: 10px;
          background: var(--subtle-bg);
          border: 1px solid var(--card-border);
          white-space: pre-wrap;
        }

        .draftBox h3 {
          margin-bottom: 8px;
          font-size: 14px;
        }

        .aiTag {
          display: inline-block;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          padding: 2px 7px;
          border-radius: 6px;
          background: rgba(252,211,77,0.3);
          color: var(--tag-model-text);
          vertical-align: middle;
        }

        .draftSubject {
          margin-bottom: 6px;
          font-size: 13px;
        }

        .previewBox {
          margin-top: 8px;
          padding: 16px;
          border-radius: 10px;
          background: var(--subtle-bg);
          border: 1px solid var(--card-border);
        }

        .previewBox h3 {
          font-size: 14px;
          margin-bottom: 10px;
        }

        .previewMeta {
          color: var(--page-hint);
          font-weight: normal;
          font-size: 12px;
        }

        .previewLine {
          font-size: 13px;
          margin: 4px 0;
          color: var(--text-secondary);
        }

        .previewBody {
          margin-top: 10px;
          padding: 12px;
          border-radius: 8px;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          white-space: pre-wrap;
          font-size: 14px;
          line-height: 1.6;
        }

        .sendRow {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .small {
          margin-top: 12px;
          padding: 8px 12px;
          font-size: 13px;
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

          .inputBox { flex-direction: column; }

          .panel { padding: 16px; }
        }
      `}</style>
    </div>
  );
}
