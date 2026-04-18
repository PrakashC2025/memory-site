import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Mail, Palette, Shield, Sparkles, User, Zap } from 'lucide-react';
import { THEMES, type Theme, useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import AccessDenied from './AccessDenied';
import { getAccessDecision } from '../services/accessControl';

const QUOTES = [
  'Time passes. Memories stay electric.',
  'Every photo holds a heartbeat.',
  'Your moments, still alive.',
  'Relive the days that shaped you.',
  'A private archive for the life you keep building.',
];

const Login: React.FC = () => {
  const { setUser } = useUser();
  const { config, theme, setTheme } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [quoteIdx] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const [error, setError] = useState('');
  const [deniedEmail, setDeniedEmail] = useState('');

  const handleEnter = async () => {
    if (!name.trim() || !email.trim()) {
      setError('Please enter your name and email to continue.');
      return;
    }
    if (!email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError('');
    await new Promise(resolve => setTimeout(resolve, 850));
    const access = getAccessDecision(email);
    if (!access.allowed) {
      setDeniedEmail(access.email);
      setLoading(false);
      return;
    }

    setUser({
      name: name.trim(),
      email: access.email,
      accessLevel: access.level,
      memorySpaceId: access.spaceId,
    });
    setLoading(false);
  };

  if (deniedEmail) {
    return <AccessDenied email={deniedEmail} onTryAnother={() => setDeniedEmail('')} />;
  }

  return (
    <div className="neon-shell flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 28 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="grid w-full max-w-6xl gap-5 lg:grid-cols-[1.05fr_0.95fr]"
      >
        <section className="flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="mb-6 inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-[0.24em]"
            style={{ borderColor: config.primary + '44', color: config.accent, background: 'rgba(255,255,255,0.06)' }}
          >
            <Sparkles size={14} />
            Memory OS
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="neon-title max-w-3xl text-5xl font-black leading-none tracking-tight md:text-7xl"
          >
            Relive your life in neon.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            className="mt-5 max-w-2xl text-base leading-7 text-white/68 md:text-lg"
          >
            {QUOTES[quoteIdx]} Browse by timeline, explore a living memory tree, or play your archive like a cinematic story.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.36 }}
            className="mt-8 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3"
          >
            {[
              { label: 'Private', text: 'Demo access stays local', Icon: Shield },
              { label: 'Animated', text: 'Motion built into every view', Icon: Zap },
              { label: 'Curated', text: 'Photos grouped by date', Icon: Sparkles },
            ].map(item => (
              <div key={item.label} className="neon-card p-4">
                <item.Icon size={18} style={{ color: config.primary }} />
                <div className="mt-3 text-sm font-bold text-white">{item.label}</div>
                <p className="mt-1 text-xs leading-5 text-white/55">{item.text}</p>
              </div>
            ))}
          </motion.div>
        </section>

        <section className="neon-card p-5 md:p-7">
          <div
            className="mb-6 flex h-14 w-14 items-center justify-center rounded-lg border"
            style={{ borderColor: config.primary + '55', color: config.primary, background: config.primary + '16', boxShadow: `0 0 32px ${config.glow}` }}
          >
            <Sparkles size={24} />
          </div>

          <h2 className="text-2xl font-black text-white">Open your archive</h2>
          <p className="mt-2 text-sm leading-6 text-white/58">Use an approved email. Demo access: demo@memoriam.app</p>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em]" style={{ color: config.primary }}>
                <User size={13} />
                Your Name
              </span>
              <input
                type="text"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Enter your name"
                className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-all"
                style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${config.primary}33`, color: '#fff' }}
                onKeyDown={event => event.key === 'Enter' && handleEnter()}
              />
            </label>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em]" style={{ color: config.primary }}>
                <Mail size={13} />
                Email Address
              </span>
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-all"
                style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${config.primary}33`, color: '#fff' }}
                onKeyDown={event => event.key === 'Enter' && handleEnter()}
              />
            </label>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-200"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <motion.button
              onClick={handleEnter}
              disabled={loading}
              whileHover={{ scale: loading ? 1 : 1.015 }}
              whileTap={{ scale: loading ? 1 : 0.985 }}
              className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg px-5 py-3.5 text-sm font-black text-black"
              style={{
                background: loading ? 'rgba(255,255,255,0.12)' : `linear-gradient(135deg, ${config.primary}, ${config.secondary}, ${config.accent})`,
                boxShadow: loading ? 'none' : `0 0 34px ${config.glow}`,
                color: loading ? 'rgba(255,255,255,0.55)' : '#020406',
              }}
            >
              {loading ? 'Opening archive...' : 'Enter Memoria'}
              {!loading && <ArrowRight size={17} />}
              {!loading && (
                <motion.span
                  animate={{ x: ['-120%', '120%'] }}
                  transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 1.4 }}
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.34), transparent)', transform: 'skewX(-18deg)' }}
                />
              )}
            </motion.button>
          </div>

          <div className="mt-7 border-t pt-5" style={{ borderColor: config.primary + '24' }}>
            <p className="mb-3 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/50">
              <Palette size={13} />
              Theme
            </p>
            <div className="grid grid-cols-5 gap-2">
              {(Object.entries(THEMES) as [Theme, typeof THEMES[Theme]][]).map(([key, item]) => (
                <motion.button
                  key={key}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setTheme(key)}
                  className="h-10 rounded-lg border"
                  style={{
                    background: `linear-gradient(135deg, ${item.primary}66, ${item.secondary}55, ${item.accent}44)`,
                    borderColor: theme === key ? item.primary : 'rgba(255,255,255,0.15)',
                    boxShadow: theme === key ? `0 0 20px ${item.primary}66` : 'none',
                  }}
                  title={item.label}
                  aria-label={item.label}
                />
              ))}
            </div>
          </div>
        </section>
      </motion.div>
    </div>
  );
};

export default Login;
