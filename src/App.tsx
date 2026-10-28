import React, { Suspense, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import AppErrorBoundary from './components/AppErrorBoundary';
import AnimatedBackground from './components/AnimatedBackground';
import DriveLiveSync from './components/DriveLiveSync';
import MusicPlayer from './components/MusicPlayer';
import Navbar from './components/Navbar';
import SplashCursor from './components/SplashCursor';
import { isLegacyTvBrowser } from './utils/legacyBrowser';
import { ThemeProvider } from './context/ThemeContext';
import { UserProvider, useUser } from './context/UserContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import EventExplorer from './pages/EventExplorer';
import Memoriya from './pages/Memoriya';
import MemoryTree from './pages/MemoryTree';
import Settings from './pages/Settings';
import StoryMode from './pages/StoryMode';
import Timeline from './pages/Timeline';
import { LocalCastReceiver } from './components/LocalCast';

type Page = 'dashboard' | 'memoriya' | 'tree' | 'timeline' | 'events' | 'story' | 'settings';

const PAGE_TRANSITIONS = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const MOBILE_SURFACE_QUERY = '(max-width: 900px), (pointer: coarse)';

// Phones and tablets already pay for media decoding and touch scrolling.
// Keep page changes instant there instead of fading the whole screen through
// transparent black, and skip the decorative cursor fluid that has no cursor
// to follow on a touch screen.
const useMobileSurface = () => {
  const [mobile, setMobile] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(MOBILE_SURFACE_QUERY).matches
  ));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(MOBILE_SURFACE_QUERY);
    const sync = () => setMobile(query.matches);
    sync();
    if (query.addEventListener) query.addEventListener('change', sync);
    else query.addListener?.(sync);
    return () => {
      if (query.removeEventListener) query.removeEventListener('change', sync);
      else query.removeListener?.(sync);
    };
  }, []);

  return mobile;
};

const PageLoader: React.FC = () => (
  <div className="memoriya-page-loader" role="status" aria-label="Loading page">
    <span />
    <strong>Preparing memories</strong>
  </div>
);

const AppContent: React.FC = () => {
  const { authLoading, user } = useUser();
  const [currentPage, setCurrentPage] = useState<Page>('memoriya');
  const mobileSurface = useMobileSurface();

  if (new URLSearchParams(window.location.search).get('cast') === 'receiver') {
    return <LocalCastReceiver />;
  }

  const navigate = (page: string) => {
    setCurrentPage(page as Page);
    if (page !== 'story') {
      window.scrollTo({ top: 0, behavior: mobileSurface ? 'auto' : 'smooth' });
    }
  };

  if (authLoading) {
    return (
      <>
        <AnimatedBackground />
        <main className="relative z-10 grid min-h-screen place-items-center px-4">
          <div className="neon-card p-6 text-center">
            <div className="text-sm font-black uppercase tracking-[0.22em] text-white/70">Checking secure session</div>
            <div className="mt-3 h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full w-1/2 rounded-full bg-cyan-300" animate={{ x: ['-100%', '220%'] }} transition={{ duration: 1.1, repeat: Infinity }} />
            </div>
          </div>
        </main>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <AnimatedBackground />
        <main className="relative z-10">
          <Login />
        </main>
      </>
    );
  }

  const pageMotion = mobileSurface
    ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 1 }, transition: { duration: 0 } }
    : { ...PAGE_TRANSITIONS, transition: { duration: 0.24 } };
  const storyMotion = mobileSurface
    ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 1 }, transition: { duration: 0 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.28 } };

  return (
    <>
      <DriveLiveSync />
      <AnimatedBackground />
      {!isLegacyTvBrowser() && !mobileSurface && currentPage !== 'story' && (
        <SplashCursor
          SIM_RESOLUTION={96}
          DYE_RESOLUTION={720}
          SPLAT_RADIUS={0.11}
          SPLAT_FORCE={2800}
          DENSITY_DISSIPATION={5.2}
          VELOCITY_DISSIPATION={3}
          CURL={3}
          COLOR_UPDATE_SPEED={4}
          RAINBOW_MODE={false}
          COLOR="#a855f7"
        />
      )}

      {currentPage !== 'story' && <Navbar currentPage={currentPage} onNavigate={navigate} />}

      <main className={`relative ${currentPage === 'story' ? '' : 'z-10'}`}>
        <Suspense fallback={<PageLoader />}>
          <AnimatePresence mode={mobileSurface ? 'sync' : 'wait'}>
            {currentPage === 'dashboard' && (
              <motion.div key="dashboard" {...pageMotion}>
                <Dashboard onNavigate={navigate} />
              </motion.div>
            )}
            {currentPage === 'memoriya' && (
              <motion.div key="memoriya" {...pageMotion}>
                <Memoriya />
              </motion.div>
            )}
            {currentPage === 'tree' && (
              <motion.div key="tree" {...pageMotion}>
                <MemoryTree />
              </motion.div>
            )}
            {currentPage === 'timeline' && (
              <motion.div key="timeline" {...pageMotion}>
                <Timeline />
              </motion.div>
            )}
            {currentPage === 'events' && (
              <motion.div key="events" {...pageMotion}>
                <EventExplorer />
              </motion.div>
            )}
            {currentPage === 'story' && (
              <motion.div key="story" {...storyMotion}>
                <StoryMode onExit={() => navigate('dashboard')} />
              </motion.div>
            )}
            {currentPage === 'settings' && (
              <motion.div key="settings" {...pageMotion}>
                <Settings />
              </motion.div>
            )}
          </AnimatePresence>
        </Suspense>
      </main>

      {currentPage !== 'story' && <MusicPlayer />}
    </>
  );
};

const App: React.FC = () => (
  <AppErrorBoundary>
    <ThemeProvider>
      <UserProvider>
        <AppContent />
      </UserProvider>
    </ThemeProvider>
  </AppErrorBoundary>
);

export default App;
