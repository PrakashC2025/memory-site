import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Camera, Clock3, Film, FolderHeart, Heart, MapPin, Search, Sparkles, Star, TreePine } from 'lucide-react';
import DriveConnectPanel from '../components/DriveConnectPanel';
import DriveMediaPreview from '../components/DriveMediaPreview';
import DomeGallery from '../components/DomeGallery';
import MemoryLightbox from '../components/MemoryLightbox';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import { groupMemoriesByYear } from '../data/memories';
import type { Memory } from '../data/memories';
import { DRIVE_MEMORIES_UPDATED_EVENT, readDriveMemories } from '../services/driveLibrary';
import { buildRecapSections } from '../services/memoryOrganizer';

interface Props {
  onNavigate: (page: string) => void;
}

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
};

const optimizeDomeImageUrl = (url: string) =>
  url
    .replace(/=s\d+(-[cp])?$/i, '=s720')
    .replace(/sz=w\d+/i, 'sz=w720')
    .replace(/w=\d+/i, 'w=900')
    .replace(/q=\d+/i, 'q=82');

const Dashboard: React.FC<Props> = ({ onNavigate }) => {
  const { user } = useUser();
  const { config } = useTheme();
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [query, setQuery] = useState('');
  const [driveMemories, setDriveMemories] = useState<Memory[]>(() => readDriveMemories());

  useEffect(() => {
    const refreshDriveMemories = () => setDriveMemories(readDriveMemories());
    window.addEventListener(DRIVE_MEMORIES_UPDATED_EVENT, refreshDriveMemories);
    return () => window.removeEventListener(DRIVE_MEMORIES_UPDATED_EVENT, refreshDriveMemories);
  }, []);

  const years = groupMemoriesByYear(driveMemories);
  const favorites = driveMemories.filter(memory => memory.isFavorite);
  const places = new Set(driveMemories.map(memory => memory.location).filter(Boolean)).size;
  const domeImages = useMemo(
    () =>
      driveMemories
        .filter(memory => memory.type === 'photo' && (memory.thumbnail || memory.url))
        .slice(0, 48)
        .map(memory => ({
          src: optimizeDomeImageUrl(memory.thumbnail || memory.url),
          alt: memory.title,
        })),
    [driveMemories],
  );
  const recaps = useMemo(() => buildRecapSections(driveMemories), [driveMemories]);

  const filteredMemories = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return driveMemories;
    return driveMemories.filter(memory =>
      [memory.title, memory.caption, memory.location, memory.event, ...(memory.tags || [])]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle))
    );
  }, [driveMemories, query]);

  const quickModes = [
    { id: 'tree', label: 'Memory Tree', desc: 'Branch into every year and open each glowing photo node.', Icon: TreePine, color: '#36f1cd' },
    { id: 'timeline', label: 'Timeline Journey', desc: 'Scroll through your archive by year, month, and place.', Icon: Clock3, color: '#8ee3ff' },
    { id: 'events', label: 'Event Explorer', desc: 'See life chapters, recaps, and emotion clusters automatically.', Icon: FolderHeart, color: '#ffd166' },
    { id: 'story', label: 'Story Mode', desc: 'Turn the archive into a fullscreen cinematic playback.', Icon: Film, color: '#ff4ecd' },
  ];

  return (
    <div className="dashboard-page mx-auto max-w-7xl px-4 pb-16 pt-24 md:px-8 md:pt-28">
      <motion.section {...fadeUp} transition={{ duration: 0.65 }} className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="neon-card relative overflow-hidden p-5 md:p-8">
          <span className="page-hero-orb page-hero-orb-a" style={{ background: config.primary, opacity: 0.14 }} aria-hidden="true" />
          <span className="page-hero-orb page-hero-orb-b" style={{ background: config.secondary, opacity: 0.12 }} aria-hidden="true" />
          <div className="relative">
            <div className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em]" style={{ color: config.accent }}>
              <Sparkles size={15} />
              Personal Memory Archive
            </div>
            <h1 className="gt-amber text-4xl font-black leading-tight md:text-6xl">
              Welcome back, {user?.name?.split(' ')[0] || 'friend'}.
            </h1>
          <p className="relative mt-4 max-w-2xl text-sm leading-7 text-white/64 md:text-base">
            {driveMemories.length} Drive moments are ready. Search, open favorites, jump into the tree, or let story mode run.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => onNavigate('story')}
              className="flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-black text-black"
              style={{ background: `linear-gradient(135deg, ${config.primary}, ${config.secondary})`, boxShadow: `0 0 28px ${config.glow}` }}
            >
              <Film size={17} />
              Play Story
            </button>
            <button onClick={() => onNavigate('timeline')} className="neon-button flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold">
              <CalendarDays size={17} />
              View Timeline
            </button>
          </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Memories', value: driveMemories.length, Icon: Camera },
            { label: 'Favorites', value: favorites.length, Icon: Heart },
            { label: 'Years', value: years.length, Icon: CalendarDays },
            { label: 'Places', value: places, Icon: MapPin },
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + index * 0.05 }}
              whileHover={{ y: -4 }}
              className="neon-card p-4 md:p-5"
            >
              <stat.Icon size={18} style={{ color: config.primary }} />
              <div className="mt-4 text-3xl font-black" style={{ color: config.primary }}>{stat.value}</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/44">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      <motion.section {...fadeUp} transition={{ duration: 0.6, delay: 0.12 }} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {quickModes.map(mode => (
          <motion.button
            key={mode.id}
            onClick={() => onNavigate(mode.id)}
            whileHover={{ y: -5, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="neon-card p-5 text-left"
            style={{ borderColor: mode.color + '33' }}
          >
            <div className="flex items-center justify-between">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg border" style={{ borderColor: mode.color + '55', color: mode.color, background: mode.color + '14' }}>
                <mode.Icon size={20} />
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: mode.color }}>Open</span>
            </div>
            <h2 className="mt-5 text-lg font-black text-white">{mode.label}</h2>
            <p className="mt-2 text-sm leading-6 text-white/56">{mode.desc}</p>
          </motion.button>
        ))}
      </motion.section>

      <motion.section {...fadeUp} transition={{ duration: 0.6, delay: 0.18 }} className="mt-5">
        <DriveConnectPanel />
      </motion.section>

      {domeImages.length > 0 && (
        <motion.section {...fadeUp} transition={{ duration: 0.6, delay: 0.19 }} className="mt-8">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em]" style={{ color: config.primary }}>
                <Camera size={15} />
                Drive Photo Dome
              </div>
              <h2 className="text-2xl font-black text-white">Your photos, floating in one living gallery</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-white/52 md:text-right">
              Drag to rotate the dome, tap a photo to open it, then tap outside to return.
            </p>
          </div>
          <div
            className="neon-card overflow-hidden p-0"
            style={{ borderColor: `${config.primary}30`, boxShadow: `0 24px 90px rgba(0,0,0,.42), 0 0 48px ${config.glow}` }}
          >
            <div className="h-[430px] sm:h-[540px] lg:h-[680px]">
              <DomeGallery
                images={domeImages}
                fit={0.72}
                fitBasis="width"
                minRadius={420}
                maxRadius={980}
                padFactor={0.18}
                segments={25}
                overlayBlurColor="#030407"
                maxVerticalRotationDeg={6}
                dragSensitivity={18}
                dragDampening={0.82}
                openedImageWidth="min(92vw, 1180px)"
                openedImageHeight="min(78vh, 780px)"
                imageBorderRadius="22px"
                openedImageBorderRadius="24px"
                grayscale={false}
              />
            </div>
          </div>
        </motion.section>
      )}

      <motion.section {...fadeUp} transition={{ duration: 0.6, delay: 0.2 }} className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-white">Auto Recaps</h2>
            <p className="mt-1 text-sm text-white/48">Generated from dates, events, tags, and emotional density.</p>
          </div>
          <button onClick={() => onNavigate('events')} className="neon-button hidden px-4 py-2 text-xs font-black sm:block">
            Explore all
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {recaps.length === 0 && (
            <div className="neon-card p-6 text-center text-sm text-white/56 md:col-span-2 xl:col-span-4">
              Connect Google Drive in Memoriya to generate Drive recaps.
            </div>
          )}
          {recaps.map(recap => (
            <motion.button key={recap.id} whileHover={{ y: -5 }} onClick={() => setSelectedMemory(recap.memories[0])} className="neon-card overflow-hidden p-0 text-left">
              <DriveMediaPreview memory={recap.memories[0]} alt={recap.title} className="h-44 w-full object-cover" />
              <div className="p-4">
                <p className="text-base font-black text-white">{recap.title}</p>
                <p className="mt-1 text-xs leading-5 text-white/52">{recap.subtitle}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </motion.section>

      <motion.section {...fadeUp} transition={{ duration: 0.6, delay: 0.24 }} className="mt-8">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-black text-white">Memory Grid</h2>
            <p className="mt-1 text-sm text-white/48">{filteredMemories.length} visible memories</p>
          </div>
          <label className="relative block md:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={17} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search title, place, tag..."
              className="w-full rounded-lg py-3 pl-10 pr-4 text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${config.primary}24` }}
            />
          </label>
        </div>

        <div className="columns-2 gap-3 sm:columns-3 lg:columns-4">
          {filteredMemories.map((memory, index) => (
            <motion.button
              key={memory.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.025, duration: 0.42 }}
              whileHover={{ y: -4, scale: 1.015 }}
              onClick={() => setSelectedMemory(memory)}
              className="neon-card group mb-3 block w-full overflow-hidden p-0 text-left"
            >
              <DriveMediaPreview memory={memory} alt={memory.title} className="block aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]" />
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-black leading-tight text-white">{memory.title}</h3>
                  {memory.isFavorite && <Star className="shrink-0 fill-current" size={14} style={{ color: config.primary }} />}
                </div>
                <p className="mt-1 text-xs text-white/48">{memory.year}{memory.location ? ` - ${memory.location}` : ''}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </motion.section>

      <motion.section {...fadeUp} transition={{ duration: 0.6, delay: 0.3 }} className="mt-8">
        <h2 className="mb-4 text-2xl font-black text-white">Year Deck</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {years.map(year => (
            <motion.button key={year.year} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }} onClick={() => onNavigate('tree')} className="neon-card p-4 text-left">
              <div className="text-3xl font-black" style={{ color: config.primary }}>{year.year}</div>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/44">{year.memories.length} memories</p>
              <div className="mt-4 flex -space-x-2">
                {year.memories.slice(0, 4).map(memory => (
                  <DriveMediaPreview key={memory.id} memory={memory} alt="" className="h-9 w-9 rounded-lg border border-black object-cover" />
                ))}
              </div>
            </motion.button>
          ))}
        </div>
      </motion.section>

      <MemoryLightbox memory={selectedMemory} memories={driveMemories} onClose={() => setSelectedMemory(null)} />
    </div>
  );
};

export default Dashboard;
