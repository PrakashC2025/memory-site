import React, { useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { isLegacyTvBrowser } from '../utils/legacyBrowser';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
  color: string;
}

const hexToRgba = (hex: string, alpha: number) => {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const AnimatedBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const frameRef = useRef<number>(0);
  const { config } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const matchMedia = typeof window.matchMedia === 'function'
      ? window.matchMedia.bind(window)
      : () => ({ matches: false });
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarsePointer = matchMedia('(pointer: coarse)').matches;
    const lowMemory = 'deviceMemory' in navigator && Number(navigator.deviceMemory) <= 4;
    if (reduceMotion || coarsePointer || lowMemory || window.innerWidth < 820) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const background = ctx.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, config.gradientFrom);
      background.addColorStop(0.62, config.gradientVia);
      background.addColorStop(1, config.gradientTo);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let active = true;
    const onVisibilityChange = () => {
      if (document.hidden) {
        active = false;
      } else {
        active = true;
        draw();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const colors = [config.primary, config.secondary, config.accent, config.particle];
    let width = 0;
    let height = 0;
    let tick = 0;

    const seedParticles = () => {
      const count = Math.min(28, Math.max(14, Math.floor((width * height) / 76000)));
      particlesRef.current = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.14,
        size: Math.random() * 1.9 + 0.6,
        alpha: Math.random() * 0.52 + 0.18,
        phase: Math.random() * Math.PI * 2,
        color: colors[i % colors.length],
      }));
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedParticles();
    };

    const drawRibbon = (index: number, color: string, offset: number) => {
      const yBase = height * (0.22 + index * 0.2);
      const gradient = ctx.createLinearGradient(0, yBase - 100, width, yBase + 100);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.4, hexToRgba(color, 0.16));
      gradient.addColorStop(0.6, hexToRgba(colors[(index + 1) % colors.length], 0.12));
      gradient.addColorStop(1, 'rgba(255,255,255,0)');

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 34 + Math.sin(tick * 0.013 + index) * 10;
      ctx.beginPath();
      for (let x = -80; x <= width + 80; x += 40) {
        const y =
          yBase +
          Math.sin(x * 0.006 + tick * 0.012 + offset) * 56 +
          Math.cos(x * 0.013 + tick * 0.007 + index) * 20;
        if (x === -80) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };

    const draw = () => {
      if (!active) return;
      ctx.clearRect(0, 0, width, height);

      const background = ctx.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, config.gradientFrom);
      background.addColorStop(0.52, config.gradientVia);
      background.addColorStop(1, config.gradientTo);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < 2; i += 1) {
        drawRibbon(i, colors[i % colors.length], i * 1.7);
      }

      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      const grid = 56;
      const drift = (tick * 0.18) % grid;
      for (let x = -grid + drift; x < width + grid; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + height * 0.16, height);
        ctx.stroke();
      }
      for (let y = -grid + drift; y < height + grid; y += grid) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y + width * 0.06);
        ctx.stroke();
      }
      ctx.restore();

      const particles = particlesRef.current;
      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        p.phase += 0.025;

        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;

        for (let j = i + 1; j < particles.length; j += 2) {
          const other = particles[j];
          const dx = p.x - other.x;
          const dy = p.y - other.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 82) {
            const alpha = (1 - dist / 82) * 0.08;
            ctx.strokeStyle = hexToRgba(p.color, alpha);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(other.x, other.y);
            ctx.stroke();
          }
        }

        const pulse = p.alpha + Math.sin(p.phase) * 0.16;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = hexToRgba(p.color, pulse);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      const vignette = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.74);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.68)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      tick += 1;
      if (active) {
        frameRef.current = window.setTimeout(() => requestAnimationFrame(draw), 1000 / 30);
      }
    };

    resize();
    window.addEventListener('resize', resize);
    draw();

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', resize);
      window.clearTimeout(frameRef.current);
    };
  }, [config]);

  // Older TV WebViews spend too much time compositing the animated canvas and
  // can leave the app layer blank. The static page background is clearer and
  // keeps Story Mode/video playback responsive on those devices.
  if (isLegacyTvBrowser()) return null;

  return (
    <>
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} />
      <div className="neon-grid fixed inset-0 pointer-events-none opacity-60" style={{ zIndex: 1 }} />
    </>
  );
};

export default AnimatedBackground;
