import React from 'react';
import { motion } from 'framer-motion';
import { Lock, Mail, Sparkles } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface Props {
  email: string;
  onTryAnother: () => void;
}

const AccessDenied: React.FC<Props> = ({ email, onTryAnother }) => {
  const { config } = useTheme();

  return (
    <div className="access-page flex min-h-screen items-center justify-center px-4 py-10">
      <motion.section
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        className="neon-card max-w-2xl p-6 text-center md:p-9"
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-lg border" style={{ borderColor: config.primary + '55', color: config.primary, background: config.primary + '14' }}>
          <Lock size={28} />
        </div>
        <div className="mb-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-[0.2em]" style={{ borderColor: config.accent + '33', color: config.accent }}>
          <Sparkles size={13} />
          Private Memory Space
        </div>
        <h1 className="neon-title text-4xl font-black md:text-5xl">This archive is protected.</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/62">
          <span className="text-white">{email}</span> is not on the approved list for this shared memory world. Ask the owner to invite this email, or use the demo account.
        </p>
        <div className="mt-6 rounded-lg border p-4 text-left" style={{ borderColor: config.primary + '22', background: 'rgba(255,255,255,0.045)' }}>
          <p className="flex items-center gap-2 text-sm font-bold text-white">
            <Mail size={15} style={{ color: config.primary }} />
            Demo access
          </p>
          <p className="mt-2 text-sm text-white/58">Use <span className="font-bold text-white">demo@memoriam.app</span> or <span className="font-bold text-white">test@example.com</span>.</p>
        </div>
        <button
          onClick={onTryAnother}
          className="mt-6 rounded-lg px-5 py-3 text-sm font-black text-black"
          style={{ background: `linear-gradient(135deg, ${config.primary}, ${config.secondary})`, boxShadow: `0 0 28px ${config.glow}` }}
        >
          Try another email
        </button>
      </motion.section>
    </div>
  );
};

export default AccessDenied;
