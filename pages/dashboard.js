import { useState } from "react";
import Link from "next/link";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import ParticleBackground from "../components/layout/ParticleBackground";
import FeatureCard from "../components/dashboard/FeatureCard";
import { FEATURES, TOOLS } from "../components/dashboard/features";
import { describeAiFailure } from "../lib/aiError";
import { requireAuth } from "../lib/requireAuth";

export async function getServerSideProps(ctx) {
  return requireAuth(ctx);
}

// Public heading copy (no personal greeting: this is a team project, and
// branding must not present any individual as the project identity).
export default function Dashboard() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Guarded generation: no duplicate submissions while a request is in
  // flight, no automatic retries, button restored on success or failure.
  const generateAI = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.result) {
        setError(describeAiFailure(res.status, data));
        setResult("");
      } else {
        setResult(data.result);
      }
    } catch {
      setError(describeAiFailure(0, null));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <ParticleBackground count={60} />
      <Navbar />

      <main className="center">
        <h1 className="title">AI Dashboard</h1>
        <p className="subtitle">Build intelligent automations with AI</p>

        {/* Hero: quick AI generator (existing feature, kept) */}
        <section className="hero" aria-label="AI generator">
          <label className="heroLabel" htmlFor="hero-prompt">
            Describe your automation idea
          </label>
          <div className="inputBox">
            <input
              id="hero-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your automation idea..."
              onKeyDown={(e) => {
                if (e.key === "Enter") generateAI();
              }}
              disabled={loading}
            />
            <button onClick={generateAI} disabled={loading}>
              {loading && <span className="spinner" aria-hidden="true" />}
              {loading ? "Generating..." : "Generate"}
            </button>
          </div>

          {error && (
            <div className="resultBox error" role="alert">
              {error}
            </div>
          )}
          {result && (
            <div className="resultBox">
              <p>{result}</p>
            </div>
          )}
        </section>

        {/* PRIMARY FEATURES: four cards, two columns on desktop */}
        <section aria-labelledby="features-heading">
          <h2 id="features-heading" className="sectionTitle">
            Automation features
          </h2>
          <div className="grid">
            {FEATURES.map((f, i) => (
              <FeatureCard key={f.href} index={i} {...f} />
            ))}
          </div>
        </section>

        {/* SECONDARY TOOLS: compact, clearly not primary features */}
        <section aria-labelledby="tools-heading">
          <h2 id="tools-heading" className="sectionTitle">
            Tools
          </h2>
          <div className="toolRow">
            {TOOLS.map((t) => (
              <Link key={t.href} href={t.href} className="toolLink">
                <span className="toolTitle">{t.title}</span>
                <span className="toolDesc">{t.desc}</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <Footer />

      <style jsx>{`
        .container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--page-bg);
          color: var(--page-text);
          overflow-x: hidden;
        }

        .center {
          flex: 1;
          text-align: center;
          padding: 40px 16px 20px;
          position: relative;
          z-index: 2;
          animation: fadeUp 0.7s ease both;
          width: 100%;
          max-width: 960px;
          margin: 0 auto;
        }

        .title {
          font-size: 42px;
          letter-spacing: 0.5px;
        }

        .sectionTitle {
          font-size: 18px;
          text-transform: uppercase;
          letter-spacing: 2px;
          color: var(--page-muted);
          margin: 38px 0 16px;
        }

        .subtitle {
          color: var(--page-muted);
          margin-bottom: 26px;
        }

        .hero {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          box-shadow: var(--card-shadow);
          border-radius: 18px;
          padding: 24px;
          margin-bottom: 8px;
          text-align: left;
          transition: background-color 0.25s ease, border-color 0.25s ease;
        }

        .heroLabel {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--page-hint);
          margin-bottom: 10px;
          letter-spacing: 0.3px;
        }

        .inputBox {
          display: flex;
          gap: 10px;
        }

        input {
          flex: 1;
          min-width: 0;
          padding: 15px;
          border-radius: 12px;
          border: 1px solid var(--input-border);
          background: var(--input-bg);
          color: var(--page-text);
          font-size: 14px;
          transition: border-color 0.2s ease;
        }

        input:focus {
          border-color: var(--accent);
        }

        button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 15px 25px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #8b5cf6, #6366f1);
          color: white;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          white-space: nowrap;
          transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
        }

        button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(168, 85, 247, 0.4);
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .resultBox {
          margin-top: 16px;
          padding: 18px;
          background: var(--subtle-bg);
          border: 1px solid var(--card-border);
          border-radius: 12px;
          white-space: pre-wrap;
          font-size: 14px;
          line-height: 1.6;
        }

        .resultBox .aiTag {
          display: inline-block;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          padding: 2px 7px;
          border-radius: 6px;
          background: rgba(252,211,77,0.3);
          color: var(--tag-model-text);
          white-space: normal;
          margin-bottom: 8px;
        }

        .resultBox p {
          margin: 0;
          white-space: pre-wrap;
        }

        .resultBox.error {
          border-color: rgba(239, 68, 68, 0.5);
          color: var(--danger);
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        .toolRow {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          justify-content: center;
        }

        .toolLink {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border: 1px dashed var(--input-border);
          border-radius: 999px;
          background: var(--subtle-bg);
          font-size: 13px;
          color: var(--page-text);
          transition: border-color 0.2s ease, transform 0.2s ease;
        }

        .toolLink:hover {
          border-color: var(--accent);
          transform: translateY(-2px);
          text-shadow: none;
        }

        .toolLink:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }

        .toolTitle {
          font-weight: 600;
        }

        .toolDesc {
          color: var(--page-hint);
        }

        @keyframes fadeUp {
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
          .title {
            font-size: 30px;
          }

          .inputBox {
            flex-direction: column;
          }

          .grid {
            grid-template-columns: 1fr;
            gap: 14px;
          }

          .toolDesc {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
