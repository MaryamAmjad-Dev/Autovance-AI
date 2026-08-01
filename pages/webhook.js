import { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function WebhookPage() {
  const router = useRouter();

  const [url, setUrl] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

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

    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: 2,
        speedX: Math.random() * 0.5 - 0.25,
        speedY: Math.random() * 0.5 - 0.25
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

  // 🚀 REAL WEBHOOK CALL
  const triggerWebhook = async () => {
    if (!url) return;

    setLoading(true);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: "Triggered from Autovance AI 🚀"
        })
      });

      const data = await res.text();
      setResponse(data || "Webhook triggered successfully!");
    } catch (error) {
      setResponse("Error triggering webhook");
    }

    setLoading(false);
  };

  return (
    <div className="container">
      <canvas id="bg"></canvas>

      {/* NAVBAR */}
      <div className="navbar">
        <h2 className="logo" onClick={() => router.push("/dashboard")}>
          Autovance AI
        </h2>

        <div className="nav">
          <span onClick={() => router.push("/dashboard")}>Dashboard</span>
          <span className="active">Webhook</span>
          <span onClick={() => router.push("/team")}>Team</span>
          <span onClick={() => router.push("/about")}>About</span>
        </div>
      </div>

      {/* MAIN */}
      <div className="center">

        <h1 className="title">Webhook Automation 🔗</h1>
        <p className="subtitle">Trigger any API instantly</p>

        <div className="inputBox">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter webhook URL (https://...)"
          />
          <button onClick={triggerWebhook}>
            {loading ? "Sending..." : "Trigger"}
          </button>
        </div>

        {response && (
          <div className="resultBox">
            <h3>Response:</h3>
            <p>{response}</p>
          </div>
        )}

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

        .logo {
          cursor: pointer;
        }

        .nav span {
          margin: 0 15px;
          cursor: pointer;
          color: white;
          opacity: 0.8;
          transition: 0.3s;
        }

        .nav span:hover {
          opacity: 1;
          transform: translateY(-3px);
          text-shadow: 0 0 10px #a855f7;
        }

        .active {
          text-shadow: 0 0 12px #a855f7;
        }

        .center {
          text-align: center;
          margin-top: 80px;
          position: relative;
          z-index: 2;
          animation: fadeUp 1s ease;
        }

        .title {
          font-size: 42px;
          animation: glowText 2s infinite alternate;
        }

        .subtitle {
          color: #c4b5fd;
          margin-bottom: 30px;
        }

        .inputBox {
          display: flex;
          gap: 10px;
          max-width: 700px;
          margin: auto;
          margin-bottom: 30px;
        }

        input {
          flex: 1;
          padding: 15px;
          border-radius: 12px;
          border: none;
        }

        button {
          padding: 15px 25px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #8b5cf6, #6366f1);
          color: white;
          cursor: pointer;
          transition: 0.3s;
        }

        button:hover {
          transform: scale(1.1);
          box-shadow: 0 0 20px rgba(168,85,247,0.6);
        }

        .resultBox {
          max-width: 700px;
          margin: 20px auto;
          padding: 25px;
          background: rgba(255,255,255,0.05);
          border-radius: 15px;
          text-align: left;
          animation: fadeUp 1s ease;
        }

        @keyframes glowText {
          from { text-shadow: 0 0 5px #a855f7; }
          to { text-shadow: 0 0 20px #a855f7; }
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

      `}</style>
    </div>
  );
}