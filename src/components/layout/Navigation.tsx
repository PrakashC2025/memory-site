// ─────────────────────────────────────────────
//  Memoriam — Top Navigation
// ─────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  TreePine, Clock, BookOpen, Map, Settings, LogOut,
  Music, VolumeX, Search, ChevronDown, Star, Home,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { THEMES } from '../../data/themes';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Home', icon: Home },
  { path: '/tree', label: 'Memory Tree', icon: TreePine },
  { path: '/timeline', label: 'Timeline', icon: Clock },
  { path: '/story', label: 'Story Mode', icon: BookOpen },
  { path: '/explore', label: 'Explore', icon: Map },
  { path: '/favorites', label: 'Favorites', icon: Star },
];

const Navigation: React.FC = () => {
  const { currentUser, logout, activeTheme, isMusicEnabled, toggleMusic, searchQuery, setSearchQuery } = useApp();
  const theme = THEMES[activeTheme];
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="fixed top-0 left-0 right-0 z-50 px-4 py-3"
    >
      <div
        className="max-w-7xl mx-auto rounded-2xl px-5 py-3 flex items-center gap-4"
        style={{
          background: scrolled ? 'rgba(10,8,18,0.85)' : 'rgba(10,8,18,0.4)',
          backdropFilter: 'blur(24px)',
          border: `1px solid ${theme.colors.border}`,
          transition: 'all 0.3s ease',
          boxShadow: scrolled ? `0 4px 30px rgba(0,0,0,0.4), 0 0 1px ${theme.colors.border}` : 'none',
        }}
      >
        {/* Logo */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 flex-shrink-0"
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
            style={{ background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.accent})` }}
          >
            🌳
          </div>
          <span className="font-display text-lg font-semibold hidden sm:block"
            style={{ color: theme.colors.primary, fontFamily: 'var(--font-display)' }}>
            Memoriam
          </span>
        </motion.button>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path;
            return (
              <motion.button
                key={path}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => navigate(path)}
                className="relative px-3 py-1.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5"
                style={{ color: isActive ? theme.colors.primary : 'rgba(255,255,255,0.5)' }}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-xl"
                    style={{ background: `${theme.colors.primary}15`, border: `1px solid ${theme.colors.border}` }}
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <Icon size={14} />
                <span className="relative">{label}</span>
              </motion.button>
            );
          })}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto md:ml-0">
          {/* Search */}
          <AnimatePresence>
            {showSearch && (
              <motion.input
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 180, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search memories..."
                className="text-sm px-3 py-1.5 rounded-xl outline-none overflow-hidden"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: `1px solid ${theme.colors.border}`,
                  color: theme.colors.text,
                }}
                autoFocus
                onBlur={() => { if (!searchQuery) setShowSearch(false); }}
              />
            )}
          </AnimatePresence>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowSearch(s => !s)}
            className="p-2 rounded-xl"
            style={{ color: showSearch ? theme.colors.primary : 'rgba(255,255,255,0.4)' }}
          >
            <Search size={16} />
          </motion.button>

          {/* Music toggle */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={toggleMusic}
            className="p-2 rounded-xl"
            style={{ color: isMusicEnabled ? theme.colors.primary : 'rgba(255,255,255,0.4)' }}
            title={isMusicEnabled ? 'Disable ambient music' : 'Enable ambient music'}
          >
            {isMusicEnabled ? <Music size={16} /> : <VolumeX size={16} />}
          </motion.button>

          {/* Settings */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('/settings')}
            className="p-2 rounded-xl"
            style={{ color: location.pathname === '/settings' ? theme.colors.primary : 'rgba(255,255,255,0.4)' }}
          >
            <Settings size={16} />
          </motion.button>

          {/* User menu */}
          <div className="relative">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowUserMenu(s => !s)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${theme.colors.border}` }}
            >
              <img
                src={currentUser?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.email}`}
                alt={currentUser?.name}
                className="w-6 h-6 rounded-full object-cover"
              />
              <span className="text-xs font-medium hidden sm:block" style={{ color: theme.colors.text }}>
                {currentUser?.name?.split(' ')[0]}
              </span>
              <ChevronDown size={12} style={{ color: 'rgba(255,255,255,0.4)' }} />
            </motion.button>

            <AnimatePresence>
              {showUserMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-48 rounded-xl overflow-hidden"
                  style={{
                    background: 'rgba(10,8,18,0.95)',
                    backdropFilter: 'blur(20px)',
                    border: `1px solid ${theme.colors.border}`,
                    boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                  }}
                >
                  <div className="px-4 py-3 border-b" style={{ borderColor: theme.colors.border }}>
                    <p className="text-sm font-medium" style={{ color: theme.colors.text }}>{currentUser?.name}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{currentUser?.email}</p>
                  </div>
                  <button
                    onClick={() => { setShowUserMenu(false); navigate('/settings'); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-white/05"
                    style={{ color: 'rgba(255,255,255,0.6)' }}
                  >
                    <Settings size={14} /> Settings
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-white/05"
                    style={{ color: '#ff6b6b' }}
                  >
                    <LogOut size={14} /> Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 pb-4">
        <div
          className="rounded-2xl px-4 py-3 flex items-center justify-around"
          style={{
            background: 'rgba(10,8,18,0.9)',
            backdropFilter: 'blur(24px)',
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          {NAV_ITEMS.slice(0, 5).map(({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path;
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="flex flex-col items-center gap-1 p-2 rounded-xl"
                style={{ color: isActive ? theme.colors.primary : 'rgba(255,255,255,0.4)' }}
              >
                <Icon size={18} />
                <span className="text-xs">{label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </motion.nav>
  );
};

export default Navigation;
