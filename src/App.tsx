import React, { Suspense, lazy, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import AppErrorBoundary from './components/AppErrorBoundary';
import AnimatedBackground from './components/AnimatedBackground';
import DriveLiveSync from './components/DriveLiveSync';
import MusicPlayer from './components/MusicPlayer';
import Navbar from './components/Navbar';
import SplashCursor from './components/SplashCursor';
import { ThemeProvider } from './context/ThemeContext';
import { UserProvider, useUser } from './context/UserContext';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const EventExplorer = lazy(() => import('./pages/EventExplorer'));
const Memoriya = lazy(() => import('./pages/Memoriya'));
const MemoryTree = lazy(() => import('./pages/MemoryTree'));
const Settings = lazy(() => import('./pages/Settings'));
const StoryMode = lazy(() => import('./pages/StoryMode'));
const Timeline = lazy(() => import('./pages/Timeline'));

type Page = 'dashboard' | 'memoriya' | 'tree' | 'timeline' | 'events' | 'story' | 'settings';

const PAGE_TRANSITIONS = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
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

  const navigate = (page: string) => {
    setCurrentPage(page as Page);
    if (page !== 'story') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
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

  return (
    <>
      <DriveLiveSync />
      <AnimatedBackground />
      {currentPage !== 'story' && (
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
          <AnimatePresence mode="wait">
            {currentPage === 'dashboard' && (
              <motion.div key="dashboard" {...PAGE_TRANSITIONS} transition={{ duration: 0.24 }}>
                <Dashboard onNavigate={navigate} />
              </motion.div>
            )}
            {currentPage === 'memoriya' && (
              <motion.div key="memoriya" {...PAGE_TRANSITIONS} transition={{ duration: 0.24 }}>
                <Memoriya />
              </motion.div>
            )}
            {currentPage === 'tree' && (
              <motion.div key="tree" {...PAGE_TRANSITIONS} transition={{ duration: 0.24 }}>
                <MemoryTree />
              </motion.div>
            )}
            {currentPage === 'timeline' && (
              <motion.div key="timeline" {...PAGE_TRANSITIONS} transition={{ duration: 0.24 }}>
                <Timeline />
              </motion.div>
            )}
            {currentPage === 'events' && (
              <motion.div key="events" {...PAGE_TRANSITIONS} transition={{ duration: 0.24 }}>
                <EventExplorer />
              </motion.div>
            )}
            {currentPage === 'story' && (
              <motion.div key="story" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28 }}>
                <StoryMode onExit={() => navigate('dashboard')} />
              </motion.div>
            )}
            {currentPage === 'settings' && (
              <motion.div key="settings" {...PAGE_TRANSITIONS} transition={{ duration: 0.24 }}>
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
