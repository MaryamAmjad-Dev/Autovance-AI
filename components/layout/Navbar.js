import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import ThemeToggle from "../ThemeToggle";
import Avatar from "../Avatar";

// The five primary automation destinations. Secondary pages (Workflow
// Builder, Team, About) live in the shared Footer only,
// which keeps this menu simple on desktop and mobile.
const PRIMARY_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/email", label: "Email" },
  { href: "/webhook", label: "Webhook" },
  { href: "/cron", label: "Cron Jobs" },
  { href: "/form", label: "Form Actions" }
];

/**
 * The site-wide navbar: identical structure, typography, spacing, logo,
 * active states, theme toggle, and account controls on every page.
 *
 * variant:
 *   "full" — five primary links + account controls (default)
 *   "auth" — logo + theme toggle only (login / sign-up / reset pages)
 */
export default function Navbar({ variant = "full" }) {
  const router = useRouter();
  const [user, setUser] = useState(undefined); // undefined = still checking
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef(null);

  const isActive = (href) => router.pathname === href;

  // Session state (drives Login/Logout rendering).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setUser(data && data.ok ? data.user : null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close the mobile menu on outside click / Escape.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onDocClick = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) setMobileOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* network hiccup: still fall through to local state */
    }
    setUser(null);
    setMobileOpen(false);
    router.push("/");
  };

  if (variant === "auth") {
    return (
      <header className="nav" ref={headerRef}>
        <Link href="/dashboard" className="brand">
          Autovance AI
        </Link>
        <div className="right">
          <ThemeToggle />
        </div>

        <style jsx>{commonStyles}</style>
      </header>
    );
  }

  const authActions = (
    <div className="auth">
      {user === undefined ? (
        <span className="checking" aria-hidden="true">
          …
        </span>
      ) : user ? (
        <>
          <span className="userChip" title={`Logged in as ${user.email}`}>
            <Avatar size={24} />
            <span className="userEmail">{user.name || user.email}</span>
          </span>
          <button type="button" className="logout" onClick={logout}>
            Log out
          </button>
        </>
      ) : (
        <>
          <Link href="/login" className={`loginLink ${isActive("/login") ? "active" : ""}`}>
            Log in
          </Link>
          <Link href="/signup" className="signupBtn">
            Sign up
          </Link>
        </>
      )}
    </div>
  );

  return (
    <>
      <header className="nav" ref={headerRef}>
        <Link href="/dashboard" className="brand">
          Autovance AI
        </Link>

        <nav className="links" aria-label="Main navigation">
          {PRIMARY_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`link ${isActive(link.href) ? "active" : ""}`}
            >
              {link.label}
            </Link>
          ))}
          {authActions}
          <ThemeToggle />
        </nav>

        {/* Mobile controls */}
        <div className="mobileControls">
          <ThemeToggle />
          <button
            type="button"
            className="burger"
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((v) => !v)}
          >
            <span className={`bar ${mobileOpen ? "x1" : ""}`} />
            <span className={`bar ${mobileOpen ? "hide" : ""}`} />
            <span className={`bar ${mobileOpen ? "x3" : ""}`} />
          </button>
        </div>
      </header>

      {/* Mobile panel (animated) */}
      <div id="mobile-menu" className={`mobilePanel ${mobileOpen ? "open" : ""}`}>
        <p className="groupLabel">Menu</p>
        {PRIMARY_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`mlink ${isActive(link.href) ? "active" : ""}`}
          >
            {link.label}
          </Link>
        ))}
        <div className="mauth">{authActions}</div>
      </div>

      <style jsx>{commonStyles}</style>
    </>
  );
}

