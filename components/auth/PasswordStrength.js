/**
 * Client-side password strength feedback (visual only).
 * The server independently enforces the real policy: >= 8 chars with a
 * letter and a number (lib/validate.js).
 */
export default function PasswordStrength({ password }) {
  const value = typeof password === "string" ? password : "";

  let score = 0;
  if (value.length >= 8) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/[0-9]/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  if (value.length >= 12) score++;

  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong", "Strong"];
  const label = value ? labels[Math.min(score, 5)] : "";
  const tone = score <= 1 ? "weak" : score <= 2 ? "fair" : "good";

  return (
    <div className="strength" aria-live="polite">
      <div className="bars" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`bar ${value && i < Math.min(score, 4) ? tone : ""}`} />
        ))}
      </div>
      {value && <span className={`label ${tone}`}>{label}</span>}
      <style jsx>{`
        .strength {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: -4px 0 12px;
        }

        .bars {
          display: flex;
          gap: 4px;
          flex: 1;
        }

        .bar {
          flex: 1;
          height: 4px;
          border-radius: 4px;
          background: var(--subtle-bg);
          transition: background 0.25s ease;
        }

        .bar.weak {
          background: var(--danger);
        }

        .bar.fair {
          background: var(--warning);
        }

        .bar.good {
          background: var(--success);
        }

        .label {
          font-size: 11px;
          min-width: 56px;
          text-align: right;
        }

        .label.weak {
          color: var(--danger);
        }

        .label.fair {
          color: var(--warning);
        }

        .label.good {
          color: var(--success);
        }
      `}</style>
    </div>
  );
}
