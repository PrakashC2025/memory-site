import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Pause, Play, Sparkles } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { SAMPLE_MEMORIES } from '../data/memories';
import type { Memory } from '../data/memories';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const EMOTION_COLORS: Record<string, string> = {
  joy: '#ffd166',
  nostalgia: '#8ee3ff',
  love: '#ff5fd2',
  adventure: '#36f1cd',
  friendship: '#7cf7ff',
  celebration: '#ff4ecd',
  farewell: '#d8f3ff',
};

const CINEMATIC_TRANSITIONS = [
  { initial: { opacity: 0, scale: 1.08 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.96 } },
  { initial: { opacity: 0, x: 80 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -80 } },
  { initial: { opacity: 0, y: 46 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -46 } },
  { initial: { opacity: 0, rotateY: 24 }, animate: { opacity: 1, rotateY: 0 }, exit: { opacity: 0, rotateY: -24 } },
];

interface StorySlideProps {
  memory: Memory;
  transitionIdx: number;
  progress: number;
  isPlaying: boolean;
}

const StorySlide: React.FC<StorySlideProps> = ({ memory, transitionIdx, progress, isPlaying }) => {
  const transition = CINEMATIC_TRANSITIONS[transitionIdx % CINEMATIC_TRANSITIONS.length];
  const color = EMOTION_COLORS[memory.emotion || 'joy'] || '#00e5ff';

  return (
    <motion.div
      key={memory.id}
      initial={transition.initial}
      animate={transition.animate}
      exit={transition.exit}
      transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-0 flex flex-col items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/82" />
      <motion.div
        className="absolute left-[-20%] top-[25%] h-[2px] w-[140%]"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)`, boxShadow: `0 0 34px ${color}` }}
        animate={{ y: [0, 100, 0], opacity: [0.18, 0.72, 0.18] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="absolute inset-0 neon-grid opacity-30" />

      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center px-4">
        <motion.div
          className="neon-card mb-6 overflow-hidden p-0 md:mb-8"
          style={{ borderColor: color + '55', boxShadow: `0 0 80px ${color}3d` }}
          animate={isPlaying ? { scale: [1, 1.018, 1] } : {}}
          transition={{ duration: 6, repeat: Infinity }}
        >
          <img src={memory.url} alt={memory.title} style={{ maxWidth: '86vw', maxHeight: '54vh', display: 'block' }} />
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/42 via-transparent to-transparent" />
          <motion.div
            animate={{ x: ['-120%', '120%'] }}
            transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 4 }}
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)', transform: 'skewX(-20deg)' }}
          />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="text-center">
          <h2 className="text-3xl font-black md:text-5xl" style={{ color, textShadow: `0 0 30px ${color}77` }}>
            {memory.title}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm italic leading-7 text-white/74 md:text-lg">"{memory.caption}"</p>

          <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs">
            <span className="flex items-center gap-1 rounded-lg border px-3 py-1.5" style={{ borderColor: color + '44', color, background: color + '12' }}>
              <CalendarDays size={13} />
              {MONTH_NAMES[memory.month]} {memory.year}
            </span>
            {memory.location && (
              <span className="flex items-center gap-1 rounded-lg border px-3 py-1.5" style={{ borderColor: color + '44', color, background: color + '12' }}>
                <MapPin size={13} />
                {memory.location}
              </span>
            )}
            {memory.emotion && (
              <span className="flex items-center gap-1 rounded-lg border px-3 py-1.5 capitalize" style={{ borderColor: color + '44', color, background: color + '12' }}>
                <Sparkles size={13} />
                {memory.emotion}
              </span>
            )}
          </div>
        </motion.div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
        <motion.div className="h-full" style={{ background: color, width: `${progress}%`, boxShadow: `0 0 14px ${color}` }} />
      </div>
    </motion.div>
  );
};

const StoryMode: React.FC = () => {
  const { config } = useTheme();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [transitionIdx, setTransitionIdx] = useState(0);
  const duration = 6000;

  const goTo = useCallback((index: number) => {
    setCurrentIdx(index);
    setTransitionIdx(value => value + 1);
    setProgress(0);
  }, []);

  const goNext = useCallback(() => {
    goTo((currentIdx + 1) % SAMPLE_MEMORIES.length);
  }, [currentIdx, goTo]);

  const goPrev = useCallback(() => {
    goTo((currentIdx - 1 + SAMPLE_MEMORIES.length) % SAMPLE_MEMORIES.length);
  }, [currentIdx, goTo]);

  useEffect(() => {
    if (!isPlaying) return;
    const start = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const nextProgress = Math.min((elapsed / duration) * 100, 100);
      setProgress(nextProgress);
      if (elapsed >= duration) {
        goNext();
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [isPlaying, currentIdx, goNext]);

  const memory = SAMPLE_MEMORIES[currentIdx];
  const color = EMOTION_COLORS[memory.emotion || 'joy'] || config.primary;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ zIndex: 5 }}>
      <AnimatePresence mode="wait">
        <StorySlide key={memory.id} memory={memory} transitionIdx={transitionIdx} progress={progress} isPlaying={isPlaying} />
      </AnimatePresence>

      <div className="absolute left-0 right-0 top-0 z-30 flex gap-1 px-4 pt-20 md:pt-24">
        {SAMPLE_MEMORIES.map((_, index) => (
          <button key={index} onClick={() => goTo(index)} className="h-1 flex-1 overflow-hidden rounded-full bg-white/16" aria-label={`Go to memory ${index + 1}`}>
            {index === currentIdx && isPlaying && <motion.div className="h-full rounded-full" style={{ background: color, width: `${progress}%` }} />}
            {index < currentIdx && <div className="h-full rounded-full" style={{ background: color }} />}
          </button>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-0 z-20">
        <button className="pointer-events-auto absolute bottom-0 left-0 top-0 w-1/3 opacity-0" onClick={goPrev} aria-label="Previous story memory" />
        <button className="pointer-events-auto absolute bottom-0 right-0 top-0 w-1/3 opacity-0" onClick={goNext} aria-label="Next story memory" />
      </div>

      <div className="absolute bottom-6 left-0 right-0 z-30 flex flex-col items-center gap-3 px-4">
        <div className="hide-scroll flex max-w-full gap-1.5 overflow-x-auto pb-1">
          {SAMPLE_MEMORIES.map((item, index) => (
            <motion.button
              key={item.id}
              whileHover={{ scale: 1.12, y: -3 }}
              onClick={() => goTo(index)}
              className="shrink-0 overflow-hidden rounded-lg"
              style={{
                width: 44,
                height: 44,
                border: index === currentIdx ? `2px solid ${color}` : '2px solid rgba(255,255,255,0.18)',
                opacity: index === currentIdx ? 1 : 0.52,
                boxShadow: index === currentIdx ? `0 0 14px ${color}88` : 'none',
              }}
            >
              <img src={item.thumbnail} alt="" className="h-full w-full object-cover" />
            </motion.button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <button onClick={goPrev} className="neon-button flex h-10 w-10 items-center justify-center" style={{ borderColor: color + '55', color }} aria-label="Previous">
            <ChevronLeft size={22} />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex h-14 w-14 items-center justify-center rounded-lg border-2 font-bold"
            style={{ background: isPlaying ? color : 'rgba(0,0,0,0.64)', borderColor: color, color: isPlaying ? '#020406' : color, boxShadow: `0 0 24px ${color}66` }}
            aria-label={isPlaying ? 'Pause story' : 'Play story'}
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button onClick={goNext} className="neon-button flex h-10 w-10 items-center justify-center" style={{ borderColor: color + '55', color }} aria-label="Next">
            <ChevronRight size={22} />
          </button>
        </div>

        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
          {currentIdx + 1} of {SAMPLE_MEMORIES.length} memories
        </div>
      </div>
    </div>
  );
};

export default StoryMode;
