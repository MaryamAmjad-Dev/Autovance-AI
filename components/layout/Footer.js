import Link from "next/link";
import { useEffect, useState } from "react";

// Verified destinations only (checked over HTTP on 2026-10-20):
//  - GitHub profile: github.com/MaryamAmjad-Dev returns 200 and is the owner
//    of this repository (the hyphenated variant from earlier notes 404s).
//  - LinkedIn: the project owner's profile.
const GITHUB_PROFILE_URL = "https://github.com/MaryamAmjad-Dev";
const LINKEDIN_URL = "https://www.linkedin.com/in/maryam-amjad-6a7a8m/";

const AUTOMATION_LINKS = [
  { href: "/email", label: "Email Automation" },
  { href: "/webhook", label: "Webhook Automation" },
  { href: "/cron", label: "Cron Jobs" },
  { href: "/form", label: "Form Actions" }
];

// Secondary pages live here (they are intentionally not in the main navbar).
const PLATFORM_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/workflows", label: "Workflow Builder" },
  { href: "/team", label: "Team" },
  { href: "/about", label: "About" }
];

/** Site-wide footer (theme-aware, matches the purple branding). */
export default function Footer() {
  // Year is applied after mount so server and client markup always match.
  const [year, setYear] = useState("");
  useEffect(() => {
    setYear(String(new Date().getFullYear()));
  }, []);

  return (
    <footer className="footer">
      <div className="grid">
        <div className="brandCol">
          <p className="brand">Autovance AI</p>
          <p className="desc">
            A team project developed as part of HEC Generative AI Cohort 3. It
            explores AI assisted automation, explainable workflow design, and
            practical automation tools.
          </p>
        </div>

        <div className="col">
          <p className="head">Automation</p>
          {AUTOMATION_LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </div>

        <div className="col">
          <p className="head">Platform</p>
          {PLATFORM_LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </div>

        <div className="col">
          <p className="head">Connect</p>
          <div className="social">
            <a
              href={GITHUB_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Autovance AI on GitHub (opens in a new tab)"
              className="socialBtn"
            >
              {/* GitHub mark */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23a11.5 11.5 0 0 1 3-.405c1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.895 24 17.485 24 12c0-6.627-5.373-12-12-12" />
              </svg>
            </a>
            <a
              href={LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Maryam Amjad on LinkedIn (opens in a new tab)"
              className="socialBtn"
            >
              {/* LinkedIn mark */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      <p className="copyright">
        {year ? `© ${year} Autovance AI · HEC Generative AI Cohort 3 team project` : "Autovance AI · HEC Generative AI Cohort 3 team project"}
      </p>

      <style jsx>{`
        .footer {
          position: relative;
          z-index: 2;
          margin-top: 60px;
          padding: 36px 28px 20px;
          background: var(--card-bg);
          border-top: 1px solid var(--card-border);
          backdrop-filter: blur(8px);
          color: var(--page-text);
          transition: background-color 0.25s ease, border-color 0.25s ease, color 0.25s ease;
        }

        .grid {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          gap: 28px;
          max-width: 1100px;
          margin: 0 auto;
        }

        .brand {
          font-size: 18px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .desc {
          font-size: 13px;
          line-height: 1.6;
          color: var(--page-hint);
          max-width: 340px;
        }

        .head {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--page-muted);
          margin-bottom: 10px;
          font-weight: 600;
        }

        .col {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .col :global(a) {
          font-size: 13px;
          color: var(--page-text);
          opacity: 0.85;
          transition: opacity 0.2s ease, text-shadow 0.2s ease;
          width: fit-content;
        }

        .col :global(a:hover) {
          opacity: 1;
          text-shadow: 0 0 8px rgba(168, 85, 247, 0.7);
        }

        .social {
          display: flex;
          gap: 10px;
          margin-top: 2px;
        }

        .socialBtn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border: 1px solid var(--input-border);
          border-radius: 10px;
          color: var(--page-text);
          background: var(--subtle-bg);
          transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
        }

        .socialBtn:hover {
          border-color: #a855f7;
          transform: translateY(-2px);
          box-shadow: 0 4px 14px rgba(168, 85, 247, 0.35);
          text-shadow: none;
        }

        .copyright {
          text-align: center;
          font-size: 12px;
          color: var(--page-hint);
          margin-top: 28px;
          padding-top: 14px;
          border-top: 1px solid var(--card-border);
        }

        @media (max-width: 768px) {
          .footer {
            padding: 28px 16px 16px;
          }

          .grid {
            grid-template-columns: 1fr;
            gap: 20px;
          }

          .desc {
            max-width: none;
          }
        }
      `}</style>
    </footer>
  );
}
