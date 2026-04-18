import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Music, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';

const TRACKS = [
  { id: 'UfcAVejslrU', title: 'Memories - Nostalgic Piano', artist: 'Ambient Dreams' },
  { id: 'lFcSrYw2ARY', title: 'Study With Me - Lo-fi', artist: 'ChillHop Cafe' },
  { id: 'jfKfPfyJRdk', title: 'Lo-fi Hip Hop Mix', artist: 'Lofi Girl' },
  { id: '4xDzrJKXOOY', title: 'Synthwave Nostalgia', artist: 'Neon Nights' },
  { id: 'M-lMjMTa1cE', title: 'Beautiful Piano Pieces', artist: 'Peaceful Piano' },
];

const MusicPlayer: React.FC = () => {
  const { isMusicOn, setMusicOn, currentTrack, setCurrentTrack } = useUser();
  const { config } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [bars] = useState(() => Array.from({ length: 5 }, () => Math.random()));

  const track = TRACKS[currentTrack];
  const nextTrack = () => setCurrentTrack((currentTrack + 1) % TRACKS.length);
  const prevTrack = () => setCurrentTrack((currentTrack - 1 + TRACKS.length) % TRACKS.length);

  return (
    <div className="fixed bottom-4 right-4 z-50" style={{ fontFamily: 'Inter, sans-serif' }}>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.95 }} className="neon-card mb-3 min-w-[280px] p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: config.accent }}>
              <Music size={14} />
              Memory Music
            </div>
            {TRACKS.map((item, index) => (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentTrack(index);
                  setMusicOn(true);
                }}
                className="mb-1 flex w-full items-center gap-3 rounded-lg p-2 text-left transition-all"
                style={{
                  background: index === currentTrack ? config.primary + '1f' : 'transparent',
                  border: `1px solid ${index === currentTrack ? config.primary + '44' : 'transparent'}`,
                  color: index === currentTrack ? config.primary : '#ffffff99',
                }}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-lg border" style={{ borderColor: index === currentTrack ? config.primary + '55' : 'rgba(255,255,255,0.14)' }}>
                  {index === currentTrack && isMusicOn ? <Play size={12} /> : <Music size={12} />}
                </span>
                <span>
                  <span className="block text-xs font-bold">{item.title}</span>
                  <span className="block text-xs opacity-55">{item.artist}</span>
                </span>
              </button>
            ))}
            <div className="mt-3 border-t pt-3 text-center" style={{ borderColor: config.primary + '24' }}>
              <a href={`https://www.youtube.com/watch?v=${track.id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold opacity-70 transition-opacity hover:opacity-100" style={{ color: config.accent }}>
                Open current track in YouTube
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2">
        {isMusicOn && (
          <div className="flex h-7 items-end gap-0.5">
            {bars.map((bar, index) => (
              <motion.div
                key={index}
                animate={{ height: ['34%', '100%', '54%', '82%', '34%'] }}
                transition={{ duration: 0.75 + bar * 0.4, repeat: Infinity, delay: index * 0.1 }}
                className="w-1 rounded-full"
                style={{ background: config.primary, minHeight: 3, boxShadow: `0 0 10px ${config.primary}` }}
              />
            ))}
          </div>
        )}

        <div className="neon-card flex items-center gap-1 rounded-lg px-2 py-2" style={{ borderColor: config.primary + '44' }}>
          <button onClick={prevTrack} className="neon-button flex h-8 w-8 items-center justify-center" aria-label="Previous track">
            <SkipBack size={14} />
          </button>
          <button
            onClick={() => setMusicOn(!isMusicOn)}
            className="flex h-9 w-9 items-center justify-center rounded-lg font-bold"
            style={{
              background: isMusicOn ? `linear-gradient(135deg, ${config.primary}, ${config.secondary})` : 'rgba(255,255,255,0.1)',
              color: isMusicOn ? '#020406' : '#fff',
              boxShadow: isMusicOn ? `0 0 18px ${config.glow}` : 'none',
            }}
            aria-label={isMusicOn ? 'Pause music' : 'Play music'}
          >
            {isMusicOn ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button onClick={nextTrack} className="neon-button flex h-8 w-8 items-center justify-center" aria-label="Next track">
            <SkipForward size={14} />
          </button>
          <button onClick={() => setExpanded(v => !v)} className="neon-button ml-1 flex h-8 w-8 items-center justify-center" aria-label="Track list">
            <ChevronDown size={16} style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 180ms ease' }} />
          </button>
        </div>
      </div>

      {isMusicOn && (
        <iframe
          key={track.id}
          src={`https://www.youtube.com/embed/${track.id}?autoplay=1&loop=1&playlist=${track.id}&controls=0&showinfo=0&modestbranding=1`}
          allow="autoplay"
          className="absolute h-0 w-0 opacity-0"
          style={{ pointerEvents: 'none' }}
          title="music"
        />
      )}
    </div>
  );
};

export default MusicPlayer;
