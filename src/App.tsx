import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import AppErrorBoundary from './components/AppErrorBoundary';
import AnimatedBackground from './components/AnimatedBackground';
import MusicPlayer from './components/MusicPlayer';
import Navbar from './components/Navbar';
import { ThemeProvider } from './context/ThemeContext';
import { UserProvider, useUser } from './context/UserContext';
import Dashboard from './pages/Dashboard';
import EventExplorer from './pages/EventExplorer';
import Login from './pages/Login';
import Memoriya from './pages/Memoriya';
import MemoryTree from './pages/MemoryTree';
import Settings from './pages/Settings';
import StoryMode from './pages/StoryMode';
import Timeline from './pages/Timeline';

type Page = 'dashboard' | 'memoriya' | 'tree' | 'timeline' | 'events' | 'story' | 'settings';

const PAGE_TRANSITIONS = {
  initial: { opacity: 0, y: 18, filter: 'blur(8px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -18, filter: 'blur(8px)' },
};

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
      <AnimatedBackground />

      {currentPage !== 'story' && <Navbar currentPage={currentPage} onNavigate={navigate} />}

      <main className={`relative ${currentPage === 'story' ? '' : 'z-10'}`}>
        <AnimatePresence mode="wait">
          {currentPage === 'dashboard' && (
            <motion.div key="dashboard" {...PAGE_TRANSITIONS} transition={{ duration: 0.45 }}>
              <Dashboard onNavigate={navigate} />
            </motion.div>
          )}
          {currentPage === 'memoriya' && (
            <motion.div key="memoriya" {...PAGE_TRANSITIONS} transition={{ duration: 0.45 }}>
              <Memoriya />
            </motion.div>
          )}
          {currentPage === 'tree' && (
            <motion.div key="tree" {...PAGE_TRANSITIONS} transition={{ duration: 0.45 }}>
              <MemoryTree />
            </motion.div>
          )}
          {currentPage === 'timeline' && (
            <motion.div key="timeline" {...PAGE_TRANSITIONS} transition={{ duration: 0.45 }}>
              <Timeline />
            </motion.div>
          )}
          {currentPage === 'events' && (
            <motion.div key="events" {...PAGE_TRANSITIONS} transition={{ duration: 0.45 }}>
              <EventExplorer />
            </motion.div>
          )}
          {currentPage === 'story' && (
            <motion.div key="story" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.55 }}>
              <StoryMode onExit={() => navigate('dashboard')} />
            </motion.div>
          )}
          {currentPage === 'settings' && (
            <motion.div key="settings" {...PAGE_TRANSITIONS} transition={{ duration: 0.45 }}>
              <Settings />
            </motion.div>
          )}
        </AnimatePresence>
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
