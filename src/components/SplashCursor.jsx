'use client';

import { useEffect, useRef } from 'react';
import './SplashCursor.css';

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const normalized = value.length === 3 ? value.split('').map(char => char + char).join('') : value;
  return {
    r: parseInt(normalized.slice(0, 2), 16) || 255,
    g: parseInt(normalized.slice(2, 4), 16) || 0,
    b: parseInt(normalized.slice(4, 6), 16) || 0,
  };
}

function hslToRgb(h, s, l) {
  const hueToRgb = (p, q, t) => {
    let next = t;
    if (next < 0) next += 1;
    if (next > 1) next -= 1;
    if (next < 1 / 6) return p + (q - p) * 6 * next;
    if (next < 1 / 2) return q;
    if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, h) * 255),
    b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  };
}

function SplashCursor({
  SIM_RESOLUTION = 128,
  DYE_RESOLUTION = 1440,
  CAPTURE_RESOLUTION = 512,
  DENSITY_DISSIPATION = 3.5,
  VELOCITY_DISSIPATION = 2,
  PRESSURE = 0.1,
  PRESSURE_ITERATIONS = 20,
  CURL = 3,
  SPLAT_RADIUS = 0.2,
  SPLAT_FORCE = 6000,
  SHADING = true,
  COLOR_UPDATE_SPEED = 10,
  BACK_COLOR = { r: 0.5, g: 0, b: 0 },
  TRANSPARENT = true,
  RAINBOW_MODE = true,
  COLOR = '#a855f7',
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const splatsRef = useRef([]);
  const pointerRef = useRef({ x: 0, y: 0, px: 0, py: 0, hue: Math.random() });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return undefined;

    const configScale = Math.max(0.55, Math.min(1.25, SIM_RESOLUTION / 128));
    const radiusScale = Math.max(0.5, Math.min(1.65, SPLAT_RADIUS * 4.8));
    const forceScale = Math.max(0.35, Math.min(1.8, SPLAT_FORCE / 6000));
    const fade = Math.max(0.055, Math.min(0.18, DENSITY_DISSIPATION / 30));
    const blur = SHADING ? Math.max(22, Math.min(54, CURL * 10)) : 0;
    const maxSplats = Math.max(16, Math.min(90, Math.round(DYE_RESOLUTION / 24)));
    let active = true;
    let lastColorUpdate = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, CAPTURE_RESOLUTION > 512 ? 2 : 1.5);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!TRANSPARENT) {
        ctx.fillStyle = `rgb(${Math.round(BACK_COLOR.r * 255)}, ${Math.round(BACK_COLOR.g * 255)}, ${Math.round(BACK_COLOR.b * 255)})`;
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      }
    };

    const makeColor = () => {
      if (!RAINBOW_MODE) return hexToRgb(COLOR);
      pointerRef.current.hue = (pointerRef.current.hue + 0.012) % 1;
      const purpleHue = 0.76 + Math.sin(pointerRef.current.hue * Math.PI * 2) * 0.035;
      return hslToRgb(purpleHue, 0.92, 0.64);
    };

    const addSplat = (x, y, dx = 0, dy = 0, strong = false) => {
      const now = performance.now();
      if (now - lastColorUpdate > 1000 / Math.max(1, COLOR_UPDATE_SPEED)) {
        pointerRef.current.color = makeColor();
        lastColorUpdate = now;
      }
      const color = pointerRef.current.color || makeColor();
      const velocity = Math.min(80, Math.hypot(dx, dy) * forceScale);
      splatsRef.current.push({
        x,
        y,
        dx: dx * 0.045 * forceScale,
        dy: dy * 0.045 * forceScale,
        radius: (strong ? 58 : 42) * radiusScale * configScale + velocity * 0.22,
        life: 1,
        color,
      });
      if (splatsRef.current.length > maxSplats) {
        splatsRef.current.splice(0, splatsRef.current.length - maxSplats);
      }
    };

    const draw = () => {
      if (!active) return;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = TRANSPARENT ? `rgba(2, 3, 9, ${fade})` : `rgba(${Math.round(BACK_COLOR.r * 255)}, ${Math.round(BACK_COLOR.g * 255)}, ${Math.round(BACK_COLOR.b * 255)}, ${fade + PRESSURE * 0.12})`;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.globalCompositeOperation = 'lighter';

      splatsRef.current = splatsRef.current.filter(splat => splat.life > 0.018);
      for (const splat of splatsRef.current) {
        splat.x += splat.dx;
        splat.y += splat.dy;
        splat.dx *= 1 - Math.min(0.18, VELOCITY_DISSIPATION / 22);
        splat.dy *= 1 - Math.min(0.18, VELOCITY_DISSIPATION / 22);
        splat.life *= 1 - Math.min(0.12, DENSITY_DISSIPATION / 52);
        const radius = splat.radius * (1.36 - splat.life * 0.18);
        const gradient = ctx.createRadialGradient(splat.x, splat.y, 0, splat.x, splat.y, radius);
        gradient.addColorStop(0, `rgba(190, 132, 255, ${0.16 * splat.life})`);
        gradient.addColorStop(0.34, `rgba(${splat.color.r}, ${splat.color.g}, ${splat.color.b}, ${0.15 * splat.life})`);
        gradient.addColorStop(0.72, `rgba(155, 92, 246, ${0.06 * splat.life})`);
        gradient.addColorStop(1, `rgba(${splat.color.r}, ${splat.color.g}, ${splat.color.b}, 0)`);
        ctx.filter = blur ? `blur(${blur * (1 - splat.life * 0.4)}px)` : 'none';
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(splat.x, splat.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.filter = 'none';
      rafRef.current = requestAnimationFrame(draw);
    };

    const updatePointer = (clientX, clientY, strong = false) => {
      const pointer = pointerRef.current;
      const dx = clientX - (pointer.x || clientX);
      const dy = clientY - (pointer.y || clientY);
      pointer.px = pointer.x;
      pointer.py = pointer.y;
      pointer.x = clientX;
      pointer.y = clientY;
      addSplat(clientX, clientY, dx, dy, strong);
    };

    const handlePointerMove = event => updatePointer(event.clientX, event.clientY);
    const handlePointerDown = event => updatePointer(event.clientX, event.clientY, true);
    const handleTouchMove = event => {
      for (const touch of event.touches) updatePointer(touch.clientX, touch.clientY);
    };
    const handleTouchStart = event => {
      for (const touch of event.touches) updatePointer(touch.clientX, touch.clientY, true);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchstart', handleTouchStart);
    };
  }, [
    SIM_RESOLUTION,
    DYE_RESOLUTION,
    CAPTURE_RESOLUTION,
    DENSITY_DISSIPATION,
    VELOCITY_DISSIPATION,
    PRESSURE,
    PRESSURE_ITERATIONS,
    CURL,
    SPLAT_RADIUS,
    SPLAT_FORCE,
    SHADING,
    COLOR_UPDATE_SPEED,
    BACK_COLOR,
    TRANSPARENT,
    RAINBOW_MODE,
    COLOR,
  ]);

  return (
    <div className="splash-cursor" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}

export default SplashCursor;
