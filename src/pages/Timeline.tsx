import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Heart, MapPin, Sparkles, Star } from 'lucide-react';
import MemoryLightbox from '../components/MemoryLightbox';
import DriveMediaPreview from '../components/DriveMediaPreview';
import { useTheme } from '../context/ThemeContext';
import PageHero from '../components/PageHero';
import { groupMemoriesByYear } from '../data/memories';
import type { Memory } from '../data/memories';
import { DRIVE_MEMORIES_UPDATED_EVENT, readDriveMemories } from '../services/driveLibrary';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const EMOTION_LABELS: Record<string, string> = {
  joy: 'Joy',
  nostalgia: 'Nostalgia',
  love: 'Love',
  adventure: 'Adventure',
  friendship: 'Friendship',
  celebration: 'Celebration',
  farewell: 'Farewell',
};

const YEAR_COLORS: Record<number, string> = {
  2021: '#ffd166',
  2022: '#00e5ff',
  2023: '#ff4ecd',
  2024: '#36f1cd',
};

const Timeline: React.FC = () => {
  const { config } = useTheme();
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [driveMemories, setDriveMemories] = useState<Memory[]>(() => readDriveMemories());

  useEffect(() => {
    const refresh = () => {
      const next = readDriveMemories();
      setDriveMemories(next);
      setSelectedMemory(current => current && next.some(memory => memory.id === current.id) ? current : null);
    };
    window.addEventListener(DRIVE_MEMORIES_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(DRIVE_MEMORIES_UPDATED_EVENT, refresh);
  }, []);
  const years = groupMemoriesByYear(driveMemories);
  const filteredYears = filterYear ? years.filter(year => year.year === filterYear) : years;

  return (
    <div className="timeline-page mx-auto min-h-screen max-w-6xl px-4 pb-16 pt-24 md:px-8 md:pt-28">
      <PageHero
        kicker="Timeline Journey"
        Icon={CalendarDays}
        gradient="gt-cyan"
        accent={config.primary}
        title={<>Every chapter, <span className="italic">still glowing.</span></>}
        subtitle="Browse memories by year and month. Open any card for the fullscreen neon lightbox."
      />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="mb-10 flex flex-wrap justify-center gap-2">
        <button
          onClick={() => setFilterYear(null)}
          className="neon-button px-4 py-2 text-sm font-bold"
          style={{
            background: filterYear === null ? `linear-gradient(135deg, ${config.primary}, ${config.secondary})` : undefined,
            color: filterYear === null ? '#020406' : config.primary,
            borderColor: config.primary + '55',
          }}
        >
          All Years
        </button>
        {years.map(year => {
          const color = YEAR_COLORS[year.year] || config.primary;
          return (
            <button
              key={year.year}
              onClick={() => setFilterYear(year.year)}
              className="neon-button px-4 py-2 text-sm font-bold"
              style={{
                background: filterYear === year.year ? color : undefined,
                color: filterYear === year.year ? '#020406' : color,
                borderColor: color + '55',
                boxShadow: filterYear === year.year ? `0 0 20px ${color}66` : undefined,
              }}
            >
              {year.year}
            </button>
          );
        })}
      </motion.div>

      {driveMemories.length === 0 && (
        <div className="neon-card mx-auto max-w-xl p-8 text-center">
          <Sparkles className="mx-auto mb-3" size={28} style={{ color: config.primary }} />
          <p className="font-black text-white">No Drive timeline yet.</p>
          <p className="mt-2 text-sm leading-6 text-white/56">Connect Google Drive in Memoriya to show your own photos and videos here.</p>
        </div>
      )}

      <div className="relative">
        <div
          className="absolute bottom-0 left-4 top-0 w-px md:left-1/2"
          style={{
            background: `linear-gradient(to bottom, transparent, ${config.primary}88, ${config.secondary}bb, ${config.accent}88, transparent)`,
            boxShadow: `0 0 20px ${config.glow}`,
            transform: 'translateX(-50%)',
          }}
        />

        {filteredYears.map((year, yearIndex) => {
          const yearColor = YEAR_COLORS[year.year] || config.primary;
          return (
            <section key={year.year} className="mb-12">
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: yearIndex * 0.08, type: 'spring', bounce: 0.35 }}
                className="relative mb-8 flex justify-start pl-11 md:justify-center md:pl-0"
              >
                <div className="neon-card z-10 flex items-center gap-3 px-5 py-3" style={{ borderColor: yearColor + '55', color: yearColor }}>
                  <Sparkles size={18} />
                  <span className="text-xl font-black">{year.year}</span>
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">{year.memories.length} memories</span>
                </div>
              </motion.div>

              {year.months.map((month, monthIndex) => (
                <div key={month.label} className="mb-8">
                  <motion.div
                    initial={{ opacity: 0, x: monthIndex % 2 === 0 ? -26 : 26 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: yearIndex * 0.08 + monthIndex * 0.04 }}
                    className="relative mb-4 flex items-center pl-11 md:justify-center md:pl-0"
                  >
                    <motion.span
                      animate={{ scale: [1, 1.28, 1], opacity: [0.72, 1, 0.72] }}
                      transition={{ duration: 2, repeat: Infinity, delay: monthIndex * 0.18 }}
                      className="absolute left-4 z-10 h-4 w-4 rounded-full md:left-1/2"
                      style={{ background: yearColor, boxShadow: `0 0 18px ${yearColor}`, transform: 'translateX(-50%)' }}
                    />
                    <span className="rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em]" style={{ color: yearColor, borderColor: yearColor + '44', background: yearColor + '12' }}>
                      {MONTH_NAMES[month.month]} {month.year}
                    </span>
                  </motion.div>

                  <div className="grid grid-cols-1 gap-4 pl-10 md:grid-cols-2 md:pl-0">
                    {month.memories.map((memory, memoryIndex) => {
                      const isLeft = (monthIndex + memoryIndex) % 2 === 0;
                      return (
                        <motion.button
                          key={memory.id}
                          initial={{ opacity: 0, x: isLeft ? -34 : 34 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: yearIndex * 0.08 + monthIndex * 0.04 + memoryIndex * 0.04, duration: 0.5 }}
                          whileHover={{ y: -5, scale: 1.01 }}
                          onClick={() => setSelectedMemory(memory)}
                          className={`neon-card group w-full overflow-hidden p-0 text-left ${isLeft ? 'md:mr-auto' : 'md:ml-auto'}`}
                          style={{ borderColor: yearColor + '33', maxWidth: '100%' }}
                        >
                          <div className="timeline-memory-media relative bg-black/35">
                            <DriveMediaPreview
                              memory={memory}
                              alt={memory.title}
                              className="timeline-memory-photo transition-transform duration-500 group-hover:scale-[1.018]"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/44 via-transparent to-transparent" />
                            {memory.isFavorite && (
                              <span className="absolute right-3 top-3 rounded-lg border bg-black/45 p-2" style={{ color: yearColor, borderColor: yearColor + '55' }}>
                                <Star size={14} className="fill-current" />
                              </span>
                            )}
                          </div>

                          <div className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <h3 className="text-base font-black leading-tight text-white">{memory.title}</h3>
                              <span className="rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: yearColor, borderColor: yearColor + '33' }}>
                                {EMOTION_LABELS[memory.emotion || 'joy']}
                              </span>
                            </div>
                            <p className="mt-2 text-sm italic leading-6 text-white/58">"{memory.caption}"</p>
                            <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/48">
                              <span className="flex items-center gap-1"><CalendarDays size={13} /> {MONTH_NAMES[memory.month]} {memory.year}</span>
                              {memory.location && <span className="flex items-center gap-1"><MapPin size={13} /> {memory.location}</span>}
                              {memory.isFavorite && <span className="flex items-center gap-1" style={{ color: yearColor }}><Heart size={13} /> Favorite</span>}
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          );
        })}

        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }} className="relative flex justify-center pl-11 md:pl-0">
          <div className="neon-card px-5 py-3 text-center text-sm italic text-white/56">And still the story continues...</div>
        </motion.div>
      </div>

      <MemoryLightbox memory={selectedMemory} memories={driveMemories} onClose={() => setSelectedMemory(null)} />
    </div>
  );
};

export default Timeline;
