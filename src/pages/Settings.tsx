import React from 'react';
import { motion } from 'framer-motion';
import { Bell, BookOpen, Check, Lock, Music, Palette, Shield, Sparkles, User, Users, Wand2 } from 'lucide-react';
import DriveConnectPanel from '../components/DriveConnectPanel';
import { THEMES, type Theme, useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const Settings: React.FC = () => {
  const { config, theme, setTheme } = useTheme();
  const { user, isMusicOn, setMusicOn } = useUser();

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 pb-16 pt-24 md:px-8 md:pt-28">
      <motion.header {...fadeUp} transition={{ duration: 0.58 }} className="mb-9 text-center">
        <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-[0.22em]" style={{ borderColor: config.primary + '40', color: config.accent }}>
          <Sparkles size={14} />
          Settings
        </div>
        <h1 className="neon-title text-4xl font-black md:text-5xl">Tune your memory world.</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/58">Personalize the neon theme, privacy switches, and demo integrations.</p>
      </motion.header>

      <div className="space-y-5">
        <motion.section {...fadeUp} transition={{ duration: 0.56, delay: 0.08 }} className="neon-card p-5 md:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-black text-white">
            <User size={18} style={{ color: config.primary }} />
            Profile
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border text-2xl font-black" style={{ borderColor: config.primary, background: config.primary + '18', color: config.primary }}>
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <p className="font-bold text-white">{user?.name}</p>
              <p className="text-xs text-white/55">{user?.email}</p>
              <p className="mt-2 inline-block rounded-lg px-2 py-1 text-xs font-bold" style={{ background: config.primary + '18', color: config.primary }}>
                Demo Account
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section {...fadeUp} transition={{ duration: 0.56, delay: 0.12 }} className="neon-card p-5 md:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-black text-white">
            <Palette size={18} style={{ color: config.primary }} />
            Neon Theme
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(Object.entries(THEMES) as [Theme, typeof THEMES[Theme]][]).map(([key, item]) => (
              <motion.button
                key={key}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setTheme(key)}
                className="rounded-lg border p-3 text-left transition-all"
                style={{
                  background: theme === key ? item.primary + '1f' : 'rgba(255,255,255,0.045)',
                  borderColor: theme === key ? item.primary : 'rgba(255,255,255,0.1)',
                  boxShadow: theme === key ? `0 0 18px ${item.primary}44` : 'none',
                }}
              >
                <div className="mb-3 h-8 rounded-lg" style={{ background: `linear-gradient(135deg, ${item.primary}, ${item.secondary}, ${item.accent})` }} />
                <p className="text-sm font-black" style={{ color: theme === key ? item.primary : 'rgba(255,255,255,0.8)' }}>{item.label}</p>
                {theme === key && <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: item.primary }}><Check size={12} /> Active</p>}
              </motion.button>
            ))}
          </div>
        </motion.section>

        <motion.section {...fadeUp} transition={{ duration: 0.56, delay: 0.16 }} className="neon-card p-5 md:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-black text-white">
            <Music size={18} style={{ color: config.primary }} />
            Ambient Music
          </h2>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-white">Background Music</p>
              <p className="mt-1 text-xs text-white/50">Use the bottom-right player to switch YouTube-backed tracks.</p>
            </div>
            <button
              onClick={() => setMusicOn(!isMusicOn)}
              className="relative h-7 w-14 rounded-full transition-all"
              style={{ background: isMusicOn ? `linear-gradient(135deg, ${config.primary}, ${config.secondary})` : 'rgba(255,255,255,0.18)' }}
              aria-label="Toggle music"
            >
              <motion.span animate={{ x: isMusicOn ? 28 : 4 }} transition={{ type: 'spring', stiffness: 480, damping: 30 }} className="absolute top-1 h-5 w-5 rounded-full bg-white" />
            </button>
          </div>
        </motion.section>

        <motion.section {...fadeUp} transition={{ duration: 0.56, delay: 0.2 }}>
          <DriveConnectPanel />
        </motion.section>

        <motion.section {...fadeUp} transition={{ duration: 0.56, delay: 0.24 }} className="neon-card p-5 md:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-black text-white">
            <Shield size={18} style={{ color: config.primary }} />
            Privacy & Access Control
          </h2>
          {[
            { label: 'Private Memory Space', desc: 'Only you can see this archive', on: true, Icon: Lock },
            { label: 'Shared Family Space', desc: 'Invite family members by email', on: false, Icon: Users },
            { label: 'Friends Collaboration', desc: 'Allow friends to add memories', on: false, Icon: Users },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0" style={{ borderColor: config.primary + '18' }}>
              <div className="flex items-start gap-3">
                <item.Icon size={17} style={{ color: config.primary }} />
                <div>
                  <p className="text-sm font-bold text-white">{item.label}</p>
                  <p className="text-xs text-white/48">{item.desc}</p>
                </div>
              </div>
              <span className="relative h-6 w-11 rounded-full" style={{ background: item.on ? config.primary : 'rgba(255,255,255,0.16)' }}>
                <span className="absolute top-1 h-4 w-4 rounded-full bg-white" style={{ left: item.on ? 23 : 4 }} />
              </span>
            </div>
          ))}
        </motion.section>

        <motion.section {...fadeUp} transition={{ duration: 0.56, delay: 0.28 }} className="neon-card p-5 md:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-black text-white">
            <Wand2 size={18} style={{ color: config.primary }} />
            Coming Next
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { label: 'AI-generated memory captions', Icon: Wand2 },
              { label: 'Face recognition grouping', Icon: User },
              { label: 'Recap video generation', Icon: Sparkles },
              { label: 'Journey map mode', Icon: MapFallback },
              { label: 'Memory book PDF export', Icon: BookOpen },
              { label: 'On This Day reminders', Icon: Bell },
            ].map(feature => (
              <p key={feature.label} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-white/62">
                <feature.Icon size={14} style={{ color: config.accent }} />
                {feature.label}
              </p>
            ))}
          </div>
        </motion.section>
      </div>
    </div>
  );
};

const MapFallback = Sparkles;

export default Settings;
