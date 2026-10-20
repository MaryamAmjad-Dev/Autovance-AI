import Link from "next/link";
import { useEffect, useState } from "react";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import ParticleBackground from "../components/layout/ParticleBackground";

export default function Home() {
  const [text, setText] = useState("");
  const fullText = "Automate your business workflows using intelligent AI systems.";

  // Typing effect. Reduced-motion preference is honoured HERE, in JS: the
  // global CSS rules cannot stop a setInterval-driven animation. When motion
  // is reduced the full sentence appears immediately.
  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setText(fullText);
      return undefined;
    }
    let i = 0;
    const interval = setInterval(() => {
      setText(fullText.slice(0, i));
      i++;
      if (i > fullText.length) clearInterval(interval);
    }, 30);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container">
      <ParticleBackground count={50} glow linkDistance={130} />
      <Navbar />

      <main className="hero">
        <h1>Autovance AI</h1>

        <p className="typing" aria-label={fullText}>{text}</p>

        <p className="tagline">
          Email, webhooks, scheduled jobs, and form handling, with a research
          Workflow Builder that explains its proposals.
        </p>

        {/* Honest entry points: there is no Google OAuth in this project.
            Links (not buttons inside links) keep the markup valid for
            assistive technology while the classes carry the button look. */}
        <div className="buttons">
          <Link href="/login" className="primary">Log In</Link>
          <Link href="/signup" className="secondary">Sign Up</Link>
        </div>
      </main>

      <Footer />

      <style jsx>{`
        .container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow-x: hidden;
          background: var(--page-bg);
          color: var(--page-text);
          font-family: Arial;
        }

        .hero {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          position: relative;
          z-index: 2;
          padding: 40px 16px;
          animation: fadeIn 1.2s ease;
        }

        h1 {
          font-size: 48px;
          margin-bottom: 10px;
          animation: floatText 3s ease-in-out infinite;
        }

        @keyframes floatText {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
          100% { transform: translateY(0px); }
        }

        .typing {
          color: var(--page-muted);
          margin-bottom: 16px;
          min-height: 20px;
        }

        .tagline {
          color: var(--page-hint);
          font-size: 15px;
          max-width: 520px;
          margin-bottom: 30px;
          line-height: 1.5;
        }

        .buttons {
          display: flex;
          justify-content: center;
          gap: 15px;
        }

        .buttons a {
          display: inline-block;
          padding: 12px 24px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .primary {
          background: linear-gradient(135deg, #8b5cf6, #7c3aed);
          color: white;
          border: none;
        }

        .primary:hover {
          transform: scale(1.06);
          box-shadow: 0 0 15px rgba(168,85,247,0.6);
        }

        .secondary {
          background: transparent;
          border: 1px solid #8b5cf6;
          color: var(--btn-accent-text);
        }

        .secondary:hover {
          background: #8b5cf6;
          color: white;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 768px) {
          h1 { font-size: 32px; }

          .buttons { flex-wrap: wrap; }
        }
      `}</style>
    </div>
  );
}
