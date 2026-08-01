import { useEffect } from "react";
import { useRouter } from "next/router";

export default function About() {
  const router = useRouter();

  useEffect(() => {
    const canvas = document.getElementById("bg");
    const ctx = canvas.getContext("2d");

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    resize();
    window.addEventListener("resize", resize);

    let particles = [];

    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: 2,
        speedX: Math.random() * 0.4 - 0.2,
        speedY: Math.random() * 0.4 - 0.2
      });
    }

    function connect() {
      for (let a = 0; a < particles.length; a++) {
        for (let b = a; b < particles.length; b++) {
          let dx = particles[a].x - particles[b].x;
          let dy = particles[a].y - particles[b].y;
          let dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 120) {
            ctx.strokeStyle = "rgba(168,85,247,0.2)";
            ctx.beginPath();
            ctx.moveTo(particles[a].x, particles[a].y);
            ctx.lineTo(particles[b].x, particles[b].y);
            ctx.stroke();
          }
        }
      }
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        p.x += p.speedX;
        p.y += p.speedY;

        if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
        if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = "#a855f7";
        ctx.fill();
      });

      connect();
      requestAnimationFrame(animate);
    }

    animate();
  }, []);

  return (
    <div className="container">
      <canvas id="bg"></canvas>

      {/* NAVBAR */}
      <div className="navbar">
        <h2>Autovance AI</h2>
        <div className="nav">
          <span onClick={() => router.push("/dashboard")}>Dashboard</span>
          <span onClick={() => router.push("/cron")}>Cron</span>
          <span onClick={() => router.push("/team")}>Team</span>
          <span className="active">About</span>
        </div>
      </div>

      {/* CONTENT */}
      <div className="center">
        <h1>About Project</h1>
        <p className="subtitle">Technologies used in Autovance AI</p>

        <div className="grid">

          <div className="card">
            <h3>Frontend</h3>
            <p>Next.js + React</p>
          </div>

          <div className="card">
            <h3>Styling</h3>
            <p>CSS + Glassmorphism UI + Animations</p>
          </div>

          <div className="card">
            <h3>Backend</h3>
            <p>Next.js API Routes</p>
          </div>

          <div className="card">
            <h3>AI Integration</h3>
            <p>OpenRouter API (LLaMA 3 model)</p>
          </div>

          <div className="card">
            <h3>Automation Features</h3>
            <p>Email, Webhooks, Cron Jobs, Forms</p>
          </div>

          <div className="card">
            <h3>Deployment Ready</h3>
            <p>Environment Variables + Secure API handling</p>
          </div>

        </div>
      </div>

      <style jsx>{`
        .container {
          min-height: 100vh;
          background: radial-gradient(circle at center, #1e1b4b, #020617);
          color: white;
        }

        canvas {
          position: fixed;
          top: 0;
          left: 0;
          z-index: 0;
        }

        .navbar {
          display: flex;
          justify-content: space-between;
          padding: 20px 60px;
          position: relative;
          z-index: 2;
        }

        .nav span {
          margin: 0 18px;
          cursor: pointer;
          opacity: 0.85;
          transition: 0.3s;
        }

        .nav span:hover {
          opacity: 1;
          text-shadow: 0 0 10px #a855f7;
        }

        .active {
          border-bottom: 2px solid #a855f7;
        }

        .center {
          max-width: 1000px;
          margin: auto;
          text-align: center;
          margin-top: 80px;
          position: relative;
          z-index: 2;
        }

        h1 {
          font-size: 42px;
          margin-bottom: 10px;
        }

        .subtitle {
          color: #c4b5fd;
          margin-bottom: 40px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 30px;
        }

        .card {
          background: rgba(255,255,255,0.08);
          padding: 30px;
          border-radius: 20px;
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.1);
          transition: 0.4s;
        }

        .card:hover {
          transform: translateY(-10px) scale(1.05);
          box-shadow: 0 0 40px rgba(168,85,247,0.5);
        }

      `}</style>
    </div>
  );
}