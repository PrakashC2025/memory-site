import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight, Heart, MapPin, Sparkles, X } from 'lucide-react';
import type { Memory } from '../data/memories';

interface Props {
  memory: Memory | null;
  memories?: Memory[];
  onClose: () => void;
}

const EMOTION_COLORS: Record<string, string[]> = {
  joy: ['#ffd166', '#00e5ff', '#ff4ecd'],
  nostalgia: ['#8ee3ff', '#ff4ecd', '#36f1cd'],
  love: ['#ff5fd2', '#4dffdf', '#ffe66d'],
  adventure: ['#36f1cd', '#b8ff6a', '#00e5ff'],
  friendship: ['#7cf7ff', '#8ab4ff', '#ff4ecd'],
  celebration: ['#ffd166', '#ff4ecd', '#b8ff6a'],
  farewell: ['#d8f3ff', '#36f1cd', '#ff4d8d'],
};

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const AnimatedLightboxBG: React.FC<{ colors: string[] }> = ({ colors }) => (
  <div className="absolute inset-0 overflow-hidden">
    <div className="absolute inset-0 bg-black/90" />
    <motion.div
      className="absolute left-[-15%] top-[14%] h-[2px] w-[130%]"
      style={{ background: `linear-gradient(90deg, transparent, ${colors[0]}, ${colors[1]}, transparent)`, boxShadow: `0 0 34px ${colors[0]}` }}
      animate={{ y: [0, 90, 0], opacity: [0.2, 0.72, 0.2] }}
      transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
    />
    <motion.div
      className="absolute left-[-20%] top-[62%] h-[2px] w-[140%]"
      style={{ background: `linear-gradient(90deg, transparent, ${colors[2]}, ${colors[0]}, transparent)`, boxShadow: `0 0 34px ${colors[2]}` }}
      animate={{ y: [0, -110, 0], opacity: [0.18, 0.64, 0.18] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
    />
    <div className="absolute inset-0 neon-grid opacity-35" />
    <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.82) 100%)' }} />
  </div>
);

