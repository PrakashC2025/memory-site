import React from 'react';
import { motion } from 'framer-motion';

interface PageHeroProps {
  kicker: string;
  Icon: React.ComponentType<{ size?: number | string; className?: string }>;
  title: React.ReactNode;
  subtitle: string;
  /** CSS class that sets the gradient text, e.g. "gt-amber" */
  gradient: string;
  /** Accent hex used for the kicker border and glow orbs */
  accent: string;
  children?: React.ReactNode;
}

/**
 * Shared modern page header. Each page passes its own gradient + accent so
 * every mode has a unique visual identity while the structure stays consistent.
 */
const PageHero: React.FC<PageHeroProps> = ({ kicker, Icon, title, subtitle, gradient, accent, children }) => (
  <motion.header
    initial={{ opacity: 0, y: -18 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    className="page-hero relative mb-10 text-center"
  >
    <span className="page-hero-orb page-hero-orb-a" style={{ background: accent }} aria-hidden="true" />
    <span className="page-hero-orb page-hero-orb-b" style={{ background: accent }} aria-hidden="true" />
    <div className="relative">
      <motion.div
        className="page-hero-kicker"
        style={{ borderColor: `${accent}40`, color: accent }}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.08, duration: 0.4 }}
      >
        <Icon size={14} />
        {kicker}
      </motion.div>
      <motion.h1
        className={`page-hero-title ${gradient}`}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14, duration: 0.55 }}
      >
        {title}
      </motion.h1>
      <motion.p
        className="page-hero-subtitle"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22, duration: 0.5 }}
      >
        {subtitle}
      </motion.p>
      {children}
    </div>
  </motion.header>
);

export default PageHero;