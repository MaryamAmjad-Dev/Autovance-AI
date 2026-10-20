import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import ParticleBackground from "../components/layout/ParticleBackground";

const CARDS = [
  {
    title: "Frontend",
    body: "Built with Next.js (Pages Router) and React, sharing one Navbar, Footer, and component library across the site."
  },
  {
    title: "Styling",
    body: "Glassmorphism UI in plain CSS with a global Light/Dark theme (CSS variables) and canvas particle animations."
  },
  {
    title: "Backend",
    body: "Server-side logic in Next.js API routes, with JSON-file storage for accounts, jobs, and form data (no database required)."
  },
  {
    title: "Authentication",
    body: "Email/password accounts with scrypt-hashed passwords and httpOnly session cookies. No plaintext credentials are stored."
  },
  {
    title: "AI Integration",
    body: "Language-model features connected through the OpenRouter API. Model-generated text is labelled as unverified wherever it is shown."
  },
  {
    title: "Research Workflow Builder",
    body: "Explainable workflow proposals with validation, contrastive alternatives, and dry runs, inspired by Michael Winikoff's XAI research. A scoresheet on that page records which explainability requirements the prototype addresses and which remain unsupported."
  }
];

export default function About() {
  return (
    <div className="container">
      <ParticleBackground count={50} />
      <Navbar />

      <main className="center">
        <h1>About This Project</h1>
        <p className="subtitle">The technologies and features behind Autovance AI</p>
        <p className="intro">
          Autovance AI is a team project developed as part of HEC Generative AI
          Cohort 3. It explores AI assisted automation, explainable workflow
          design, and practical automation tools. A UI exists for each feature
          described below; where an external service is not configured on the
          server, the app reports that honestly instead of claiming success.
        </p>

        <div className="grid">
          {CARDS.map((card) => (
            <div key={card.title} className="card">
              {/* Cards hang directly under the page h1, so the card title is
                  an h2; the size keeps the previous h3 appearance. */}
              <h2 className="cardTitle">{card.title}</h2>
              <p>{card.body}</p>
            </div>
          ))}
        </div>
      </main>

      <Footer />

      <style jsx>{`
        .container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--page-bg);
          color: var(--page-text);
        }

        .center {
          flex: 1;
          max-width: 1000px;
          margin: 0 auto;
          text-align: center;
          padding: 50px 16px 10px;
          position: relative;
          z-index: 2;
          width: 100%;
        }

        h1 {
          font-size: 42px;
          margin-bottom: 10px;
        }

        .subtitle {
          color: var(--page-muted);
          margin-bottom: 18px;
        }

        .intro {
          max-width: 660px;
          margin: 0 auto 34px;
          font-size: 14.5px;
          line-height: 1.7;
          color: var(--page-hint);
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 30px;
        }

        .card {
          background: var(--card-bg);
          padding: 30px;
          border-radius: 20px;
          backdrop-filter: blur(12px);
          border: 1px solid var(--card-border);
          box-shadow: var(--card-shadow);
          transition: 0.4s;
        }

        /* Keeps the previous h3 appearance now that the title is an h2. */
        .cardTitle {
          font-size: 18px;
        }

        .card:hover {
          transform: translateY(-10px) scale(1.05);
          box-shadow: 0 0 40px rgba(168,85,247,0.5);
        }

        .card p {
          color: var(--page-hint);
          font-size: 14px;
          line-height: 1.55;
        }

        @media (max-width: 768px) {
          .center { padding: 30px 15px 10px; }

          h1 { font-size: 30px; }

          .grid {
            grid-template-columns: 1fr;
            gap: 18px;
          }
        }
      `}</style>
    </div>
  );
}
