// Password-reset confirmation page.
// Reached via the emailed link: /reset-confirm?token=…
// The token is single-use and expires after 30 minutes (lib/auth.js).
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import AuthShell from "../components/auth/AuthShell";
import PasswordField from "../components/auth/PasswordField";
import PasswordStrength from "../components/auth/PasswordStrength";

export default function ResetConfirm() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setFormError("");

    const local = {};
    if (password.length < 8) local.password = "Password must be at least 8 characters long.";
    else if (!/[a-zA-Z]/.test(password)) local.password = "Password must contain at least one letter.";
    else if (!/[0-9]/.test(password)) local.password = "Password must contain at least one number.";
    if (confirm !== password) local.confirm = "Passwords do not match.";
    if (!token) local.token = "This reset link is missing its token. Open the link from your email again.";
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "confirm", token, password, confirm })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setFormError((data && data.message) || "Could not reset the password. Request a new link.");
      } else {
        setDone(true);
      }
    } catch {
      setFormError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="Your new password is active.">
        <div className="aui-success" role="status">
          Password updated successfully.
        </div>
        {/* A link styled as the button (a real <button> inside a link would
            be nested interactive controls, which confuses assistive tech). */}
        <Link
          href="/login"
          className="aui-button"
          style={{ display: "block", width: "100%", textAlign: "center", boxSizing: "border-box" }}
        >
          Continue to log in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="The link is single-use and expires after 30 minutes.">
      <form onSubmit={submit} noValidate>
        {formError && <div className="aui-error" role="alert">{formError}</div>}
        {errors.token && <div className="aui-error" role="alert">{errors.token}</div>}

        <PasswordField
          id="new-password"
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          placeholder="At least 8 characters with a letter and a number"
          disabled={loading}
          error={errors.password}
        />

        <PasswordStrength password={password} />

        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          placeholder="Repeat the new password"
          disabled={loading}
          error={errors.confirm}
        />

        <button className="aui-button" type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading && <span className="spinner" aria-hidden="true" />}
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>

      <p style={{ marginTop: 14, fontSize: 13 }}>
        <Link href="/reset-password">Request a new reset link</Link>
      </p>
    </AuthShell>
  );
}
