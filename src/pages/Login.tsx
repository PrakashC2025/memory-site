import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, Lock, Mail, Palette, ShieldCheck, Sparkles, UserPlus, Zap } from 'lucide-react';
import { THEMES, type Theme, useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';

type AuthMode = 'signin' | 'create';

const Login: React.FC = () => {
  const { config, theme, setTheme } = useTheme();
  const { authError, authLoading, createAccount, firebaseReady, signIn, signInWithGoogle } = useUser();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');

  const submit = async () => {
    setLocalError('');
    if (!firebaseReady) {
      setLocalError('Firebase is not configured for this deployment. Add VITE_FIREBASE_* values in Vercel Environment Variables, then redeploy.');
      return;
    }
    if (!email.trim() || !password) {
      setLocalError('Enter your email and password.');
      return;
    }
    if (mode === 'create' && !name.trim()) {
      setLocalError('Enter your name to create an account.');
      return;
    }
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }

    try {
      if (mode === 'create') await createAccount(name, email, password);
      else await signIn(email, password);
    } catch {
      // User-facing error comes from authError.
    }
  };

  const googleLogin = async () => {
    setLocalError('');
    if (!firebaseReady) {
      setLocalError('Firebase is not configured for this deployment. Add VITE_FIREBASE_* values in Vercel Environment Variables, then redeploy.');
      return;
    }
    try {
      await signInWithGoogle();
    } catch {
      // User-facing error comes from authError.
    }
  };

  const error = localError || authError;

  return (
    <div className="neon-shell flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 28 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="grid w-full max-w-6xl gap-5 lg:grid-cols-[1.05fr_0.95fr]"
      >
        <section className="flex flex-col justify-center">
          <div
            className="mb-6 inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-[0.24em]"
            style={{ borderColor: config.primary + '44', color: config.accent, background: 'rgba(255,255,255,0.06)' }}
          >
            <Sparkles size={14} />
            Secure Memory OS
          </div>

          <h1 className="neon-title max-w-3xl text-5xl font-black leading-none tracking-tight md:text-7xl">
            Your private Drive gallery, locked behind Firebase.
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-white/68 md:text-lg">
            Sign in with Google or email/password. Sessions remain active while you use Memoriya and automatically sign out after one hour of inactivity.
          </p>

          <div className="mt-8 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: 'Firebase Auth', text: 'Email/password and Google sign-in', Icon: ShieldCheck },
              { label: 'Idle Logout', text: 'One hour of inactivity ends the session', Icon: Lock },
              { label: 'Drive Ready', text: 'Media loads only after real OAuth', Icon: Zap },
            ].map(item => (
              <div key={item.label} className="neon-card p-4">
                <item.Icon size={18} style={{ color: config.primary }} />
                <div className="mt-3 text-sm font-bold text-white">{item.label}</div>
                <p className="mt-1 text-xs leading-5 text-white/55">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="neon-card p-5 md:p-7">
          <div
            className="mb-6 flex h-14 w-14 items-center justify-center rounded-lg border"
            style={{ borderColor: config.primary + '55', color: config.primary, background: config.primary + '16', boxShadow: `0 0 32px ${config.glow}` }}
          >
            <Sparkles size={24} />
          </div>

          <div className="mb-5 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/5 p-1">
            {[
              { id: 'signin', label: 'Sign in' },
              { id: 'create', label: 'Create account' },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setMode(item.id as AuthMode)}
                className="rounded-lg px-3 py-2 text-sm font-black"
                style={{
                  background: mode === item.id ? config.primary + '24' : 'transparent',
                  color: mode === item.id ? config.primary : 'rgba(255,255,255,0.58)',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <h2 className="text-2xl font-black text-white">{mode === 'create' ? 'Create Memoriya account' : 'Welcome back'}</h2>
          <p className="mt-2 text-sm leading-6 text-white/58">Use Firebase Authentication. No passwords are stored in this app.</p>

          <div className="mt-6 space-y-4">
            {mode === 'create' && (
              <AuthField icon={<UserPlus size={13} />} label="Your name">
                <input value={name} onChange={event => setName(event.target.value)} placeholder="Enter your name" />
              </AuthField>
            )}

            <AuthField icon={<Mail size={13} />} label="Email address">
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
            </AuthField>

            <AuthField icon={<Lock size={13} />} label="Password">
              <div className="auth-password-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                  onKeyDown={event => event.key === 'Enter' && submit()}
                />
                <button onClick={() => setShowPassword(value => !value)} aria-label="Toggle password visibility">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </AuthField>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              onClick={submit}
              disabled={authLoading}
              className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg px-5 py-3.5 text-sm font-black text-black disabled:opacity-60"
              style={{
                background: `linear-gradient(135deg, ${config.primary}, ${config.secondary}, ${config.accent})`,
                boxShadow: `0 0 34px ${config.glow}`,
              }}
            >
              {authLoading ? 'Checking session...' : mode === 'create' ? 'Create account' : 'Sign in'}
              {!authLoading && <ArrowRight size={17} />}
            </button>

            <button onClick={googleLogin} disabled={authLoading} className="google-login-button">
              <span>G</span>
              Continue with Google
            </button>
          </div>

          <div className="mt-7 border-t pt-5" style={{ borderColor: config.primary + '24' }}>
            <p className="mb-3 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/50">
              <Palette size={13} />
              Theme
            </p>
            <div className="grid grid-cols-5 gap-2">
              {(Object.entries(THEMES) as [Theme, typeof THEMES[Theme]][]).map(([key, item]) => (
                <button
                  key={key}
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

const AuthField: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <label className="auth-field">
    <span>{icon}{label}</span>
    {children}
  </label>
);

export default Login;
