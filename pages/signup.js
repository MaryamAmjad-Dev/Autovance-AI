// Sign-up page. (This file was empty before and broke `next build`;
// it is now a real, validated sign-up flow backed by /api/auth/signup.)
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import AuthShell from "../components/auth/AuthShell";
import PasswordStrength from "../components/auth/PasswordStrength";
import PasswordField from "../components/auth/PasswordField";

export default function Signup() {
  const router = useRouter();

  // Same safe next-parameter handling as the login page: only same-site
  // paths ("/…", not "//…" or absolute URLs) are honoured.
  const nextDestination = () => {
    const next = typeof router.query.next === "string" ? router.query.next : "";
    return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  };

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setFormError("");

    // Mirror of the server policy for fast feedback (server re-validates).
    const local = {};
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName) local.name = "Name is required.";
    else if (cleanName.length < 2) local.name = "Name must be at least 2 characters.";
    if (!cleanEmail) local.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) local.email = "Enter a valid email address.";
    if (password.length < 8) local.password = "Password must be at least 8 characters long.";
    else if (!/[a-zA-Z]/.test(password)) local.password = "Password must contain at least one letter.";
    else if (!/[0-9]/.test(password)) local.password = "Password must contain at least one number.";
    if (confirm !== password) local.confirm = "Passwords do not match.";
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName, email: cleanEmail, password, confirm })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setErrors((data && data.errors) || {});
        setFormError((data && data.message) || "Sign-up failed. Try again.");
      } else {
        // Session cookie is set by the API — continue to the requested page
        // (or the dashboard when no safe next parameter was supplied).
        router.push(nextDestination());
      }
    } catch {
      setFormError("Network error while signing up. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Start automating with Autovance AI.">
      <form onSubmit={submit} noValidate>
        {formError && <div className="aui-error" role="alert">{formError}</div>}

        <div className="aui-field">
          <label className="aui-label" htmlFor="signup-name">Name</label>
          <input
            id="signup-name"
            className="aui-input"
            type="text"
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
          />
          {errors.name && <p className="aui-field-error">{errors.name}</p>}
        </div>

        <div className="aui-field">
          <label className="aui-label" htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
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

        <PasswordField
          id="signup-password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          placeholder="At least 8 characters with a letter and a number"
          disabled={loading}
          error={errors.password}
        />

        <PasswordStrength password={password} />

        <PasswordField
          id="signup-confirm"
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          placeholder="Repeat your password"
          disabled={loading}
          error={errors.confirm}
        />

        <button className="aui-button" type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading && <span className="spinner" aria-hidden="true" />}
          {loading ? "Creating account…" : "Sign up"}
        </button>
      </form>

      <p style={{ marginTop: 14, fontSize: 13 }}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </AuthShell>
  );
}
