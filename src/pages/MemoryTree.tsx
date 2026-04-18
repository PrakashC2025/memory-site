import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, CalendarDays, MapPin, Sparkles, TreePine } from 'lucide-react';
import MemoryLightbox from '../components/MemoryLightbox';
import { useTheme } from '../context/ThemeContext';
import { SAMPLE_MEMORIES, groupMemoriesByYear } from '../data/memories';
import type { Memory, MemoryYear } from '../data/memories';

const YEAR_COLORS: Record<number, { primary: string; leaf: string }> = {
  2021: { primary: '#ffd166', leaf: '#36f1cd' },
  2022: { primary: '#00e5ff', leaf: '#8ee3ff' },
  2023: { primary: '#ff4ecd', leaf: '#b8ff6a' },
  2024: { primary: '#36f1cd', leaf: '#ff5fd2' },
};

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MiniTree: React.FC<{ year: MemoryYear; color: string; leaf: string }> = ({ year, color, leaf }) => {
  const branches = year.memories.slice(0, 8);

  return (
    <svg width="180" height="230" viewBox="0 0 180 230" className="overflow-visible">
      <defs>
        <filter id={`tree-glow-${year.year}`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={`trunk-${year.year}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.72" />
          <stop offset="100%" stopColor="#3a241c" />
        </linearGradient>
      </defs>

      <motion.path
        d="M90 214 C68 200 46 210 24 226 M90 214 C112 200 136 210 158 226"
        stroke={color}
        strokeWidth="3"
        strokeOpacity="0.45"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1 }}
      />
      <motion.path
        d="M90 214 C88 170 91 130 88 86 C87 62 92 44 90 22"
        stroke={`url(#trunk-${year.year})`}
        strokeWidth="13"
        strokeLinecap="round"
        fill="none"
        filter={`url(#tree-glow-${year.year})`}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
      />

      {branches.map((memory, index) => {
        const left = index % 2 === 0;
        const y = 62 + index * 17;
        const endX = left ? 35 - (index % 3) * 4 : 145 + (index % 3) * 4;
        const controlX = left ? 62 : 118;
        return (
          <g key={memory.id}>
            <motion.path
              d={`M90 ${y} C${controlX} ${y - 18}, ${controlX} ${y - 12}, ${endX} ${y - 26}`}
              stroke={color}
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.25 + index * 0.08, duration: 0.55 }}
            />
            <motion.circle
              cx={endX}
              cy={y - 26}
              r="10"
              fill={leaf}
              filter={`url(#tree-glow-${year.year})`}
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.2, 1] }}
              transition={{ delay: 0.55 + index * 0.08, type: 'spring', bounce: 0.4 }}
            />
          </g>
        );
      })}

      {[...Array(16)].map((_, index) => {
        const angle = (index / 16) * Math.PI * 2;
        const rx = 38 + (index % 4) * 7;
        const cx = 90 + Math.cos(angle) * rx;
        const cy = 42 + Math.sin(angle) * 24;
        return (
          <motion.ellipse
            key={index}
            cx={cx}
            cy={cy}
            rx={12 + (index % 3) * 3}
            ry={7 + (index % 2) * 2}
            fill={leaf}
            fillOpacity="0.78"
            filter={`url(#tree-glow-${year.year})`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2 + index * 0.025, type: 'spring' }}
          />
        );
      })}
    </svg>
  );
};

