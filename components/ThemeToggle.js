import { useEffect, useState } from "react";

/**
 * Shared Light/Dark theme toggle — every page renders this same control in
 * its navbar (or top corner on pages without one).
 *
 * - Sun icon = Light mode, moon icon = Dark mode, active option highlighted
 *   with the brand purple.
 * - Selection is persisted to localStorage under "theme"; the boot script in
 *   pages/_document.js applies it before first paint on the next load.
 * - State starts at "light" so server and first client render match (no
 *   hydration errors); the real value is read from <html data-theme> right
 *   after hydration.
 * - Switching updates document.documentElement immediately: CSS variables
 *   re-resolve and the whole UI changes without a page reload.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  const applyTheme = (next) => {
    if (next === theme) return;
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* storage unavailable (e.g. private mode) — theme still applies now */
    }
  };

  return (
    <div className="themeToggle" role="group" aria-label="Color theme">
      <button
        type="button"
        className={theme === "light" ? "opt active" : "opt"}
        aria-label="Switch to light mode"
        aria-pressed={theme === "light"}
        title="Light mode"
        onClick={() => applyTheme("light")}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      </button>

      <button
        type="button"
        className={theme === "dark" ? "opt active" : "opt"}
        aria-label="Switch to dark mode"
        aria-pressed={theme === "dark"}
        title="Dark mode"
        onClick={() => applyTheme("dark")}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </button>

      <style jsx>{`
        .themeToggle {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px;
          border-radius: 999px;
          background: var(--panel-bg);
          border: 1px solid var(--card-border);
          box-shadow: var(--card-shadow);
          backdrop-filter: blur(8px);
          vertical-align: middle;
          margin-left: 4px;
        }

        .opt {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          padding: 0;
          border: none;
          border-radius: 50%;
          background: transparent;
          color: var(--page-hint);
          cursor: pointer;
          transition: color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
        }

        .opt:hover {
          color: var(--page-text);
        }

        .opt.active {
          background: linear-gradient(135deg, #8b5cf6, #6366f1);
          color: #ffffff;
          box-shadow: 0 0 10px rgba(168, 85, 247, 0.5);
        }

        svg {
          display: block;
        }
      `}</style>
    </div>
  );
}
