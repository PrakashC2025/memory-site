// ─────────────────────────────────────────────
//  Memoriam — Landing / Login Page
// ─────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import ParticleField from '../components/ui/ParticleField';
import FloatingOrbs from '../components/ui/FloatingOrbs';

const QUOTES = [
  'Your moments, still alive.',
  'A tree grown from memories.',
  'Relive the days that shaped you.',
  'Every photo holds a heartbeat.',
  'Time passes. Memories stay.',
  'The best chapters never truly end.',
];

const PREVIEW_IMAGES = [
  'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=300',
  'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=300',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300',
  'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=300',
  'https://images.unsplash.com/photo-1627556704302-624286467c65?w=300',
  'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=300',
];

const Landing: React.FC = () => {
  const { login, isLoading, isAuthenticated } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [currentQuote, setCurrentQuote] = useState(0);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard');
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentQuote(q => (q + 1) % QUOTES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleLogin = async () => {
    if (!email.trim()) return;
    login(email.trim().toLowerCase());
  };

  const handleDemoLogin = () => {
    setEmail('demo@memoriam.app');
    login('demo@memoriam.app');
  };

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: '#0a0812' }}>
      {/* Ambient background */}
      <FloatingOrbs />
      <ParticleField count={80} />

      {/* Deep gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 30% 40%, rgba(255,180,80,0.06) 0%, transparent 60%), radial-gradient(ellipse at 70% 70%, rgba(160,128,255,0.04) 0%, transparent 50%)',
        }}
      />

      {/* Floating preview photos */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {PREVIEW_IMAGES.map((src, i) => (
          <motion.div
            key={i}
            className="absolute rounded-2xl overflow-hidden"
            style={{
              width: `${120 + (i % 3) * 30}px`,
              left: `${[5, 75, 15, 80, 20, 70][i]}%`,
              top: `${[15, 20, 65, 55, 40, 75][i]}%`,
              transform: `rotate(${[-8, 5, -4, 7, -6, 3][i]}deg)`,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 30px rgba(255,180,80,0.08)',
              border: '1px solid rgba(255,255,255,0.06)',
              opacity: 0.35,
            }}
            animate={{
              y: [0, -15, 8, -10, 0],
              rotate: [
                `${[-8, 5, -4, 7, -6, 3][i]}deg`,
                `${[-8, 5, -4, 7, -6, 3][i] + 2}deg`,
                `${[-8, 5, -4, 7, -6, 3][i] - 1}deg`,
                `${[-8, 5, -4, 7, -6, 3][i]}deg`,
              ],
              opacity: [0.35, 0.5, 0.3, 0.45, 0.35],
            }}
            transition={{
              duration: 8 + i * 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.8,
            }}
          >
            <img src={src} alt="" className="w-full h-full object-cover" style={{ aspectRatio: '3/4' }} />
          </motion.div>
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 text-center">

        {/* Logo mark */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
          className="mb-8"
        >
          <div
            className="w-24 h-24 mx-auto rounded-3xl flex items-center justify-center text-5xl mb-4"
            style={{
              background: 'linear-gradient(135deg, rgba(255,216,155,0.15), rgba(232,168,124,0.1))',
              border: '1px solid rgba(255,190,90,0.2)',
              boxShadow: '0 0 60px rgba(255,180,80,0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
            }}
          >
            🌳
          </div>
          <motion.p
            className="text-xs font-medium tracking-[0.3em] uppercase"
            style={{ color: 'rgba(255,216,155,0.5)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            Memoriam
          </motion.p>
        </motion.div>

        {/* Main headline */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mb-6 max-w-3xl"
        >
          <h1
            className="text-5xl md:text-7xl font-bold leading-tight mb-4"
            style={{
              fontFamily: 'var(--font-display)',
              background: 'linear-gradient(135deg, #ffd89b 0%, #e8a87c 50%, #c8a2ff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              textShadow: 'none',
            }}
          >
            Your memories,
            <br />
            <span style={{ fontStyle: 'italic' }}>still alive.</span>
          </h1>
          <p
            className="text-lg md:text-xl font-light leading-relaxed max-w-xl mx-auto"
            style={{ color: 'rgba(240,232,216,0.6)', fontFamily: 'var(--font-elegant)' }}
          >
            Connect your Google Drive and watch your photos and videos bloom
            into a living memory tree — organized by time, emotion, and story.
          </p>
        </motion.div>

        {/* Rotating quote */}
        <div className="h-8 mb-10 relative overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={currentQuote}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.5 }}
              className="text-sm font-medium tracking-wide"
              style={{
                color: 'rgba(255,216,155,0.5)',
                fontFamily: 'var(--font-elegant)',
                fontStyle: 'italic',
              }}
            >
              "{QUOTES[currentQuote]}"
            </motion.p>
          </AnimatePresence>
        </div>

        {/* CTA buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-4 items-center"
        >
          <motion.button
            whileHover={{ scale: 1.04, boxShadow: '0 0 40px rgba(255,180,80,0.3)' }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowLogin(true)}
            className="px-8 py-4 rounded-2xl font-semibold text-base transition-all"
            style={{
              background: 'linear-gradient(135deg, #ffd89b, #e8a87c)',
              color: '#1a0f00',
              boxShadow: '0 8px 30px rgba(255,180,80,0.25)',
            }}
          >
            ✨ Begin Your Memory Journey
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleDemoLogin}
            className="px-8 py-4 rounded-2xl font-medium text-base border transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(12px)',
            }}
          >
            🎭 View Demo
          </motion.button>
        </motion.div>

        {/* Feature pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="flex flex-wrap gap-2 justify-center mt-10"
        >
          {[
            '🌳 Memory Tree', '📅 Timeline', '🎬 Story Mode',
            '☁️ Google Drive', '🎨 7 Themes', '🔒 Private & Secure',
          ].map(pill => (
            <span
              key={pill}
              className="px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              {pill}
            </span>
          ))}
        </motion.div>
      </div>

      {/* Loading overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
            style={{ background: 'rgba(10,8,18,0.96)', backdropFilter: 'blur(20px)' }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="w-16 h-16 rounded-full mb-6"
              style={{
                border: '2px solid rgba(255,216,155,0.15)',
                borderTop: '2px solid #ffd89b',
              }}
            />
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-lg font-light"
              style={{ color: '#ffd89b', fontFamily: 'var(--font-display)' }}
            >
              Growing your memory tree...
            </motion.p>
            <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Organizing your moments with care
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Login modal */}
      <AnimatePresence>
        {showLogin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}
            onClick={() => setShowLogin(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', bounce: 0.3 }}
              className="w-full max-w-md p-8 rounded-3xl"
              style={{
                background: 'rgba(14,10,24,0.95)',
                border: '1px solid rgba(255,190,90,0.15)',
                boxShadow: '0 40px 80px rgba(0,0,0,0.6), 0 0 60px rgba(255,180,80,0.08)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center mb-8">
                <div className="text-4xl mb-4">🌳</div>
                <h2 className="text-2xl font-bold mb-2" style={{
                  fontFamily: 'var(--font-display)',
                  background: 'linear-gradient(135deg, #ffd89b, #e8a87c)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                }}>
                  Welcome Back
                </h2>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-elegant)', fontStyle: 'italic' }}>
                  Enter your email to access your memory world
                </p>
              </div>

              <div className="space-y-4">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3.5 rounded-2xl text-sm outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,190,90,0.2)',
                    color: '#f0e8d8',
                  }}
                />

                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: '0 0 30px rgba(255,180,80,0.3)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleLogin}
                  className="w-full py-3.5 rounded-2xl font-semibold text-base transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #ffd89b, #e8a87c)',
                    color: '#1a0f00',
                  }}
                >
                  Enter My Memory World →
                </motion.button>

                <div className="relative flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>or</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
                </div>

                {/* Google OAuth button – wire up real OAuth here */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDemoLogin}
                  className="w-full py-3.5 rounded-2xl text-sm font-medium flex items-center justify-center gap-3 transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.7)',
                  }}
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google (Demo)
                </motion.button>
              </div>

              <p className="text-center text-xs mt-6" style={{ color: 'rgba(255,255,255,0.2)' }}>
                Demo email: demo@memoriam.app • Access is by invitation only
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Landing;