const MemoryTree: React.FC = () => {
  const { config } = useTheme();
  const [selectedYear, setSelectedYear] = useState<MemoryYear | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const years = groupMemoriesByYear(SAMPLE_MEMORIES);

  const yearColor = (year: number) => YEAR_COLORS[year] || { primary: config.primary, leaf: config.treeleaf };

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 pb-16 pt-24 md:px-8 md:pt-28">
      <motion.header initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }} className="mb-9 text-center">
        <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-[0.22em]" style={{ borderColor: config.primary + '40', color: config.accent }}>
          <TreePine size={14} />
          Memory Tree
        </div>
        <h1 className="neon-title text-4xl font-black md:text-6xl">A living archive of years.</h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/58 md:text-base">
          Choose a year to open its branches, then click any memory node for the full lightbox.
        </p>
      </motion.header>

      <AnimatePresence mode="wait">
        {!selectedYear ? (
          <motion.section key="forest" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {years.map((year, index) => {
              const colors = yearColor(year.year);
              return (
                <motion.button
                  key={year.year}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08, duration: 0.55 }}
                  whileHover={{ y: -8, scale: 1.015 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedYear(year)}
                  className="neon-card p-5 text-center"
                  style={{ borderColor: colors.primary + '44' }}
                >
                  <MiniTree year={year} color={colors.primary} leaf={colors.leaf} />
                  <div className="mt-2 text-3xl font-black" style={{ color: colors.primary, textShadow: `0 0 20px ${colors.primary}88` }}>
                    {year.year}
                  </div>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-white/44">{year.memories.length} memories</p>
                  <div className="mt-4 flex justify-center -space-x-2">
                    {year.memories.slice(0, 4).map(memory => (
                      <img key={memory.id} src={memory.thumbnail} alt="" className="h-9 w-9 rounded-lg border border-black object-cover" loading="lazy" />
                    ))}
                  </div>
                </motion.button>
              );
            })}
          </motion.section>
        ) : (
          <motion.section key="year" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }}>
            <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <button onClick={() => setSelectedYear(null)} className="neon-button flex w-fit items-center gap-2 px-4 py-2 text-sm font-bold" style={{ color: config.primary, borderColor: config.primary + '44' }}>
                <ArrowLeft size={16} />
                Back to Forest
              </button>
              <div className="text-left md:text-right">
                <h2 className="text-3xl font-black" style={{ color: yearColor(selectedYear.year).primary }}>
                  {selectedYear.year}
                </h2>
                <p className="text-sm text-white/48">{selectedYear.memories.length} memories across {selectedYear.months.length} months</p>
              </div>
            </div>

            <div className="neon-card overflow-hidden p-0">
              <div className="grid gap-0 lg:grid-cols-[360px_1fr]">
                <div className="flex items-center justify-center border-b p-6 lg:border-b-0 lg:border-r" style={{ borderColor: config.primary + '18' }}>
                  <MiniTree year={selectedYear} color={yearColor(selectedYear.year).primary} leaf={yearColor(selectedYear.year).leaf} />
                </div>

                <div className="p-4 md:p-6">
                  <div className="mb-5 flex flex-wrap gap-2">
                    {selectedYear.months.map(month => (
                      <span key={month.label} className="rounded-lg border px-3 py-1.5 text-xs font-bold" style={{ borderColor: yearColor(selectedYear.year).primary + '44', color: yearColor(selectedYear.year).primary, background: yearColor(selectedYear.year).primary + '12' }}>
                        {month.label} ({month.memories.length})
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {selectedYear.memories.map((memory, index) => (
                      <motion.button
                        key={memory.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.035 }}
                        whileHover={{ y: -4 }}
                        onClick={() => setSelectedMemory(memory)}
                        className="neon-card grid grid-cols-[86px_1fr] gap-3 p-3 text-left"
                        style={{ borderColor: yearColor(selectedYear.year).primary + '24' }}
                      >
                        <img src={memory.thumbnail} alt={memory.title} className="h-24 w-full rounded-lg object-cover" loading="lazy" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Sparkles size={13} style={{ color: yearColor(selectedYear.year).primary }} />
                            <p className="truncate text-sm font-black text-white">{memory.title}</p>
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/52">{memory.caption}</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/45">
                            <span className="flex items-center gap-1"><CalendarDays size={12} /> {MONTH_NAMES[memory.month]} {memory.year}</span>
                            {memory.location && <span className="flex items-center gap-1"><MapPin size={12} /> {memory.location}</span>}
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <MemoryLightbox memory={selectedMemory} memories={selectedYear?.memories || SAMPLE_MEMORIES} onClose={() => setSelectedMemory(null)} />
    </div>
  );
};

export default MemoryTree;
