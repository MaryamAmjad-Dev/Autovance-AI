import Navbar from "../layout/Navbar";
import Footer from "../layout/Footer";

/**
 * Consistent layout for the authentication pages (login, sign-up, password
 * reset): shared auth navbar, centered card, shared footer. Documented
 * exception to the full navbar — these pages show only the logo + theme
 * toggle so the form stays the focus.
 */
export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="page">
      <Navbar variant="auth" />

      <main className="main">
        <div className="card">
          <h1>{title}</h1>
          {subtitle && <p className="subtitle">{subtitle}</p>}
          {children}
        </div>
      </main>

      <Footer />

      <style jsx>{`
        .page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--page-bg);
          color: var(--page-text);
        }

        .main {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 16px;
          position: relative;
          z-index: 2;
        }

        .card {
          width: min(400px, 100%);
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          box-shadow: var(--card-shadow);
          border-radius: 14px;
          padding: 30px;
          animation: cardIn 0.4s ease;
        }

        h1 {
          font-size: 24px;
          margin-bottom: 6px;
        }

        .subtitle {
          font-size: 14px;
          color: var(--page-hint);
          margin-bottom: 18px;
        }

        @keyframes cardIn {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
