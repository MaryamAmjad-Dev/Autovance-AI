import Link from "next/link";

// Simple inline SVG icons (no icon dependency added). Each feature gets a
// distinct glyph in a coordinated purple gradient tile.
const ICON_PATHS = {
  envelope: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3.5 7.5 12 13.5 20.5 7.5" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.5" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  document: (
    <>
      <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z" />
      <path d="M14 3.5V8h4" />
      <path d="M9 13h6M9 16.5h6" />
    </>
  )
};

/**
 * A fully clickable, keyboard accessible feature card.
 * - whole card is one Link (Enter/Space work through the browser),
 * - staggered entrance animation (delay from `index`),
 * - gentle hover elevation and small icon movement,
 * - a visible focus ring (global a:focus-visible + local outline),
 * - an arrow marking that the card opens a feature.
 */
export default function FeatureCard({ href, title, desc, icon, accent, index = 0 }) {
  const grad = `linear-gradient(135deg, ${accent[0]}, ${accent[1]})`;

  return (
    <Link
      href={href}
      className="featureCard"
      style={{ animationDelay: `${index * 90}ms`, "--tile": grad }}
    >
      <span className="top">
        <span className="tile" aria-hidden="true">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {ICON_PATHS[icon] || ICON_PATHS.document}
          </svg>
        </span>
        <svg
          className="arrow"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      </span>

      <h3>{title}</h3>
      <p>{desc}</p>

      {/* Plain <style> (not styled-jsx): this component uses className on a
          Link child, and the @media rules must not be scoped-transformed. */}
      <style>{`
        .featureCard {
          display: block;
          position: relative;
          background: var(--card-bg);
          background-image: linear-gradient(
            135deg,
            rgba(168, 85, 247, 0.05),
            rgba(99, 102, 241, 0.02)
          );
          border: 1px solid var(--card-border);
          border-radius: 18px;
          box-shadow: var(--card-shadow);
          padding: 26px 26px 24px;
          min-height: 172px;
          cursor: pointer;
          animation: cardIn 0.55s ease both;
          transition: transform 0.25s ease, box-shadow 0.25s ease,
            border-color 0.25s ease, background-color 0.25s ease;
        }

        .featureCard:hover {
          transform: translateY(-6px);
          border-color: rgba(168, 85, 247, 0.45);
          box-shadow: 0 14px 30px rgba(109, 40, 217, 0.18);
        }

        .featureCard:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 3px;
        }

        .top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .tile {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 46px;
          height: 46px;
          border-radius: 13px;
          background: var(--tile);
          box-shadow: 0 6px 16px rgba(109, 40, 217, 0.28);
          transition: transform 0.25s ease;
        }

        .featureCard:hover .tile {
          transform: translateY(-3px);
        }

        .arrow {
          color: var(--page-hint);
          transition: transform 0.25s ease, color 0.25s ease;
        }

        .featureCard:hover .arrow {
          transform: translate(3px, -3px);
          color: var(--accent);
        }

        h3 {
          font-size: 18px;
          margin-bottom: 8px;
          color: var(--page-text);
        }

        p {
          color: var(--page-hint);
          font-size: 14px;
          line-height: 1.6;
        }

        @keyframes cardIn {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 768px) {
          .featureCard {
            min-height: 0;
            padding: 20px;
          }
        }
      `}</style>
    </Link>
  );
}
