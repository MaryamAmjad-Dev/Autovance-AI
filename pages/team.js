import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import ParticleBackground from "../components/layout/ParticleBackground";

const TEAM = [
  {
    name: "Maryam Amjad",
    role: "Team Leader",
    contribution: "Project Idea + Frontend + API Integration",
    linkedin: "https://www.linkedin.com/in/maryam-amjad-6a7a8m/"
  },
  {
    name: "Abdullah Bin Asim",
    role: "Backend Developer",
    contribution: "Handled backend logic and APIs",
    linkedin: "https://www.linkedin.com/in/abdullahasim1/"
  },
  {
    name: "Sehrish Maqbool",
    role: "Presentation Designer",
    contribution: "Slides & project presentation",
    linkedin: "https://www.linkedin.com/in/sehrish-maqbool-b5b00237a"
  },
  {
    name: "Fizza Zulfiqar",
    role: "Data Research",
    contribution: "Collected & organized project data",
    linkedin: "https://www.linkedin.com/in/fizza-zulfiqar-b8a83b246?utm_source=share_via&utm_content=profile&utm_medium=member_android"
  }
];

const LAST_MEMBER = {
  name: "Hadia Shahjahan",
  role: "Data Research",
  contribution: "Gathered project data and created the demo video",
  linkedin: "https://pk.linkedin.com/in/hadia-shahjahan"
};

export default function Team() {
  return (
    <div className="container">
      <ParticleBackground count={50} />
      <Navbar />

      <main className="center">
        <h1>Our Team</h1>
        <p className="subtitle">Meet the contributors behind the project</p>

        <div className="grid">
          {TEAM.map((member) => (
            <div key={member.name} className="card">
              <h2 className="cardTitle">{member.name}</h2>
              <p className="role">{member.role}</p>
              <p>{member.contribution}</p>
              <a className="liBtn" href={member.linkedin} target="_blank" rel="noopener noreferrer">
                LinkedIn
              </a>
            </div>
          ))}

          <div className="centerCard">
            <div className="card">
              <h2 className="cardTitle">{LAST_MEMBER.name}</h2>
              <p className="role">{LAST_MEMBER.role}</p>
              <p>{LAST_MEMBER.contribution}</p>
              <a className="liBtn" href={LAST_MEMBER.linkedin} target="_blank" rel="noopener noreferrer">
                LinkedIn
              </a>
            </div>
          </div>
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
          max-width: 1100px;
          margin: 0 auto;
          text-align: center;
          padding: 50px 16px 10px;
          position: relative;
          z-index: 2;
          width: 100%;
        }

        h1 {
          font-size: 42px;
        }

        .subtitle {
          color: var(--page-muted);
          margin-bottom: 40px;
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

        .card:hover {
          transform: translateY(-10px) scale(1.05);
          box-shadow: 0 0 40px rgba(168,85,247,0.5);
        }

        .centerCard {
          grid-column: span 2;
          display: flex;
          justify-content: center;
        }

        .role {
          color: var(--accent);
          font-weight: 600;
        }

        /* Cards hang directly under the page h1, so the card title is an h2;
           the size keeps the previous h3 appearance. */
        .cardTitle {
          font-size: 18px;
        }

        .liBtn {
          display: inline-block;
          margin-top: 15px;
          padding: 10px 20px;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, #8b5cf6, #6366f1);
          color: white;
          cursor: pointer;
          transition: 0.3s;
        }

        .liBtn:hover {
          transform: scale(1.1);
        }

        @media (max-width: 768px) {
          .center { padding: 30px 15px 10px; }

          h1 { font-size: 30px; }

          .grid {
            grid-template-columns: 1fr;
            gap: 18px;
          }

          .centerCard { grid-column: span 1; }
        }
      `}</style>
    </div>
  );
}
