/**
 * Neutral default AI avatar.
 * Abstract robot mark: deliberately gender neutral (no name or email is ever
 * used to infer an appearance). Uses fixed brand colors so it reads the same
 * in Light and Dark themes. Decorative by default (aria-hidden) because the
 * adjacent user name already provides the accessible identity.
 */
export default function Avatar({ size = 26, title }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
      aria-label={title || undefined}
      className="avatar"
    >
      <defs>
        <linearGradient id="av-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="20" fill="url(#av-gradient)" />
      {/* antenna */}
      <line x1="20" y1="12" x2="20" y2="8" stroke="#f5f3ff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="20" cy="6.5" r="2.2" fill="#f5f3ff" />
      {/* head */}
      <rect x="10" y="12" width="20" height="17" rx="6" fill="#f5f3ff" />
      {/* eyes + neutral mouth */}
      <circle cx="16" cy="19.5" r="2" fill="#6d28d9" />
      <circle cx="24" cy="19.5" r="2" fill="#6d28d9" />
      <path
        d="M16.5 24.5 Q20 26.8 23.5 24.5"
        stroke="#6d28d9"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      {/* side ears */}
      <rect x="6.5" y="17" width="3" height="7" rx="1.5" fill="#f5f3ff" />
      <rect x="30.5" y="17" width="3" height="7" rx="1.5" fill="#f5f3ff" />

      <style jsx>{`
        .avatar {
          border-radius: 50%;
          flex-shrink: 0;
          box-shadow: 0 0 0 1px var(--card-border);
        }
      `}</style>
    </svg>
  );
}
