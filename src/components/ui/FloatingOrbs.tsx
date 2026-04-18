// ─────────────────────────────────────────────
//  Memoriam — Floating Background Orbs
// ─────────────────────────────────────────────

import React from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import { THEMES } from '../../data/themes';

const FloatingOrbs: React.FC = () => {
  const { activeTheme } = useApp();
  const theme = THEMES[activeTheme];

  const orbs = [
    { size: 600, x: '10%', y: '20%', delay: 0, duration: 18, opacity: 0.06, color: theme.colors.primary },
    { size: 400, x: '70%', y: '60%', delay: 3, duration: 22, opacity: 0.05, color: theme.colors.secondary },
    { size: 300, x: '50%', y: '10%', delay: 6, duration: 15, opacity: 0.04, color: theme.colors.accent },
    { size: 250, x: '85%', y: '20%', delay: 9, duration: 20, opacity: 0.04, color: theme.colors.primary },
    { size: 500, x: '30%', y: '80%', delay: 2, duration: 25, opacity: 0.03, color: theme.colors.secondary },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      {orbs.map((orb, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: orb.size,
            height: orb.size,
            left: orb.x,
            top: orb.y,
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle, ${orb.color}${Math.round(orb.opacity * 255).toString(16).padStart(2,'0')} 0%, transparent 70%)`,
            filter: 'blur(60px)',
          }}
          animate={{
            x: [0, 40, -20, 30, 0],
            y: [0, -30, 20, -15, 0],
            scale: [1, 1.1, 0.95, 1.05, 1],
          }}
          transition={{
            duration: orb.duration,
            delay: orb.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
};

export default FloatingOrbs;
