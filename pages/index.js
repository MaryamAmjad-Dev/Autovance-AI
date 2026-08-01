import Link from "next/link";
import { useEffect, useState } from "react";

export default function Home() {

  const [text, setText] = useState("");
  const fullText = "Automate your business workflows using intelligent AI systems.";

  // typing effect
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setText(fullText.slice(0, i));
      i++;
      if (i > fullText.length) clearInterval(interval);
    }, 30);
  }, []);

  // particles
  useEffect(() => {
    const canvas = document.getElementById("bg");
    const ctx = canvas.getContext("2d");

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let particles = [];

    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 1,
        speedX: Math.random() * 0.4 - 0.2,
        speedY: Math.random() * 0.4 - 0.2
      });
    }

    function connectParticles() {
      for (let a = 0; a < particles.length; a++) {
        for (let b = a; b < particles.length; b++) {
          let dx = particles[a].x - particles[b].x;
          let dy = particles[a].y - particles[b].y;
          let distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 130) {
            ctx.strokeStyle = "rgba(168,85,247,0.25)";
            ctx.lineWidth = 1;
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
        ctx.fillStyle = "#a855f7"; // purple theme
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#a855f7";
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      connectParticles();
      requestAnimationFrame(animate);
    }

    animate();
  }, []);

  return (
    <div className="container">

      <canvas id="bg"></canvas>

      <div className="content">
        <h1>Autovance AI</h1>

        <p className="typing">{text}</p>

        <div className="buttons">
        <button 
  className="primary"
  onClick={() => window.location.href = "/dashboard"}
>
  Continue with Google
</button>

          <Link href="/signup">
            <button className="secondary">Signup</button>
          </Link>
        </div>
      </div>

      <style jsx>{`
        .container {
          height: 100vh;
          position: relative;
          overflow: hidden;
          background: radial-gradient(circle at center, #1e1b4b, #020617);
          display: flex;
          justify-content: center;
          align-items: center;
          color: white;
          font-family: Arial;
        }

        canvas {
          position: absolute;
          top: 0;
          left: 0;
        }

        .content {
          position: relative;
          z-index: 2;
          text-align: center;
          animation: fadeIn 1.5s ease;
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
          color: #c4b5fd;
          margin-bottom: 30px;
          min-height: 20px;
        }

        .buttons {
          display: flex;
          justify-content: center;
          gap: 15px;
        }

        button {
          padding: 12px 24px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .primary {
          background: linear-gradient(135deg, #8b5cf6, #7c3aed);
          color: white;
        }

        .primary:hover {
          transform: scale(1.08);
          box-shadow: 0 0 15px rgba(168,85,247,0.6);
        }

        .secondary {
          background: transparent;
          border: 1px solid #8b5cf6;
          color: #a78bfa;
        }

        .secondary:hover {
          background: #8b5cf6;
          color: white;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

    </div>
  );
}