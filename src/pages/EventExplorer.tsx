import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Film, Heart, Search, Sparkles, Star } from 'lucide-react';
import DriveMediaPreview from '../components/DriveMediaPreview';
import MemoryLightbox from '../components/MemoryLightbox';
import MemoryReel from '../components/MemoryReel';
import { useTheme } from '../context/ThemeContext';
import type { Memory } from '../data/memories';
import PageHero from '../components/PageHero';
import { readDriveMemories } from '../services/driveLibrary';
import { buildRecapSections, getMemoryHeatmap, groupMemoriesByEvent } from '../services/memoryOrganizer';

const EMOTION_COLORS: Record<string, string> = {
  joy: '#ffd166',
  nostalgia: '#8ee3ff',
  love: '#ff5fd2',
  adventure: '#36f1cd',
  friendship: '#7cf7ff',
  celebration: '#ff4ecd',
  farewell: '#d8f3ff',
};

const EventExplorer: React.FC = () => {
  const { config } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [reelConfig, setReelConfig] = useState<{ memories: Memory[]; title: { line: string; big: string } } | null>(null);
  const driveMemories = useMemo(() => readDriveMemories(), []);

  const events = useMemo(() => groupMemoriesByEvent(driveMemories), [driveMemories]);
  const recaps = useMemo(() => buildRecapSections(driveMemories), [driveMemories]);
  const heatmap = useMemo(() => getMemoryHeatmap(driveMemories), [driveMemories]);

  const filteredEvents = events.filter(event => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [event.title, event.emotion, event.year, ...event.memories.flatMap(memory => memory.tags || [])]
      .some(value => String(value).toLowerCase().includes(needle));
  });

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 pb-16 pt-24 md:px-8 md:pt-28">
      <PageHero
        kicker="Event Explorer"
        Icon={Sparkles}
        gradient="gt-rose"
        accent={config.primary}
        title={<>Chapters your heart <span className="italic">remembers.</span></>}
        subtitle="Auto-detected moments become chapters, recaps, and emotional clusters instead of a plain gallery."
      />

      {driveMemories.length === 0 && (
        <div className="neon-card mx-auto mb-8 max-w-xl p-8 text-center">
          <Sparkles className="mx-auto mb-3" size={28} style={{ color: config.primary }} />
          <p className="font-black text-white">No Drive events yet.</p>
          <p className="mt-2 text-sm leading-6 text-white/56">Connect Google Drive in Memoriya to build events from your own media.</p>
        </div>
      )}

      <section className="mb-6 grid gap-3 md:grid-cols-[1fr_340px]">
        <div className="neon-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-white">Memory Heatmap</h2>
            <span className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: config.accent }}>Density</span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {heatmap.map(item => (
              <div key={item.year} className="rounded-lg border p-4" style={{ borderColor: config.primary + '24', background: `linear-gradient(135deg, ${config.primary}${Math.round(item.intensity * 55).toString(16).padStart(2, '0')}, rgba(255,255,255,0.035))` }}>
                <div className="text-3xl font-black" style={{ color: config.primary }}>{item.year}</div>
                <p className="mt-1 text-xs text-white/50">{item.count} memories captured</p>
              </div>
            ))}
          </div>
        </div>

        <label className="neon-card flex items-center gap-3 p-4">
          <Search size={18} style={{ color: config.primary }} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search event, emotion, tag..."
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          />
        </label>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-black text-white">Auto Recaps</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {recaps.map(recap => (
            <motion.button
              key={recap.id}
              whileHover={{ y: -5, scale: 1.01 }}
              onClick={() => setSelectedMemory(recap.memories[0])}
              className="neon-card overflow-hidden p-0 text-left"
            >
              <div className="relative h-40">
                <DriveMediaPreview memory={recap.memories[0]} alt={recap.title} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3">
                  <p className="text-lg font-black text-white">{recap.title}</p>
                  <p className="mt-1 text-xs leading-5 text-white/62">{recap.subtitle}</p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-black text-white">Life Chapters</h2>
        {filteredEvents.length === 0 ? (
          <div className="neon-card p-8 text-center">
            <Sparkles className="mx-auto mb-3" size={28} style={{ color: config.primary }} />
            <p className="font-black text-white">No chapter matches that search.</p>
            <p className="mt-2 text-sm text-white/52">Try a year, emotion, tag, or event name.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredEvents.map((event, index) => {
              const color = EMOTION_COLORS[event.emotion] || config.primary;
              return (
                <motion.article
                  key={event.id}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className="neon-card overflow-hidden p-0"
                  style={{ borderColor: color + '33' }}
                >
                  <div className="grid md:grid-cols-[190px_1fr]">
                    <button onClick={() => setSelectedMemory(event.cover)} className="relative min-h-[190px] overflow-hidden text-left">
                      <DriveMediaPreview memory={event.cover} alt={event.title} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                      {event.cover.type === 'video' && <Film className="absolute right-3 top-3" size={18} style={{ color }} />}
                    </button>
                    <div className="p-5">
                      <div className="mb-3 flex flex-wrap gap-2 text-xs">
                        <span className="flex items-center gap-1 rounded-lg border px-2 py-1" style={{ color, borderColor: color + '44' }}>
                          <CalendarDays size={12} />
                          {event.year} / {event.monthRange}
                        </span>
                        <span className="flex items-center gap-1 rounded-lg border px-2 py-1 capitalize" style={{ color, borderColor: color + '44' }}>
                          <Heart size={12} />
                          {event.emotion}
                        </span>
                      </div>
                      <h3 className="text-xl font-black text-white">{event.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-white/56">{event.memories.length} memories gathered into this chapter.</p>
                      <button
                        type="button"
                        onClick={() => setReelConfig({ memories: event.memories, title: { line: event.title, big: String(event.year) } })}
                        className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-2 text-xs font-black text-white"
                      >
                        <Film size={14} /> Play story
                      </button>
                      <div className="mt-4 flex -space-x-2">
                        {event.memories.slice(0, 5).map(memory => (
                          <button key={memory.id} onClick={() => setSelectedMemory(memory)} className="h-10 w-10 overflow-hidden rounded-lg border border-black">
                            <DriveMediaPreview memory={memory} alt={memory.title} className="h-full w-full object-cover" />
                          </button>
                        ))}
                        {event.memories.some(memory => memory.isFavorite) && (
                          <span className="ml-3 flex items-center gap-1 text-xs font-bold" style={{ color }}>
                            <Star size={13} className="fill-current" />
                            Highlight
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </section>

      <MemoryLightbox memory={selectedMemory} memories={selectedMemory ? driveMemories : []} onClose={() => setSelectedMemory(null)} />
      {reelConfig && <MemoryReel memories={reelConfig.memories} title={reelConfig.title} onClose={() => setReelConfig(null)} />}
    </div>
  );
};

export default EventExplorer;
