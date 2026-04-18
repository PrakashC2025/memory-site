// ─────────────────────────────────────────────
//  Memoriam — Immersive Fullscreen Lightbox
// ─────────────────────────────────────────────

import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Heart, Pin, Download, Share2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { THEMES } from '../../data/themes';

const Lightbox: React.FC = () => {
  const { lightbox, closeLightbox, nextLightboxMedia, prevLightboxMedia,
    getMediaById, toggleFavorite, togglePin, activeTheme } = useApp();
  const theme = THEMES[activeTheme];

  const media = lightbox.mediaId ? getMediaById(lightbox.mediaId) : null;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!lightbox.isOpen) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') nextLightboxMedia();
    if (e.key === 'ArrowLeft') prevLightboxMedia();
  }, [lightbox.isOpen, closeLightbox, nextLightboxMedia, prevLightboxMedia]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (lightbox.isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [lightbox.isOpen]);

  const moodColors: Record<string, string> = {
    joy: '#ffd89b', nostalgia: '#e8a87c', friendship: '#a8d8ea',
    family: '#ffb7c5', travel: '#90e0d4', celebration: '#f6d365',
    farewell: '#b8c8ff', love: '#ffb7c5', adventure: '#c8e6c9', growth: '#fff3e0',
  };

  const currentIndex = media ? lightbox.mediaList.indexOf(media.id) : 0;
  const total = lightbox.mediaList.length;

  return (
    <AnimatePresence>
      {lightbox.isOpen && media && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.95)' }}
          onClick={closeLightbox}
        >
          {/* Backdrop blur glow */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at center, ${moodColors[media.mood || 'nostalgia']}08 0%, transparent 70%)`,
            }}
          />

          {/* Navigation arrows */}
          {total > 1 && (
            <>
              <motion.button
                className="absolute left-4 z-10 p-3 rounded-full glass border border-white/10 text-white/70 hover:text-white"
                whileHover={{ scale: 1.1, x: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={e => { e.stopPropagation(); prevLightboxMedia(); }}
              >
                <ChevronLeft size={24} />
              </motion.button>
              <motion.button
                className="absolute right-4 z-10 p-3 rounded-full glass border border-white/10 text-white/70 hover:text-white"
                whileHover={{ scale: 1.1, x: 2 }}
                whileTap={{ scale: 0.95 }}
                onClick={e => { e.stopPropagation(); nextLightboxMedia(); }}
              >
                <ChevronRight size={24} />
              </motion.button>
            </>
          )}

          {/* Close */}
          <motion.button
            className="absolute top-4 right-4 z-10 p-2 rounded-full glass border border-white/10 text-white/70 hover:text-white"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={closeLightbox}
          >
            <X size={20} />
          </motion.button>

          {/* Main content */}
          <motion.div
            key={media.id}
            initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.05, filter: 'blur(5px)' }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative max-w-5xl max-h-[85vh] w-full mx-4 flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Image/Video */}
            <div className="relative flex-1 flex items-center justify-center min-h-0">
              {media.type === 'video' ? (
                <video
                  src={media.url}
                  controls
                  autoPlay
                  className="max-h-[70vh] max-w-full rounded-2xl object-contain"
                  style={{ boxShadow: `0 0 60px ${moodColors[media.mood || 'nostalgia']}30` }}
                />
              ) : (
                <img
                  src={media.url}
                  alt={media.name}
                  className="max-h-[70vh] max-w-full rounded-2xl object-contain"
                  style={{ boxShadow: `0 0 80px ${moodColors[media.mood || 'nostalgia']}25, 0 30px 60px rgba(0,0,0,0.6)` }}
                />
              )}

              {/* Mood glow border */}
              <div
                className="absolute inset-0 rounded-2xl pointer-events-none"
                style={{ boxShadow: `inset 0 0 30px ${moodColors[media.mood || 'nostalgia']}10` }}
              />
            </div>

            {/* Info bar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-4 p-4 rounded-2xl glass border border-white/08"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {media.customCaption && (
                    <p className="text-base italic mb-1" style={{
                      fontFamily: 'var(--font-display)',
                      color: moodColors[media.mood || 'nostalgia'],
                    }}>
                      "{media.customCaption}"
                    </p>
                  )}
                  <p className="text-sm text-white/50 font-light">
                    {media.dateTaken.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                  {media.location?.label && (
                    <p className="text-xs text-white/30 mt-0.5">📍 {media.location.label}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {media.tags.slice(0, 4).map(tag => (
                      <span key={tag} className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: `${moodColors[media.mood || 'nostalgia']}15`, color: moodColors[media.mood || 'nostalgia'] }}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    className="p-2 rounded-full transition-all hover:scale-110"
                    style={{ color: media.isFavorite ? '#ff6b9d' : 'rgba(255,255,255,0.4)' }}
                    onClick={() => toggleFavorite(media.id)}
                  >
                    <Heart size={18} fill={media.isFavorite ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    className="p-2 rounded-full transition-all hover:scale-110"
                    style={{ color: media.isPinned ? theme.colors.primary : 'rgba(255,255,255,0.4)' }}
                    onClick={() => togglePin(media.id)}
                  >
                    <Pin size={18} />
                  </button>
                  <button className="p-2 rounded-full text-white/40 hover:text-white/70 transition-all hover:scale-110">
                    <Share2 size={18} />
                  </button>
                  <a
                    href={media.url}
                    download={media.name}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-full text-white/40 hover:text-white/70 transition-all hover:scale-110"
                    onClick={e => e.stopPropagation()}
                  >
                    <Download size={18} />
                  </a>
                </div>
              </div>

              {/* Counter */}
              {total > 1 && (
                <div className="text-center mt-2">
                  <span className="text-xs text-white/30">{currentIndex + 1} / {total}</span>
                </div>
              )}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Lightbox;
