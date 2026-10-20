import { useEffect, useRef } from "react";

/**
 * The purple particle/network background, extracted from the page copies so
 * every page shares one implementation. Keeps the original visual identity
 * (purple dots + connecting lines, optional glow). Honors
 * prefers-reduced-motion by drawing a single static frame instead of
 * animating, and cleans up its animation frame / resize listener on unmount.
 */
export default function ParticleBackground({ count = 50, glow = false, linkDistance = 120 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === "undefined") return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let rafId = 0;
    let particles = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const seed = () => {
      particles = [];
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 2 + 1,
          speedX: Math.random() * 0.5 - 0.25,
          speedY: Math.random() * 0.5 - 0.25
        });
      }
    };

    const connect = () => {
      for (let a = 0; a < particles.length; a++) {
        for (let b = a + 1; b < particles.length; b++) {
          const dx = particles[a].x - particles[b].x;
          const dy = particles[a].y - particles[b].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < linkDistance) {
            ctx.strokeStyle = "rgba(168,85,247,0.2)";
            ctx.beginPath();
            ctx.moveTo(particles[a].x, particles[a].y);
            ctx.lineTo(particles[b].x, particles[b].y);
            ctx.stroke();
          }
        }
      }
    };

    const drawParticles = () => {
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = "#a855f7";
        if (glow) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = "#a855f7";
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
        if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;
      });
      drawParticles();
      connect();
      rafId = requestAnimationFrame(animate);
    };

    resize();
    seed();

    if (reduced) {
      // One static frame: identity preserved, motion removed.
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawParticles();
      connect();
    } else {
      animate();
    }

    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [count, glow, linkDistance]);

  return (
    <>
      <canvas ref={canvasRef} className="particleCanvas" aria-hidden="true" />
      <style jsx>{`
        .particleCanvas {
          position: fixed;
          top: 0;
          left: 0;
          z-index: 0;
          pointer-events: none;
        }
      `}</style>
    </>
  );
}
