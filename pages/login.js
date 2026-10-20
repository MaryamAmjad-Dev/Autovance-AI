import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import AuthShell from "../components/auth/AuthShell";
import PasswordField from "../components/auth/PasswordField";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  // Only same-site paths are accepted as post-login destinations.
  const nextDestination = () => {
    const next = typeof router.query.next === "string" ? router.query.next : "";
    return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  };

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setFormError("");

    const local = {};
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) local.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) local.email = "Enter a valid email address.";
    if (!password) local.password = "Password is required.";
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setErrors((data && data.errors) || {});
        setFormError((data && data.message) || "Login failed. Try again.");
      } else {
        router.push(nextDestination());
      }
    } catch {
      setFormError("Network error while logging in. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Log in" subtitle="Access your Autovance AI automations.">
      <form onSubmit={submit} noValidate>
        {formError && <div className="aui-error" role="alert">{formError}</div>}

        <div className="aui-field">
          <label className="aui-label" htmlFor="login-email">Email</label>
          <input
            id="login-email"
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
          id="login-password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="Your password"
          disabled={loading}
          error={errors.password}
        />
        {errors.form && <p className="aui-field-error">{errors.form}</p>}

        <button className="aui-button" type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading && <span className="spinner" aria-hidden="true" />}
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p style={{ marginTop: 14, fontSize: 13 }}>
        Forgot your password? <Link href="/reset-password">Reset it</Link>
      </p>
      <p style={{ marginTop: 6, fontSize: 13 }}>
        Don&apos;t have an account? <Link href="/signup">Sign up</Link>
      </p>
    </AuthShell>
  );
}