const MemoryLightbox: React.FC<Props> = ({ memory, memories = [], onClose }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    if (!memory || !memories.length) return;
    const idx = memories.findIndex(item => item.id === memory.id);
    setCurrentIdx(idx >= 0 ? idx : 0);
    setImageLoaded(false);
  }, [memory, memories]);

  const goNext = () => {
    if (!memories.length) return;
    setImageLoaded(false);
    setCurrentIdx(index => (index + 1) % memories.length);
  };

  const goPrev = () => {
    if (!memories.length) return;
    setImageLoaded(false);
    setCurrentIdx(index => (index - 1 + memories.length) % memories.length);
  };

  useEffect(() => {
    if (!memory) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') goNext();
      if (event.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentIdx, memories, memory]);

  if (!memory) return null;

  const current = memories.length > 0 ? memories[currentIdx] : memory;
  const colors = EMOTION_COLORS[current.emotion || 'joy'] || EMOTION_COLORS.joy;

  return (
    <AnimatePresence>
      <motion.div
        key="lightbox"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center"
        onClick={event => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <AnimatedLightboxBG colors={colors} />

        <div className="relative z-10 flex h-full w-full flex-col items-center justify-center p-4 md:p-8">
          <button
            onClick={onClose}
            className="neon-button absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center"
            style={{ borderColor: colors[0] + '66', color: colors[0], background: 'rgba(0,0,0,0.55)' }}
            aria-label="Close lightbox"
          >
            <X size={18} />
          </button>

          {memories.length > 1 && (
            <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-lg border px-4 py-1.5 text-xs font-bold" style={{ borderColor: colors[0] + '44', color: colors[0], background: 'rgba(0,0,0,0.45)' }}>
              {currentIdx + 1} / {memories.length}
            </div>
          )}

          <div className="flex w-full max-w-6xl flex-col items-center gap-5">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, scale: 0.92, rotateX: 8 }}
              animate={{ opacity: 1, scale: 1, rotateX: 0 }}
              exit={{ opacity: 0, scale: 0.92, rotateX: -8 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="relative flex w-full items-center justify-center"
              style={{ maxHeight: '64vh' }}
            >
              <div className="neon-card relative overflow-hidden p-0" style={{ borderColor: colors[0] + '55', boxShadow: `0 0 70px ${colors[0]}33` }}>
                {!imageLoaded && (
                  <div className="absolute inset-0 z-10 flex min-h-[220px] min-w-[300px] items-center justify-center">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }} style={{ color: colors[0] }}>
                      <Sparkles size={34} />
                    </motion.div>
                  </div>
                )}
                <img
                  src={current.url}
                  alt={current.title}
                  onLoad={() => setImageLoaded(true)}
                  className="block transition-all duration-500"
                  style={{ maxHeight: '64vh', maxWidth: '90vw', opacity: imageLoaded ? 1 : 0 }}
                />
                {imageLoaded && (
                  <motion.div
                    initial={{ x: '-120%' }}
                    animate={{ x: '120%' }}
                    transition={{ duration: 1.3, delay: 0.18 }}
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)', transform: 'skewX(-18deg)' }}
                  />
                )}
              </div>

              {memories.length > 1 && (
                <>
                  <button
                    onClick={goPrev}
                    className="neon-button absolute left-0 flex h-11 w-11 items-center justify-center md:-left-16"
                    style={{ borderColor: colors[0] + '55', color: colors[0], background: 'rgba(0,0,0,0.62)' }}
                    aria-label="Previous memory"
                  >
                    <ChevronLeft size={23} />
                  </button>
                  <button
                    onClick={goNext}
                    className="neon-button absolute right-0 flex h-11 w-11 items-center justify-center md:-right-16"
                    style={{ borderColor: colors[0] + '55', color: colors[0], background: 'rgba(0,0,0,0.62)' }}
                    aria-label="Next memory"
                  >
                    <ChevronRight size={23} />
                  </button>
                </>
              )}
            </motion.div>

            <motion.div key={`info-${current.id}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="max-w-3xl text-center">
              <h2 className="text-3xl font-black md:text-4xl" style={{ color: colors[0], textShadow: `0 0 28px ${colors[0]}88` }}>
                {current.title}
              </h2>
              <p className="mt-3 text-sm italic leading-7 text-white/72 md:text-base">"{current.caption}"</p>

              <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
                <span className="flex items-center gap-1 rounded-lg border px-3 py-1.5" style={{ borderColor: colors[0] + '44', color: colors[0], background: colors[0] + '12' }}>
                  <CalendarDays size={13} />
                  {MONTH_NAMES[current.month]} {current.year}
                </span>
                {current.location && (
                  <span className="flex items-center gap-1 rounded-lg border px-3 py-1.5" style={{ borderColor: colors[1] + '44', color: colors[1], background: colors[1] + '12' }}>
                    <MapPin size={13} />
                    {current.location}
                  </span>
                )}
                {current.emotion && (
                  <span className="flex items-center gap-1 rounded-lg border px-3 py-1.5 capitalize" style={{ borderColor: colors[2] + '44', color: colors[2], background: colors[2] + '12' }}>
                    <Sparkles size={13} />
                    {current.emotion}
                  </span>
                )}
                {current.isFavorite && (
                  <span className="flex items-center gap-1 rounded-lg border px-3 py-1.5" style={{ borderColor: '#ffd16655', color: '#ffd166', background: '#ffd16612' }}>
                    <Heart size={13} />
                    Favorite
                  </span>
                )}
              </div>

              {current.tags && current.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {current.tags.map(tag => (
                    <span key={tag} className="rounded-lg px-2 py-1 text-xs text-white/52" style={{ background: colors[0] + '18' }}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>

            {memories.length > 1 && (
              <div className="hide-scroll flex max-w-full gap-2 overflow-x-auto px-4 pb-1">
                {memories.map((item, index) => (
                  <motion.button
                    key={item.id}
                    whileHover={{ y: -3, scale: 1.06 }}
                    onClick={() => {
                      setCurrentIdx(index);
                      setImageLoaded(false);
                    }}
                    className="shrink-0 overflow-hidden rounded-lg"
                    style={{
                      width: 58,
                      height: 58,
                      border: index === currentIdx ? `2px solid ${colors[0]}` : '2px solid rgba(255,255,255,0.14)',
                      opacity: index === currentIdx ? 1 : 0.5,
                      boxShadow: index === currentIdx ? `0 0 16px ${colors[0]}77` : 'none',
                    }}
                  >
                    <img src={item.thumbnail} alt={item.title} className="h-full w-full object-cover" />
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default MemoryLightbox;
