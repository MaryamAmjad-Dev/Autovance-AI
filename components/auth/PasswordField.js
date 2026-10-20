import { useState } from "react";

/**
 * Password input with an accessible show/hide (eye) toggle.
 * Used by Login, Sign Up (password + confirm), and the reset confirmation
 * fields. The eye button sits inside the input; padding keeps text from
 * overlapping it, and the accessible label reflects the current state.
 */
export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete = "current-password",
  placeholder = "",
  disabled = false,
  error
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="aui-field">
      <label className="aui-label" htmlFor={id}>
        {label}
      </label>
      <div className="wrap">
        <input
          id={id}
          className="aui-input"
          style={{ paddingRight: 46 }}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        <button
          type="button"
          className="eye"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
          aria-pressed={visible}
          disabled={disabled}
          tabIndex={0}
        >
          {visible ? (
            /* eye-off */
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <path d="M1 1l22 22" />
            </svg>
          ) : (
            /* eye */
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {error && <p className="aui-field-error">{error}</p>}

      <style jsx>{`
        .wrap {
          position: relative;
          display: block;
        }
        .wrap :global(.aui-input) {
          width: 100%;
        }
        .eye {
          position: absolute;
          top: 50%;
          right: 8px;
          transform: translateY(-50%);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          padding: 0;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--page-hint);
          cursor: pointer;
          transition: color 0.2s ease, background 0.2s ease;
        }
        .eye:hover {
          color: var(--page-text);
          background: var(--subtle-bg);
        }
        .eye:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 1px;
        }
      `}</style>
    </div>
  );
}
