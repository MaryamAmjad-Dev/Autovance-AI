import { useState } from "react";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import ParticleBackground from "../components/layout/ParticleBackground";
import { requireAuth } from "../lib/requireAuth";

const METHODS = ["POST", "GET", "PUT", "PATCH", "DELETE"];

export async function getServerSideProps(ctx) {
  return requireAuth(ctx);
}

export default function WebhookPage() {
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("POST");
  const [headersText, setHeadersText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [callError, setCallError] = useState(null);

  // Editing the request definition invalidates the displayed response: it
  // describes the PREVIOUS request, not the one now in the form.
  const onEdit = (setter) => (e) => {
    setter(e.target.value);
    setResult(null);
    setCallError(null);
  };

  const changeMethod = (e) => {
    setMethod(e.target.value);
    setResult(null);
    setCallError(null);
  };

  const triggerWebhook = async () => {
    if (loading) return; // no duplicate in-flight requests
    setErrors({});
    setResult(null);
    setCallError(null);

    // Client-side validation for fast feedback (the server re-validates
    // everything, including the SSRF rules).
    const local = {};
    if (!url.trim()) local.url = "Webhook URL is required.";
    else if (url.trim().length > 2048) local.url = "URL is too long.";

    if (headersText.trim()) {
      try {
        const parsed = JSON.parse(headersText);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          local.headers = 'Headers must be a JSON object like {"X-Key": "value"}.';
        }
      } catch {
        local.headers = "Headers must be valid JSON.";
      }
    }
    if (bodyText.trim()) {
      try {
        JSON.parse(bodyText);
      } catch {
        local.body = "Payload must be valid JSON.";
      }
      if (!local.body && (method === "GET" || method === "DELETE")) {
        local.body = `${method} requests cannot include a payload.`;
      }
    }
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          method,
          headers: headersText.trim() || undefined,
          body: bodyText.trim() || undefined
        })
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data || !data.ok) {
        setErrors((data && data.errors) || {});
        setCallError({
          message: (data && data.message) || `Request failed (${res.status}).`,
          code: data && data.code
        });
      } else {
        setResult(data.result);
      }
    } catch {
      setCallError({ message: "Network error while calling the webhook API." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <ParticleBackground count={60} />
      <Navbar />

      <main className="center">
        <h1 className="title">Webhook Automation 🔗</h1>
        <p className="subtitle">Trigger any API with a validated, SSRF-protected server-side request</p>

        <section className="panel">
          <div className="aui-field">
            <label className="aui-label" htmlFor="wh-url">Endpoint URL</label>
            <input
              id="wh-url"
              className="aui-input"
              type="url"
              placeholder="https://example.com/api/hook"
              value={url}
              onChange={onEdit(setUrl)}
              onKeyDown={(e) => { if (e.key === "Enter") triggerWebhook(); }}
              disabled={loading}
              aria-invalid={errors.url ? "true" : undefined}
              aria-describedby={errors.url ? "wh-url-error" : undefined}
            />
            {errors.url && <p className="aui-field-error" id="wh-url-error">{errors.url}</p>}
            <p className="hint">
              Requests are proxied through the server. Localhost, private-network
              addresses, unsafe protocols and redirect bypasses are blocked.
            </p>
          </div>

          <div className="row">
            <div className="aui-field methodField">
              <label className="aui-label" htmlFor="wh-method">Method</label>
              <select
                id="wh-method"
                className="aui-select"
                value={method}
                onChange={changeMethod}
                disabled={loading}
              >
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {errors.method && <p className="aui-field-error" id="wh-method-error">{errors.method}</p>}
            </div>
          </div>

          <div className="aui-field">
            <label className="aui-label" htmlFor="wh-headers">Headers (optional JSON)</label>
            <textarea
              id="wh-headers"
              className="aui-textarea mono"
              placeholder={'{"X-Custom-Header": "value"}'}
              value={headersText}
              onChange={onEdit(setHeadersText)}
              disabled={loading}
              aria-invalid={errors.headers ? "true" : undefined}
              aria-describedby={errors.headers ? "wh-headers-error" : undefined}
            />
            {errors.headers && <p className="aui-field-error" id="wh-headers-error">{errors.headers}</p>}
          </div>

          <div className="aui-field">
            <label className="aui-label" htmlFor="wh-body">Payload (optional JSON)</label>
            <textarea
              id="wh-body"
              className="aui-textarea mono"
              placeholder={'{"message": "Triggered from Autovance AI"}'}
              value={bodyText}
              onChange={onEdit(setBodyText)}
              disabled={loading}
              aria-invalid={errors.body ? "true" : undefined}
              aria-describedby={errors.body ? "wh-body-error" : undefined}
            />
            {errors.body && <p className="aui-field-error" id="wh-body-error">{errors.body}</p>}
          </div>

          <button className="aui-button" onClick={triggerWebhook} disabled={loading}>
            {loading && <span className="spinner" aria-hidden="true" />}
            {loading ? "Sending..." : "Trigger Webhook"}
          </button>
        </section>

        {callError && (
          <div className="aui-error" role="alert">
            <strong>
              {callError.code === "blocked"
                ? "Blocked by safety rules."
                : callError.code === "timeout"
                ? "Timed out."
                : "Request failed."}
            </strong>{" "}
            {callError.message}
          </div>
        )}

        {result && (
          <section className="panel resultPanel">
            <h2>
              Response{" "}
              <span className={`status ${result.ok ? "ok" : "bad"}`}>
                HTTP {result.status} {result.statusText}
              </span>
              <span className="meta">
                {result.ms}ms{result.redirected ? " · followed a validated redirect" : ""}
                {result.truncated ? " · body truncated" : ""}
              </span>
            </h2>
            <pre className="response">{result.body || "(empty body)"}</pre>
          </section>
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
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .hint {
          font-size: 12px;
          color: var(--page-hint);
          margin-top: 6px;
        }

        .methodField {
          width: 160px;
        }

        .mono {
          font-family: monospace;
          font-size: 13px;
        }

        .status {
          font-size: 12px;
          padding: 3px 9px;
          border-radius: 6px;
        }

        .status.ok {
          background: rgba(34,197,94,0.2);
          color: var(--success);
        }

        .status.bad {
          background: rgba(239,68,68,0.2);
          color: var(--danger);
        }

        .meta {
          font-size: 12px;
          color: var(--page-hint);
          font-weight: normal;
        }

        .response {
          background: var(--subtle-bg);
          border: 1px solid var(--card-border);
          border-radius: 8px;
          padding: 14px;
          font-size: 13px;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 320px;
          overflow: auto;
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
        }
      `}</style>
    </div>
  );
}