const commonStyles = `
  .nav {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 28px;
    background: var(--panel-bg);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--card-border);
    transition: background-color 0.25s ease, border-color 0.25s ease;
  }

  .brand {
    font-size: 20px;
    font-weight: 700;
    white-space: nowrap;
    transition: text-shadow 0.25s ease;
  }

  .brand:hover {
    text-shadow: 0 0 12px #a855f7;
  }

  .right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .links {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .link {
    padding: 8px 10px;
    border: none;
    background: none;
    font-size: 14px;
    color: var(--page-text);
    opacity: 0.85;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: opacity 0.2s ease, text-shadow 0.2s ease, border-color 0.2s ease;
  }

  .link:hover {
    opacity: 1;
    text-shadow: 0 0 10px #a855f7;
  }

  .link.active {
    opacity: 1;
    border-bottom-color: #a855f7;
    text-shadow: 0 0 10px rgba(168, 85, 247, 0.6);
  }

  .auth {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: 6px;
  }

  .checking {
    opacity: 0.5;
  }

  .userChip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .userEmail {
    font-size: 13px;
    color: var(--page-hint);
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .loginLink {
    font-size: 14px;
    padding: 8px 10px;
    opacity: 0.85;
  }

  .loginLink:hover {
    opacity: 1;
    text-shadow: 0 0 10px #a855f7;
  }

  .loginLink.active {
    opacity: 1;
    border-bottom: 2px solid #a855f7;
  }

  .signupBtn {
    font-size: 14px;
    padding: 8px 14px;
    border-radius: 8px;
    background: linear-gradient(135deg, #8b5cf6, #6366f1);
    color: #ffffff;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .signupBtn:hover {
    transform: translateY(-1px);
    box-shadow: 0 0 14px rgba(168, 85, 247, 0.5);
  }

  .logout {
    font-size: 13px;
    padding: 7px 12px;
    border-radius: 8px;
    border: 1px solid var(--input-border);
    background: transparent;
    color: var(--page-text);
    cursor: pointer;
    transition: border-color 0.2s ease, text-shadow 0.2s ease;
  }

  .logout:hover {
    border-color: #a855f7;
    text-shadow: 0 0 8px rgba(168, 85, 247, 0.6);
  }

  /* ---- mobile ---- */
  .mobileControls {
    display: none;
    align-items: center;
    gap: 10px;
  }

  .burger {
    display: inline-flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    width: 40px;
    height: 40px;
    padding: 8px;
    border: 1px solid var(--card-border);
    border-radius: 8px;
    background: var(--card-bg);
    cursor: pointer;
  }

  .bar {
    display: block;
    height: 2px;
    width: 100%;
    background: var(--page-text);
    border-radius: 2px;
    transition: transform 0.25s ease, opacity 0.2s ease;
  }

  .bar.x1 {
    transform: translateY(6px) rotate(45deg);
  }

  .bar.hide {
    opacity: 0;
  }

  .bar.x3 {
    transform: translateY(-6px) rotate(-45deg);
  }

  .mobilePanel {
    display: none;
  }

  @media (max-width: 900px) {
    .nav {
      padding: 10px 16px;
    }

    .links {
      display: none;
    }

    .mobileControls {
      display: flex;
    }

    .mobilePanel {
      display: block;
      position: sticky;
      top: 62px;
      z-index: 49;
      background: var(--card-bg);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--card-border);
      max-height: 0;
      overflow: hidden;
      opacity: 0;
      /* visibility keeps the closed panel's links out of the tab order and
         the accessibility tree; the delay lets the closing animation finish. */
      visibility: hidden;
      transition: max-height 0.3s ease, opacity 0.25s ease, visibility 0s linear 0.3s;
    }

    .mobilePanel.open {
      max-height: 70vh;
      overflow-y: auto;
      opacity: 1;
      visibility: visible;
      transition: max-height 0.3s ease, opacity 0.25s ease, visibility 0s;
      padding: 8px 16px 14px;
    }

    .groupLabel {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--page-hint);
      margin: 10px 0 4px;
    }

    .mlink {
      display: block;
      padding: 11px 8px;
      font-size: 15px;
      color: var(--page-text);
      border-bottom: none;
      border-left: 2px solid transparent;
      border-radius: 6px;
      transition: background 0.15s ease;
    }

    .mlink:hover {
      background: var(--subtle-bg);
      text-shadow: none;
    }

    .mlink.active {
      border-left-color: #a855f7;
      background: var(--subtle-bg);
      text-shadow: none;
    }

    .mauth {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--card-border);
    }
  }
`;
