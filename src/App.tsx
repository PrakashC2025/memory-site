import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import AnimatedBackground from './components/AnimatedBackground';
import MusicPlayer from './components/MusicPlayer';
import Navbar from './components/Navbar';
import { ThemeProvider } from './context/ThemeContext';
import { UserProvider, useUser } from './context/UserContext';
import Dashboard from './pages/Dashboard';
import EventExplorer from './pages/EventExplorer';
import Login from './pages/Login';
import MemoryTree from './pages/MemoryTree';
import Settings from './pages/Settings';
import StoryMode from './pages/StoryMode';
import Timeline from './pages/Timeline';

type Page = 'dashboard' | 'tree' | 'timeline' | 'events' | 'story' | 'settings';

const PAGE_TRANSITIONS = {
  initial: { opacity: 0, y: 18, filter: 'blur(8px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -18, filter: 'blur(8px)' },
};

const AppContent: React.FC = () => {
  const { user } = useUser();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');

  const navigate = (page: string) => {
    setCurrentPage(page as Page);
    if (page !== 'story') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

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
              <div className="fixed right-4 top-4 z-50">
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => navigate('dashboard')}
                  className="neon-button flex items-center gap-2 px-3 py-2 text-xs font-semibold"
                  style={{ borderColor: 'rgba(255,255,255,0.22)', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(16px)' }}
                >
                  <X size={14} />
                  Exit Story
                </motion.button>
              </div>
              <StoryMode />
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
  <ThemeProvider>
    <UserProvider>
      <AppContent />
    </UserProvider>
  </ThemeProvider>
);

export default App;
