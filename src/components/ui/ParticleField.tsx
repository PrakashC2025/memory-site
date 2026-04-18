// ─────────────────────────────────────────────
//  Memoriam — Ambient Particle Field
// ─────────────────────────────────────────────

import React, { useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { THEMES } from '../../data/themes';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; opacity: number;
  color: string; life: number; maxLife: number;
  type: 'circle' | 'star' | 'bokeh';
}

interface Props { count?: number; interactive?: boolean; className?: string; }

const ParticleField: React.FC<Props> = ({ count = 60, interactive = true, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const { activeTheme, animationIntensity } = useApp();

  const theme = THEMES[activeTheme];
  const primaryColor = theme.colors.primary;

  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  };

  const makeParticle = useCallback((canvas: HTMLCanvasElement): Particle => {
    const rgb = hexToRgb(primaryColor.startsWith('#') ? primaryColor : '#ffd89b');
    const types: Particle['type'][] = ['circle', 'star', 'bokeh'];
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.4 - 0.1,
      size: Math.random() * 3 + 0.5,
      opacity: Math.random() * 0.6 + 0.1,
      color: `rgba(${rgb}, `,
      life: 0,
      maxLife: Math.random() * 300 + 200,
      type: types[Math.floor(Math.random() * types.length)],
    };
  }, [primaryColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const effectiveCount = animationIntensity === 'subtle' ? Math.floor(count * 0.4)
      : animationIntensity === 'medium' ? Math.floor(count * 0.7) : count;

    particlesRef.current = Array.from({ length: effectiveCount }, () => makeParticle(canvas));

    const drawStar = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, opacity: number, color: string) => {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color + '1)';
      ctx.shadowColor = color + '0.8)';
      ctx.shadowBlur = r * 3;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        const outerX = x + r * Math.cos(angle);
        const outerY = y + r * Math.sin(angle);
        i === 0 ? ctx.moveTo(outerX, outerY) : ctx.lineTo(outerX, outerY);
        const innerAngle = angle + Math.PI / 4;
        ctx.lineTo(x + r * 0.4 * Math.cos(innerAngle), y + r * 0.4 * Math.sin(innerAngle));
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const drawBokeh = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, opacity: number, color: string) => {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      gradient.addColorStop(0, color + `${opacity})`);
      gradient.addColorStop(0.4, color + `${opacity * 0.5})`);
      gradient.addColorStop(1, color + '0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r * 4, 0, Math.PI * 2);
      ctx.fill();
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach((p, i) => {
        p.life++;
        if (p.life >= p.maxLife) {
          particlesRef.current[i] = makeParticle(canvas);
          return;
        }

        const lifeRatio = p.life / p.maxLife;
        const fadeIn = Math.min(lifeRatio * 5, 1);
        const fadeOut = 1 - Math.max((lifeRatio - 0.7) / 0.3, 0);
        const currentOpacity = p.opacity * fadeIn * fadeOut;

        // Mouse interaction
        if (interactive) {
          const dx = mouseRef.current.x - p.x;
          const dy = mouseRef.current.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 80) {
            p.vx -= dx * 0.001;
            p.vy -= dy * 0.001;
          }
        }

        p.x += p.vx;
        p.y += p.vy;

        // Boundary wrap
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.save();
        if (p.type === 'star') {
          drawStar(ctx, p.x, p.y, p.size, currentOpacity, p.color);
        } else if (p.type === 'bokeh') {
          drawBokeh(ctx, p.x, p.y, p.size, currentOpacity * 0.3, p.color);
        } else {
          ctx.globalAlpha = currentOpacity;
          ctx.fillStyle = p.color + '1)';
          ctx.shadowColor = p.color + '0.6)';
          ctx.shadowBlur = p.size * 4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    if (interactive) canvas.addEventListener('mousemove', handleMouseMove);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
      if (interactive) canvas.removeEventListener('mousemove', handleMouseMove);
    };
  }, [count, interactive, makeParticle, animationIntensity]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      style={{ zIndex: 0 }}
    />
  );
};

export default ParticleField;
