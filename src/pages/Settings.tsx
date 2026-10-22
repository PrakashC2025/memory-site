import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, BookOpen, Check, Film, Lock, Music, Palette, Shield, Sparkles, User, Users, Wand2 } from 'lucide-react';
import DriveConnectPanel from '../components/DriveConnectPanel';
import PageHero from '../components/PageHero';
import { THEMES, type Theme, useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const Settings: React.FC = () => {
  const { config, theme, setTheme } = useTheme();
  const { user, isMusicOn, setMusicOn } = useUser();
  const [privacy, setPrivacy] = useState({
    privateSpace: true,
    familySpace: false,
    friendsCollab: false,
  });
  const [slideshow, setSlideshow] = useState({
    transition: 'Dream Dissolve',
    duration: 'Balanced',
    intensity: 'Premium',
    captions: true,
    fit: 'Contain',
    fullscreen: true,
    treeOverlay: true,
    cinemaBars: true,
  });

  const togglePrivacy = (key: keyof typeof privacy) => {
    setPrivacy(value => ({ ...value, [key]: !value[key] }));
  };

  const toggleSlideshow = (key: keyof typeof slideshow) => {
    setSlideshow(value => ({ ...value, [key]: !value[key] }));
  };

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 pb-16 pt-24 md:px-8 md:pt-28">
      <PageHero
        kicker="Settings"
        Icon={Sparkles}
        gradient="gt-mint"
        accent={config.primary}
        title={<>Tune your <span className="italic">memory world.</span></>}
        subtitle="Personalize the neon theme, privacy switches, and media connections."
      />

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
              type="button"
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

        <motion.section {...fadeUp} transition={{ duration: 0.56, delay: 0.22 }} className="neon-card p-5 md:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-black text-white">
            <Film size={18} style={{ color: config.primary }} />
            Slideshow Defaults
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { key: 'transition', label: 'Transition', options: ['Dream Dissolve', 'Ken Burns', 'Branch Guided', 'Film Fade', 'Scrapbook'] },
              { key: 'duration', label: 'Duration', options: ['Slow Emotional', 'Balanced', 'Fast Highlights'] },
              { key: 'intensity', label: 'Intensity', options: ['Soft', 'Premium', 'Dramatic'] },
              { key: 'fit', label: 'Image Fit', options: ['Contain', 'Cover', 'Smart'] },
            ].map(item => (
              <label key={item.key} className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: config.primary }}>
                {item.label}
                <select
                  value={String(slideshow[item.key as keyof typeof slideshow])}
                  onChange={event => setSlideshow(value => ({ ...value, [item.key]: event.target.value }))}
                  className="rounded-lg px-3 py-2 text-sm normal-case tracking-normal text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${config.primary}33` }}
                >
                  {item.options.map(option => <option key={option}>{option}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              ['captions', 'Captions On'],
              ['fullscreen', 'Fullscreen Auto-enter'],
              ['treeOverlay', 'Tree Overlay'],
              ['cinemaBars', 'Cinema Bars'],
            ].map(([key, label]) => (
              <button
                type="button"
                key={key}
                onClick={() => toggleSlideshow(key as keyof typeof slideshow)}
                className="flex items-center justify-between rounded-lg border px-3 py-3 text-left"
                aria-pressed={Boolean(slideshow[key as keyof typeof slideshow])}
                style={{ borderColor: config.primary + '24', background: 'rgba(255,255,255,0.045)' }}
              >
                <span className="text-sm font-bold text-white">{label}</span>
                <span className="relative h-6 w-11 rounded-full" style={{ background: slideshow[key as keyof typeof slideshow] ? config.primary : 'rgba(255,255,255,0.16)' }}>
                  <motion.span animate={{ x: slideshow[key as keyof typeof slideshow] ? 23 : 4 }} className="absolute top-1 h-4 w-4 rounded-full bg-white" />
                </span>
              </button>
            ))}
          </div>
        </motion.section>

        <motion.section {...fadeUp} transition={{ duration: 0.56, delay: 0.24 }} className="neon-card p-5 md:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-black text-white">
            <Shield size={18} style={{ color: config.primary }} />
            Privacy & Access Control
          </h2>
          {[
            { key: 'privateSpace', label: 'Private Memory Space', desc: 'Only you can see this archive', Icon: Lock },
            { key: 'familySpace', label: 'Shared Family Space', desc: 'Invite family members by email', Icon: Users },
            { key: 'friendsCollab', label: 'Friends Collaboration', desc: 'Allow friends to add memories', Icon: Users },
          ].map(item => (
            <button type="button" key={item.label} onClick={() => togglePrivacy(item.key as keyof typeof privacy)} className="flex w-full items-center justify-between gap-4 border-b py-3 text-left last:border-b-0" aria-pressed={privacy[item.key as keyof typeof privacy]} style={{ borderColor: config.primary + '18' }}>
              <div className="flex items-start gap-3">
                <item.Icon size={17} style={{ color: config.primary }} />
                <div>
                  <p className="text-sm font-bold text-white">{item.label}</p>
                  <p className="text-xs text-white/48">{item.desc}</p>
                </div>
              </div>
              <span className="relative h-6 w-11 shrink-0 rounded-full" style={{ background: privacy[item.key as keyof typeof privacy] ? config.primary : 'rgba(255,255,255,0.16)' }}>
                <motion.span animate={{ x: privacy[item.key as keyof typeof privacy] ? 23 : 4 }} className="absolute top-1 h-4 w-4 rounded-full bg-white" />
              </span>
            </button>
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
