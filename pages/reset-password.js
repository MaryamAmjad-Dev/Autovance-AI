// Password-reset request page.
// Honesty note: this server can only send a reset email if an email provider
// is configured (RESEND_API_KEY / SENDGRID_API_KEY + EMAIL_FROM). When it is
// not, the API answers 503 naming the missing variables and this page shows
// exactly that — it never pretends an email was sent.
import { useState } from "react";
import Link from "next/link";
import AuthShell from "../components/auth/AuthShell";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setMessage("");
    setBlocked(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setErrors({ email: "Enter a valid email address." });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "request", email: cleanEmail })
      });
      const data = await res.json().catch(() => null);
      if (res.status === 503) {
        setBlocked({
          message: (data && data.message) || "Email delivery is not configured on this server.",
          missing: (data && data.missing) || []
        });
      } else if (!res.ok || !data || !data.ok) {
        setErrors({ form: (data && data.message) || "Could not start the reset. Try again." });
      } else {
        setMessage(data.message);
      }
    } catch {
      setErrors({ form: "Network error. Try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a reset link.">
      {blocked && (
        <div className="aui-error" role="alert">
          <strong>Reset emails are unavailable.</strong> {blocked.message}
          {blocked.missing.length > 0 && (
            <>
              {" "}
              Missing configuration: <code>{blocked.missing.join(", ")}</code>.
            </>
          )}
        </div>
      )}
      {message && <div className="aui-success" role="status">{message}</div>}

      <form onSubmit={submit} noValidate>
        {errors.form && <div className="aui-error" role="alert">{errors.form}</div>}

        <div className="aui-field">
          <label className="aui-label" htmlFor="reset-email">Email</label>
          <input
            id="reset-email"
            className="aui-input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
          {errors.email && <p className="aui-field-error">{errors.email}</p>}
        </div>

        <button className="aui-button" type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading && <span className="spinner" aria-hidden="true" />}
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p style={{ marginTop: 14, fontSize: 13 }}>
        Remembered it? <Link href="/login">Back to log in</Link>
      </p>
    </AuthShell>
  );
}
