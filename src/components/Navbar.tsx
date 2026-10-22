import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Clock3,
  FolderHeart,
  Images,
  Film,
  Home,
  LogOut,
  Menu,
  Palette,
  Settings,
  Sparkles,
  TreePine,
  User,
  X,
} from 'lucide-react';
import { THEMES, type Theme, useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';

interface NavbarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

const NAV_ITEMS = [
  { id: 'memoriya', label: 'Memoriya', Icon: Images },
  { id: 'dashboard', label: 'Home', Icon: Home },
  { id: 'tree', label: 'Memory Tree', Icon: TreePine },
  { id: 'timeline', label: 'Timeline', Icon: Clock3 },
  { id: 'events', label: 'Events', Icon: FolderHeart },
  { id: 'story', label: 'Story Mode', Icon: Film },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

const Navbar: React.FC<NavbarProps> = ({ currentPage, onNavigate }) => {
  const { config, theme, setTheme } = useTheme();
  const { logout, user } = useUser();
  const [themeOpen, setThemeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNavigate = (page: string) => {
    onNavigate(page);
    setMenuOpen(false);
    setThemeOpen(false);
  };

  return (
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.55, ease: 'easeOut' }}
      className="memoriya-navbar fixed left-0 right-0 top-0 z-40 flex items-center justify-between px-4 py-3 md:px-8"
      style={{
        background: 'linear-gradient(180deg, rgba(3,4,7,0.9), rgba(3,4,7,0.72))',
        backdropFilter: 'blur(14px) saturate(130%)',
        borderBottom: `1px solid ${config.primary}24`,
        boxShadow: '0 10px 28px rgba(0,0,0,0.24)',
      }}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${config.primary}99, ${config.secondary}99, transparent)` }}
        aria-hidden="true"
      />
      <motion.button type="button" onClick={() => handleNavigate('memoriya')} className="navbar-brand" whileHover={{ scale: 1.01 }} aria-label="Open Memoriya home">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl border"
          style={{
            borderColor: config.primary + '66',
            color: '#020406',
            background: `linear-gradient(135deg, ${config.primary}, ${config.secondary})`,
            boxShadow: `0 0 22px ${config.glow}`,
          }}
        >
          <Sparkles size={19} />
        </span>
        <span className="text-left">
          <span className="block text-lg font-black tracking-[0.18em] text-white">MEMORIYA</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: config.accent }}>
            Photo Social
          </span>
        </span>
      </motion.button>

      <div className="navbar-links hidden items-center gap-1 md:flex">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = currentPage === id;
          return (
            <button
              type="button"
              key={id}
              onClick={() => handleNavigate(id)}
              className="navbar-link relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all"
              style={{
                color: active ? config.primary : 'rgba(255,255,255,0.66)',
              }}
              title={label}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
            >
              {active && (
                <motion.span
                  layoutId="nav-indicator"
                  className="absolute inset-0 rounded-lg border"
                  style={{
                    borderColor: config.primary + '66',
                    background: `linear-gradient(135deg, ${config.primary}2b, ${config.secondary}18)`,
                    boxShadow: `0 0 20px ${config.glow}`,
                  }}
                />
              )}
              <Icon className="relative z-10" size={16} />
              <span className="relative z-10">{label}</span>
              {active && (
                <motion.span
                  layoutId="nav-active-dot"
                  className="relative z-10 h-1.5 w-1.5 rounded-full"
                  style={{ background: config.primary, boxShadow: `0 0 10px ${config.primary}` }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="navbar-actions flex items-center gap-2 md:gap-3">
        <div className="relative">
          <motion.button
            type="button"
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setThemeOpen(v => !v)}
            className="neon-button flex h-10 w-10 items-center justify-center"
            style={{ color: config.primary, borderColor: config.primary + '55' }}
            aria-label="Change theme"
            aria-expanded={themeOpen}
            aria-haspopup="menu"
          >
            <Palette size={17} />
          </motion.button>

          <AnimatePresence>
            {themeOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: -8 }}
                className="navbar-theme-menu neon-card absolute right-0 top-12 z-50 min-w-[220px] p-3"
              >
                {(Object.entries(THEMES) as [Theme, typeof THEMES[Theme]][]).map(([key, item]) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => {
                      setTheme(key);
                      setThemeOpen(false);
                    }}
                    className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-all"
                    style={{
                      background: theme === key ? item.primary + '1f' : 'transparent',
                      color: theme === key ? item.primary : 'rgba(255,255,255,0.72)',
                      border: `1px solid ${theme === key ? item.primary + '55' : 'transparent'}`,
                    }}
                  >
                    <span className="h-3 w-3 rounded-full" style={{ background: item.primary }} />
                    {item.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div
          className="navbar-user hidden items-center gap-2 rounded-lg border px-3 py-2 text-sm md:flex"
          style={{ borderColor: config.primary + '33', background: 'rgba(255,255,255,0.06)', color: config.accent }}
        >
          <User size={15} />
          <span className="max-w-[110px] truncate text-xs font-semibold">{user?.name?.split(' ')[0] || 'User'}</span>
        </div>

        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          onClick={logout}
          className="navbar-signout neon-button hidden items-center gap-2 px-3 py-2 text-xs font-semibold md:flex"
        >
          <LogOut size={14} />
          Sign Out
        </motion.button>

        <button
          type="button"
          className="neon-button flex h-10 w-10 items-center justify-center md:hidden"
          onClick={() => setMenuOpen(v => !v)}
          style={{ color: config.primary, borderColor: config.primary + '44' }}
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="absolute left-0 right-0 top-full overflow-hidden border-t md:hidden"
            style={{ background: 'rgba(3,4,7,0.95)', backdropFilter: 'blur(20px)', borderColor: config.primary + '24' }}
          >
            <div className="flex flex-col gap-1 px-4 py-3">
              {NAV_ITEMS.map(({ id, label, Icon }) => (
                <button
                  type="button"
                  key={id}
                  onClick={() => handleNavigate(id)}
                  className="flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-semibold"
                  style={{
                    color: currentPage === id ? config.primary : 'rgba(255,255,255,0.72)',
                    background: currentPage === id ? config.primary + '18' : 'transparent',
                  }}
                >
                  <Icon size={17} />
                  {label}
                </button>
              ))}
              <button type="button" onClick={logout} className="flex items-center gap-3 px-4 py-3 text-left text-sm text-white/50">
                <LogOut size={17} />
                Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

export default Navbar;
