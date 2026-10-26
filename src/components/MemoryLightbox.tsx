import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  Eye,
  EyeOff,
  Heart,
  Image as ImageIcon,
  ListPlus,
  MapPin,
  Maximize2,
  Minimize2,
  Music,
  Pause,
  Play,
  RotateCw,
  Search,
  Share2,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Memory } from '../data/memories';
import { googleDriveService } from '../services/googleDriveService';
import { readCachedDriveMedia } from '../services/driveCache';
import { saveDriveAccessToken } from '../services/driveLibrary';
import { searchOpenSourceMusic } from '../services/openSourceMusic';
import { getStoryMediaCacheKey, readCachedStoryMedia, writeCachedStoryMedia } from '../services/storyMediaCache';
import { withMediaFetch } from '../utils/mediaQueue';

export type SlideshowTransition =
  | 'crossfade'
  | 'ken-burns'
  | 'parallax'
  | 'blur-dissolve'
  | 'film-fade'
  | 'scrapbook'
  | 'glow-pulse'
  | 'dust-reveal'
  | 'branch-guided'
  | 'vertical-reveal'
  | 'dream-dissolve'
  | 'prism-wipe'
  | 'flash-burn'
  | 'cinema-zoom'
  | 'split-scan';

export type SlideshowTemplate =
  | 'auto'
  | 'wedding'
  | 'kids-birthday'
  | 'birthday'
  | 'baby'
  | 'travel'
  | 'college'
  | 'family'
  | 'nostalgia';

export type MotionIntensity = 'soft' | 'premium' | 'dramatic';
export type SpeedMode = 'slow' | 'balanced' | 'fast';
export type FitMode = 'contain' | 'cover' | 'smart';
type StoryEditStyle = 'auto' | 'marriage' | 'nature' | 'family' | 'birthday' | 'cinematic';

interface Props {
  memory: Memory | null;
  memories?: Memory[];
  onClose: () => void;
  autoplay?: boolean;
  mode?: 'viewer' | 'tree' | 'story' | 'album';
  template?: SlideshowTemplate;
  transitionStyle?: SlideshowTransition;
  speed?: SpeedMode;
  intensity?: MotionIntensity;
  showTreeOverlay?: boolean;
  onIndexChange?: (memory: Memory, index: number) => void;
  onAutoplayChange?: (playing: boolean) => void;
  onImportLocalMedia?: () => void;
}

const EMPTY_MEMORIES: Memory[] = [];
const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const SPEED_MS: Record<SpeedMode, number> = {
  slow: 7800,
  balanced: 5600,
  fast: 3600,
};

const TEMPLATE_STYLES: Record<Exclude<SlideshowTemplate, 'auto'>, {
  label: string;
  colors: string[];
  defaultTransition: SlideshowTransition;
  frame: string;
  particle: string;
}> = {
  wedding: {
    label: 'Wedding Romance',
    colors: ['#ffd166', '#ff8fb7', '#fff0b8', '#cda45e'],
    defaultTransition: 'dream-dissolve',
    frame: 'romantic-glow',
    particle: 'petals',
  },
  'kids-birthday': {
    label: 'Kids Birthday',
    colors: ['#ffd166', '#7cf7ff', '#ff5fd2', '#b8ff6a'],
    defaultTransition: 'glow-pulse',
    frame: 'celebration-frame',
    particle: 'confetti',
  },
  birthday: {
    label: 'Premium Birthday',
    colors: ['#ffcf5f', '#ff4ecd', '#8ee3ff', '#fff4c7'],
    defaultTransition: 'film-fade',
    frame: 'luxury-matte',
    particle: 'sparkles',
  },
  baby: {
    label: 'Baby Memories',
    colors: ['#ffd6e7', '#bfe9ff', '#fff4c7', '#d9c7ff'],
    defaultTransition: 'dust-reveal',
    frame: 'soft-pastel',
    particle: 'stars',
  },
  travel: {
    label: 'Travel Journey',
    colors: ['#36f1cd', '#8ee3ff', '#ffd166', '#9bffec'],
    defaultTransition: 'ken-burns',
    frame: 'postcard',
    particle: 'map-light',
  },
  college: {
    label: 'College Friends',
    colors: ['#7cf7ff', '#ffcf5f', '#ff8f70', '#b8ff6a'],
    defaultTransition: 'scrapbook',
    frame: 'film-strip',
    particle: 'film-grain',
  },
  family: {
    label: 'Family Archive',
    colors: ['#ffd166', '#8ee3ff', '#ffb7c5', '#9bffec'],
    defaultTransition: 'crossfade',
    frame: 'warm-matte',
    particle: 'tree-dust',
  },
  nostalgia: {
    label: 'Nostalgia',
    colors: ['#8ee3ff', '#d8f3ff', '#ffcf5f', '#ff5fd2'],
    defaultTransition: 'blur-dissolve',
    frame: 'classic-elegant',
    particle: 'dust',
  },
};

const detectTemplate = (memory: Memory | null, explicit: SlideshowTemplate = 'auto'): Exclude<SlideshowTemplate, 'auto'> => {
  if (explicit !== 'auto') return explicit;
  const text = [memory?.title, memory?.caption, memory?.event, memory?.emotion, ...(memory?.tags || [])].filter(Boolean).join(' ').toLowerCase();
  if (text.includes('wedding') || text.includes('marriage') || text.includes('love')) return 'wedding';
  if (text.includes('kid') || text.includes('child') || text.includes('baby')) return 'baby';
  if (text.includes('birthday') && (text.includes('kid') || text.includes('child'))) return 'kids-birthday';
  if (text.includes('birthday') || text.includes('celebration') || text.includes('diwali')) return 'birthday';
  if (text.includes('travel') || text.includes('trip') || text.includes('goa') || text.includes('mountain') || text.includes('beach')) return 'travel';
  if (text.includes('college') || text.includes('friends') || text.includes('campus') || text.includes('farewell')) return 'college';
  if (text.includes('family') || text.includes('reunion')) return 'family';
  return 'nostalgia';
};

const transitionVariants: Record<SlideshowTransition, any> = {
  crossfade: {
    initial: { opacity: 0, scale: 1.02 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.985 },
  },
  'ken-burns': {
    initial: { opacity: 0, scale: 1.12, x: 22 },
    animate: { opacity: 1, scale: 1, x: 0 },
    exit: { opacity: 0, scale: 1.08, x: -26 },
  },
  parallax: {
    initial: { opacity: 0, scale: 0.94, rotateY: 10 },
    animate: { opacity: 1, scale: 1, rotateY: 0 },
    exit: { opacity: 0, scale: 1.04, rotateY: -10 },
  },
  'blur-dissolve': {
    initial: { opacity: 0, scale: 1.03, filter: 'blur(18px)' },
    animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
    exit: { opacity: 0, scale: 0.99, filter: 'blur(14px)' },
  },
  'film-fade': {
    initial: { opacity: 0, y: 24, filter: 'contrast(1.35) brightness(0.82)' },
    animate: { opacity: 1, y: 0, filter: 'contrast(1) brightness(1)' },
    exit: { opacity: 0, y: -16, filter: 'contrast(1.2) brightness(0.72)' },
  },
  scrapbook: {
    initial: { opacity: 0, scale: 0.86, rotate: -3 },
    animate: { opacity: 1, scale: 1, rotate: 0 },
    exit: { opacity: 0, scale: 0.92, rotate: 2.5 },
  },
  'glow-pulse': {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: [0.9, 1.035, 1] },
    exit: { opacity: 0, scale: 1.08 },
  },
  'dust-reveal': {
    initial: { opacity: 0, clipPath: 'circle(18% at 50% 50%)', filter: 'blur(12px)' },
    animate: { opacity: 1, clipPath: 'circle(78% at 50% 50%)', filter: 'blur(0px)' },
    exit: { opacity: 0, clipPath: 'circle(28% at 50% 50%)', filter: 'blur(14px)' },
  },
  'branch-guided': {
    initial: { opacity: 0, x: 72, scale: 0.96 },
    animate: { opacity: 1, x: 0, scale: 1 },
    exit: { opacity: 0, x: -72, scale: 0.98 },
  },
  'vertical-reveal': {
    initial: { opacity: 0, y: 82, scale: 1.02 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -74, scale: 1.01 },
  },
  'dream-dissolve': {
    initial: { opacity: 0, scale: 1.08, filter: 'blur(24px) saturate(1.4)' },
    animate: { opacity: 1, scale: 1, filter: 'blur(0px) saturate(1)' },
    exit: { opacity: 0, scale: 1.04, filter: 'blur(18px) saturate(1.3)' },
  },
  'prism-wipe': {
    initial: { opacity: 0, x: 96, scale: 1.08, rotateZ: 1.8, filter: 'hue-rotate(36deg) saturate(1.8) blur(8px)' },
    animate: { opacity: 1, x: 0, scale: 1, rotateZ: 0, filter: 'hue-rotate(0deg) saturate(1) blur(0px)' },
    exit: { opacity: 0, x: -72, scale: 1.04, rotateZ: -1.2, filter: 'hue-rotate(-28deg) saturate(1.5) blur(8px)' },
  },
  'flash-burn': {
    initial: { opacity: 0, scale: 1.16, filter: 'brightness(2.3) contrast(1.45) saturate(1.7)' },
    animate: { opacity: 1, scale: 1, filter: 'brightness(1) contrast(1) saturate(1)' },
    exit: { opacity: 0, scale: 0.96, filter: 'brightness(0.45) contrast(1.8) saturate(0.72)' },
  },
  'cinema-zoom': {
    initial: { opacity: 0, scale: 0.72, rotateX: 9, y: 72, filter: 'blur(10px) brightness(0.72)' },
    animate: { opacity: 1, scale: 1, rotateX: 0, y: 0, filter: 'blur(0px) brightness(1)' },
    exit: { opacity: 0, scale: 1.28, rotateX: -7, y: -54, filter: 'blur(12px) brightness(0.82)' },
  },
  'split-scan': {
    initial: { opacity: 0, clipPath: 'polygon(0 0, 48% 0, 42% 100%, 0 100%)', x: -64, filter: 'contrast(1.6) saturate(1.25)' },
    animate: { opacity: 1, clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)', x: 0, filter: 'contrast(1) saturate(1)' },
    exit: { opacity: 0, clipPath: 'polygon(58% 0, 100% 0, 100% 100%, 52% 100%)', x: 64, filter: 'contrast(1.4) saturate(0.9)' },
  },
};

const STORY_TRANSITIONS: SlideshowTransition[] = [
  'dream-dissolve',
  'film-fade',
  'ken-burns',
  'blur-dissolve',
  'vertical-reveal',
  'scrapbook',
  'glow-pulse',
];

const transitionOptions: SlideshowTransition[] = [
  'crossfade',
  'ken-burns',
  'parallax',
  'blur-dissolve',
  'film-fade',
  'scrapbook',
  'glow-pulse',
  'dust-reveal',
  'branch-guided',
  'vertical-reveal',
  'dream-dissolve',
  'prism-wipe',
  'flash-burn',
  'cinema-zoom',
  'split-scan',
];

const templateOptions: Exclude<SlideshowTemplate, 'auto'>[] = ['wedding', 'kids-birthday', 'birthday', 'baby', 'travel', 'college', 'family', 'nostalgia'];

const labelize = (value: string) => value.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

const isTypingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
};

const STORY_EDIT_STYLES: Array<{ id: StoryEditStyle; label: string; template?: Exclude<SlideshowTemplate, 'auto'>; speed: SpeedMode; intensity: MotionIntensity }> = [
  { id: 'auto', label: 'Auto', speed: 'slow', intensity: 'premium' },
  { id: 'marriage', label: 'Marriage', template: 'wedding', speed: 'slow', intensity: 'premium' },
  { id: 'nature', label: 'Nature', template: 'travel', speed: 'slow', intensity: 'soft' },
  { id: 'family', label: 'Family', template: 'family', speed: 'slow', intensity: 'soft' },
  { id: 'birthday', label: 'Birthday', template: 'birthday', speed: 'balanced', intensity: 'dramatic' },
  { id: 'cinematic', label: 'Cinematic', template: 'nostalgia', speed: 'balanced', intensity: 'premium' },
];

const EDIT_STYLE_TRANSITIONS: Record<StoryEditStyle, SlideshowTransition[]> = {
  auto: STORY_TRANSITIONS,
  marriage: ['dream-dissolve', 'film-fade', 'blur-dissolve', 'ken-burns'],
  nature: ['ken-burns', 'parallax', 'dream-dissolve', 'vertical-reveal'],
  family: ['film-fade', 'crossfade', 'scrapbook', 'dream-dissolve'],
  birthday: ['glow-pulse', 'cinema-zoom', 'flash-burn', 'prism-wipe'],
  cinematic: ['cinema-zoom', 'split-scan', 'film-fade', 'dream-dissolve'],
};

const isVideoMemory = (memory: Memory) => memory.type === 'video';

const getDecorativeMemorySrc = (memory: Memory) => memory.driveFileId ? '' : memory.thumbnail || (!isVideoMemory(memory) ? memory.url : '');

const canFetchDriveMedia = (memory: Memory) => Boolean(memory.driveFileId && memory.authToken);

const STORY_MUSIC_SUGGESTIONS = [
  { label: '96 Movie', query: '96 movie song' },
  { label: 'Romantic', query: 'romantic instrumental song' },
  { label: 'Birthday', query: 'happy birthday celebration song' },
  { label: 'Travel', query: 'travel vlog cinematic music' },
  { label: 'Family', query: 'family memories emotional music' },
];

type StoryMusicTrack = {
  id: string;
  title: string;
  artist: string;
  query: string;
  videoId?: string;
  previewUrl?: string;
  externalUrl?: string;
};

const NINETY_SIX_TRACKS: StoryMusicTrack[] = [
  { id: '96-life-of-ram', title: 'The Life Of Ram', artist: 'Pradeep Kumar', query: '96 The Life Of Ram Pradeep Kumar Think Music', videoId: 'SwRSS5BT3V4' },
  { id: '96-yean', title: 'Yean', artist: 'Gowri T.P.', query: '96 Yean Gowri TP Govind Vasantha' },
  { id: '96-vasantha-kaalangal', title: 'Vasantha Kaalangal', artist: 'Chinmayi Sripaada', query: '96 Vasantha Kaalangal Think Music', videoId: '622tpLBfntI' },
  { id: '96-thaabangale', title: 'Thaabangale', artist: 'Chinmayi Sripaada, Pradeep Kumar', query: '96 Thaabangale Think Music', videoId: 'Hpf5zGodMUk' },
  { id: '96-iravingu-theevai', title: 'Iravingu Theevai', artist: 'Chinmayi Sripaada, Pradeep Kumar', query: '96 Iravingu Theevai Think Music', videoId: 'b3-lyX9O6kY' },
  { id: '96-kaathalae-v1', title: 'Kaathalae Kaathalae', artist: 'Chinmayi, Govind Vasantha', query: '96 Kaathalae Kaathalae Think Music', videoId: 'vukt6c__-mw' },
  { id: '96-anthaathi', title: 'Anthaathi', artist: 'Chinmayi, Govind Vasantha, Bhadra Rajin', query: '96 Anthaathi Think Music', videoId: 'BkVBlhChVVk' },
  { id: '96-kaathalae-v2', title: 'Kaathalae Kaathalae Version 2', artist: 'Kalyani Menon, Chinmayi, Govind Vasantha', query: '96 Kaathalae Kaathalae Kalyani Menon' },
];

const getYouTubeVideoId = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /^[A-Za-z0-9_-]{11}$/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return match[1] || match[0];
  }
  return '';
};

const getDirectAudioUrl = (value: string) => {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return '';
  try {
    const url = new URL(trimmed);
    return /\.(mp3|m4a|aac|ogg|oga|wav|webm)$/i.test(url.pathname) ? trimmed : '';
  } catch {
    return '';
  }
};

const buildYouTubeAudioSrc = (track: StoryMusicTrack) => {
  const origin = typeof window === 'undefined' ? '' : `&origin=${encodeURIComponent(window.location.origin)}`;
  if (track.videoId) {
    return `https://www.youtube.com/embed/${track.videoId}?autoplay=1&controls=1&modestbranding=1&rel=0&playsinline=1&enablejsapi=1${origin}`;
  }
  return '';
};

const buildYouTubePlaylistSrc = (tracks: StoryMusicTrack[], startIndex: number) => {
  const current = tracks[startIndex];
  if (!current?.videoId) return current ? buildYouTubeAudioSrc(current) : '';
  const origin = typeof window === 'undefined' ? '' : `&origin=${encodeURIComponent(window.location.origin)}`;
  const remainingVideoIds = tracks
    .slice(startIndex + 1)
    .map(track => track.videoId)
    .filter(Boolean)
    .join(',');
  const playlist = remainingVideoIds ? `&playlist=${encodeURIComponent(remainingVideoIds)}` : '';
  return `https://www.youtube.com/embed/${current.videoId}?autoplay=1&controls=1&modestbranding=1&rel=0&playsinline=1&enablejsapi=1${playlist}${origin}`;
};

const buildStoryMusicResults = (value: string): StoryMusicTrack[] => {
  const query = value.trim();
  if (!query) return [];
  const normalized = query.toLowerCase();
  const directAudioUrl = getDirectAudioUrl(query);
  if (directAudioUrl) {
    const fileName = decodeURIComponent(directAudioUrl.split('/').pop() || 'Online audio');
    return [{
      id: `audio-url-${directAudioUrl}`,
      title: fileName.replace(/\?.*$/, ''),
      artist: 'Direct audio link',
      query,
      previewUrl: directAudioUrl,
    }];
  }
  if (normalized.includes('96') || normalized.includes('life of ram') || normalized.includes('kaathalae')) {
    return NINETY_SIX_TRACKS;
  }
  return [
    {
      id: `youtube-${normalized}-best`,
      title: query,
      artist: getYouTubeVideoId(query) ? 'YouTube playable link' : 'Open online audio search',
      query,
      videoId: getYouTubeVideoId(query) || undefined,
      externalUrl: `https://archive.org/search?query=${encodeURIComponent(`${query} audio`)}`,
    },
    { id: `online-${normalized}-archive`, title: `${query} audio`, artist: 'Open Internet Archive search', query: `${query} audio`, externalUrl: `https://archive.org/search?query=${encodeURIComponent(`${query} audio`)}` },
    { id: `online-${normalized}-freemusic`, title: `${query} free music`, artist: 'Open free music search', query: `${query} free music`, externalUrl: `https://freemusicarchive.org/search?adv=1&quicksearch=${encodeURIComponent(query)}` },
    { id: `online-${normalized}-direct`, title: `${query} mp3 link`, artist: 'Find a direct playable audio link', query: `${query} mp3`, externalUrl: `https://www.google.com/search?q=${encodeURIComponent(`${query} mp3 direct audio`)}` },
  ];
};

const mediaExtension = (memory: Memory, mimeType = '') => {
  const normalized = mimeType.toLowerCase();
  const known: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',
  };
  return known[normalized]
    || (normalized.startsWith('video/') ? 'mp4' : memory.type === 'video' ? 'mp4' : 'jpg');
};

const MemoryLightbox: React.FC<Props> = ({
  memory,
  memories = EMPTY_MEMORIES,
  onClose,
  autoplay = false,
  mode = 'viewer',
  template = 'auto',
  transitionStyle,
  speed = 'balanced',
  intensity = 'premium',
  showTreeOverlay = false,
  onIndexChange,
  onAutoplayChange,
  onImportLocalMedia,
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [previewSrc, setPreviewSrc] = useState('');
  const [mediaSrc, setMediaSrc] = useState('');
  const [driveObjectSrc, setDriveObjectSrc] = useState('');
  const [mediaFailed, setMediaFailed] = useState(false);
  const [highResReady, setHighResReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [progress, setProgress] = useState(0);
  const [fitMode, setFitMode] = useState<FitMode>(() => mode === 'story' ? 'smart' : 'contain');
  const [captionsOn, setCaptionsOn] = useState(true);
  const [treeOverlayOn, setTreeOverlayOn] = useState(showTreeOverlay);
  const [muted, setMuted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [musicQuery, setMusicQuery] = useState('');
  const [youtubeSrc, setYoutubeSrc] = useState('');
  const [audioSrc, setAudioSrc] = useState('');
  const [youtubeLabel, setYoutubeLabel] = useState('');
  const [localAudioName, setLocalAudioName] = useState('');
  const [musicResults, setMusicResults] = useState<StoryMusicTrack[]>([]);
  const [activeMusicId, setActiveMusicId] = useState('');
  const [storyPlaylist, setStoryPlaylist] = useState<StoryMusicTrack[]>([]);
  const [storyPlaylistIndex, setStoryPlaylistIndex] = useState(-1);
  const [storyMusicPlaying, setStoryMusicPlaying] = useState(false);
  const [musicSearching, setMusicSearching] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState<SpeedMode>(speed);
  const [currentIntensity, setCurrentIntensity] = useState<MotionIntensity>(intensity);
  const [selectedTransition, setSelectedTransition] = useState<SlideshowTransition | null>(transitionStyle || null);
  const [selectedTemplate, setSelectedTemplate] = useState<Exclude<SlideshowTemplate, 'auto'> | null>(null);
  const [editStyle, setEditStyle] = useState<StoryEditStyle>('auto');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set(memories.filter(item => item.isFavorite).map(item => item.id)));
  const [toast, setToast] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const frameRef = useRef<number>(0);
  const chromeTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const pausedAtRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const localAudioInputRef = useRef<HTMLInputElement>(null);
  const storyAudioElementRef = useRef<HTMLAudioElement>(null);
  const storyYouTubeFrameRef = useRef<HTMLIFrameElement>(null);
  const localAudioObjectRef = useRef<string[]>([]);
  const audioRef = useRef<{
    context: AudioContext;
    gain: GainNode;
    oscillators: OscillatorNode[];
  } | null>(null);

  const sequence = useMemo(() => (memories.length ? memories : memory ? [memory] : EMPTY_MEMORIES), [memories, memory]);

  useEffect(() => {
    if (!memory || !sequence.length) return;
    const idx = sequence.findIndex(item => item.id === memory.id);
    setCurrentIdx(idx >= 0 ? idx : 0);
    setImageLoaded(false);
    setProgress(0);
    setZoom(1);
    setRotation(0);
  }, [memory?.id]);

  useEffect(() => {
    setIsPlaying(autoplay);
  }, [autoplay]);

  const current = sequence[currentIdx] || memory;
  const resolvedTemplate = useMemo(() => selectedTemplate || detectTemplate(current || null, template), [current, selectedTemplate, template]);
  const templateStyle = TEMPLATE_STYLES[resolvedTemplate];
  const resolvedEditStyle: StoryEditStyle = editStyle === 'auto'
    ? resolvedTemplate === 'wedding'
      ? 'marriage'
      : resolvedTemplate === 'travel'
        ? 'nature'
        : resolvedTemplate === 'family' || resolvedTemplate === 'baby'
          ? 'family'
          : resolvedTemplate === 'birthday' || resolvedTemplate === 'kids-birthday'
            ? 'birthday'
            : 'cinematic'
    : editStyle;
  const editTransitions = EDIT_STYLE_TRANSITIONS[resolvedEditStyle] || STORY_TRANSITIONS;
  const storyAutoTransition = editTransitions[currentIdx % editTransitions.length];
  const activeTransition = selectedTransition || transitionStyle || (mode === 'story' ? storyAutoTransition : templateStyle.defaultTransition);
  const colors = templateStyle.colors;
  const duration = SPEED_MS[currentSpeed];
  const transitionDuration = mode === 'story' ? (currentIntensity === 'dramatic' ? 1.28 : currentIntensity === 'soft' ? 0.82 : 1.02) : currentIntensity === 'dramatic' ? 0.95 : currentIntensity === 'soft' ? 0.48 : 0.68;
  const hasStoryMusic = mode === 'story' && Boolean(youtubeSrc || audioSrc);
  const storyMusicSuggestions = useMemo(() => {
    const text = sequence
      .slice(0, 18)
      .flatMap(item => [item.title, item.caption, item.event, item.emotion, ...(item.tags || [])])
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (/wedding|marriage|love|romance/.test(text)) {
      return [
        { label: 'Romance', query: 'romantic instrumental memories music' },
        { label: 'Wedding', query: 'wedding cinematic instrumental music' },
        { label: 'Soft piano', query: 'soft piano emotional open source music' },
        ...STORY_MUSIC_SUGGESTIONS.filter(item => !['Romantic', 'Family'].includes(item.label)),
      ];
    }
    if (/birthday|party|festival|diwali|graduation|celebration/.test(text)) {
      return [
        { label: 'Celebration', query: 'celebration upbeat instrumental open source music' },
        { label: 'Birthday', query: 'happy birthday celebration instrumental music' },
        { label: 'Bright pop', query: 'upbeat happy instrumental open source music' },
        ...STORY_MUSIC_SUGGESTIONS.filter(item => !['Birthday'].includes(item.label)),
      ];
    }
    if (/travel|trip|goa|beach|mountain|trek|road/.test(text)) {
      return [
        { label: 'Travel', query: 'travel cinematic instrumental open source music' },
        { label: 'Adventure', query: 'adventure upbeat instrumental music' },
        { label: 'Sunset', query: 'sunset ambient instrumental memories music' },
        ...STORY_MUSIC_SUGGESTIONS.filter(item => !['Travel'].includes(item.label)),
      ];
    }
    return STORY_MUSIC_SUGGESTIONS;
  }, [sequence]);

  const emitToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 1800);
  };

  useEffect(() => {
    if (!current) return;
    setImageLoaded(false);
    setMediaFailed(false);
    setHighResReady(false);
    setDriveObjectSrc('');
    const driveBacked = canFetchDriveMedia(current);
    if (isVideoMemory(current)) {
      setPreviewSrc('');
      // Do not put an expired access-token URL into a media element. The
      // authenticated/cache-first loader below owns Drive media playback.
      setMediaSrc(driveBacked ? '' : current.url);
      return;
    }
    const quickPreview = driveBacked ? '' : current.thumbnail || current.url;
    setPreviewSrc(quickPreview);
    setMediaSrc(driveBacked ? '' : current.url);
  }, [current?.id, current?.url]);

  useEffect(() => {
    if (!current || !canFetchDriveMedia(current)) return undefined;

    let objectUrl = '';
    let cancelled = false;
    const controller = new AbortController();

    const loadDriveMedia = async () => {
      try {
        const cacheKey = getStoryMediaCacheKey(current);
        const driveCached = await readCachedDriveMedia(current.driveFileId || '');
        const cachedBlob = driveCached?.blob || await readCachedStoryMedia(cacheKey);
        if (cachedBlob) {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(cachedBlob);
          if (cancelled) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = '';
            return;
          }
          setDriveObjectSrc(objectUrl);
          setMediaSrc(objectUrl);
          setMediaFailed(false);
          setHighResReady(true);
          return;
        }

        if (!current.driveFileId || !current.authToken) return;
        const result = await withMediaFetch(() => googleDriveService.downloadMediaFileWithReconnect(current.authToken!, current.driveFileId!, controller.signal), controller.signal);
        if (result.accessToken !== current.authToken) saveDriveAccessToken(result.accessToken);
        const blob = result.blob;
        if (cancelled) return;
        void writeCachedStoryMedia(cacheKey, blob, current.mimeType || blob.type);
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = '';
          return;
        }
        setDriveObjectSrc(objectUrl);
        setMediaSrc(objectUrl);
        setMediaFailed(false);
        setHighResReady(true);
      } catch {
        if (!controller.signal.aborted && !previewSrc) {
          setMediaFailed(true);
        }
      }
    };

    void loadDriveMedia();

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [current?.authToken, current?.driveFileId, current?.id, current?.thumbnail]);

  useEffect(() => {
    if (!current || current.driveFileId || isVideoMemory(current) || mediaFailed || !current.url) {
      return;
    }

    const quickPreview = current.thumbnail || current.url;
    if (quickPreview === current.url) {
      setHighResReady(true);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.src = current.url;
    image.onload = () => {
      if (!cancelled) setHighResReady(true);
    };
    image.onerror = () => {
      if (!cancelled) setHighResReady(false);
    };

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [current, mediaFailed]);

  const markMediaLoaded = () => {
    setImageLoaded(true);
    setMediaFailed(false);
  };

  const handlePreviewError = () => {
    if (!current) return;
    if (!current.driveFileId && !isVideoMemory(current) && current.url && previewSrc !== current.url) {
      setPreviewSrc(current.url);
      setImageLoaded(false);
      return;
    }
    setImageLoaded(true);
    setMediaFailed(true);
    emitToast('This memory media could not be loaded.');
  };

  const handleVideoError = () => {
    if (driveObjectSrc && mediaSrc !== driveObjectSrc) {
      setMediaSrc(driveObjectSrc);
      setMediaFailed(false);
      return;
    }
    if (current?.thumbnail) {
      setImageLoaded(true);
      setMediaFailed(true);
      emitToast('Video preview is available, but this video format could not play in the browser.');
      return;
    }
    setImageLoaded(true);
    setMediaFailed(true);
    emitToast('This memory media could not be loaded.');
  };

  const stopAmbientMusic = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const now = audio.context.currentTime;
    audio.gain.gain.cancelScheduledValues(now);
    audio.gain.gain.setTargetAtTime(0.0001, now, 0.08);
    window.setTimeout(() => {
      audio.oscillators.forEach(oscillator => {
        try {
          oscillator.stop();
          oscillator.disconnect();
        } catch {
          // Oscillators may already be stopped by browser cleanup.
        }
      });
      audio.gain.disconnect();
      void audio.context.close().catch(() => {});
      if (audioRef.current === audio) audioRef.current = null;
    }, 260);
  }, []);

  const startAmbientMusic = useCallback(() => {
    if (audioRef.current) {
      void audioRef.current.context.resume().catch(() => {});
      return;
    }
    try {
      const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      const context = new AudioContextCtor();
      const gain = context.createGain();
      const baseFrequency = resolvedTemplate === 'wedding' ? 220 : resolvedTemplate === 'baby' ? 196 : resolvedTemplate === 'travel' ? 174 : 146;
      const oscillators = [baseFrequency, baseFrequency * 1.5, baseFrequency * 2].map((frequency, index) => {
        const oscillator = context.createOscillator();
        oscillator.type = index === 1 ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        const toneGain = context.createGain();
        toneGain.gain.value = index === 0 ? 0.45 : 0.16;
        oscillator.connect(toneGain);
        toneGain.connect(gain);
        oscillator.start();
        return oscillator;
      });
      gain.gain.value = 0.0001;
      gain.connect(context.destination);
      gain.gain.setTargetAtTime(0.035, context.currentTime, 0.24);
      audioRef.current = { context, gain, oscillators };
    } catch {
      emitToast('Tap play to allow soundtrack.');
    }
  }, [resolvedTemplate]);

  const setIndex = useCallback((nextIndex: number) => {
    if (!sequence.length) return;
    const safe = (nextIndex + sequence.length) % sequence.length;
    setCurrentIdx(safe);
    setImageLoaded(false);
    setMediaFailed(false);
    setProgress(0);
    setZoom(1);
    setRotation(0);
    pausedAtRef.current = 0;
    const nextMemory = sequence[safe];
    onIndexChange?.(nextMemory, safe);
  }, [onIndexChange, sequence]);

  const goNext = useCallback(() => setIndex(currentIdx + 1), [currentIdx, setIndex]);
  const goPrev = useCallback(() => setIndex(currentIdx - 1), [currentIdx, setIndex]);

  useEffect(() => {
    onAutoplayChange?.(isPlaying);
  }, [isPlaying, onAutoplayChange]);

  useEffect(() => {
    if (!current) return;
    onIndexChange?.(current, currentIdx);
  }, [current, currentIdx, onIndexChange]);

  useEffect(() => {
    if (!memory) return;
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') goNext();
      if (event.key === 'ArrowLeft') goPrev();
      if (event.key === ' ') {
        event.preventDefault();
        setIsPlaying(value => !value);
      }
      if (event.key.toLowerCase() === 'f') void toggleFullscreen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, memory, onClose]);

  useEffect(() => {
    if (!memory) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      cancelAnimationFrame(frameRef.current);
      if (chromeTimerRef.current) window.clearTimeout(chromeTimerRef.current);
      localAudioObjectRef.current.forEach(url => URL.revokeObjectURL(url));
      localAudioObjectRef.current = [];
      stopAmbientMusic();
    };
  }, [memory, stopAmbientMusic]);

  const clearChromeTimer = useCallback(() => {
    if (chromeTimerRef.current) {
      window.clearTimeout(chromeTimerRef.current);
      chromeTimerRef.current = null;
    }
  }, []);

  const showChrome = useCallback((keepOpen = false) => {
    setChromeVisible(true);
    clearChromeTimer();
    if (mode !== 'story' || keepOpen) return;
    chromeTimerRef.current = window.setTimeout(() => {
      setChromeVisible(false);
      setSettingsOpen(false);
      setMusicOpen(false);
    }, 4800);
  }, [clearChromeTimer, mode]);

  useEffect(() => {
    if (!memory) return;
    showChrome();
  }, [memory, showChrome]);

  useEffect(() => {
    if (memory && isPlaying && !muted && !hasStoryMusic) startAmbientMusic();
    else stopAmbientMusic();
  }, [hasStoryMusic, isPlaying, memory, muted, startAmbientMusic, stopAmbientMusic]);

  useEffect(() => {
    if (!isPlaying || !current) {
      cancelAnimationFrame(frameRef.current);
      return;
    }

    startedAtRef.current = performance.now() - pausedAtRef.current;
    const tick = (now: number) => {
      const elapsed = now - startedAtRef.current;
      const percent = Math.min(100, (elapsed / duration) * 100);
      setProgress(percent);
      if (elapsed >= duration && (mode === 'story' || !isVideoMemory(current))) {
        pausedAtRef.current = 0;
        goNext();
        return;
      }
      pausedAtRef.current = elapsed;
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [current, duration, goNext, isPlaying, mode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !current || !isVideoMemory(current)) return;
    if (mode === 'story') video.muted = true;
    if (isPlaying) {
      void video.play().catch(() => {
        if (mode !== 'story') {
          setIsPlaying(false);
          emitToast('Tap play to start this video.');
        }
      });
    } else {
      video.pause();
    }
  }, [current?.id, current?.url, driveObjectSrc, isPlaying, mediaSrc, mode]);

  useEffect(() => {
    if (!current || !sequence.length) return;
    const preload = [sequence[(currentIdx + 1) % sequence.length], sequence[(currentIdx - 1 + sequence.length) % sequence.length]];
    preload.forEach(item => {
      if (item && !isVideoMemory(item)) {
        const img = new Image();
        const source = item.driveFileId ? '' : item.url;
        if (source) img.src = source;
      }
    });
  }, [current, currentIdx, sequence]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      emitToast('Fullscreen is blocked by the browser.');
    }
  };

  const togglePlaying = () => {
    const next = !isPlaying;
    setIsPlaying(next);
    if (videoRef.current) {
      if (next) void videoRef.current.play().catch(() => emitToast('Tap play to allow video playback.'));
      else videoRef.current.pause();
    }
  };

  const toggleStoryMusicPlaying = () => {
    if (!audioSrc && !youtubeSrc) {
      emitToast('Choose a song first.');
      return;
    }
    const next = !storyMusicPlaying;
    if (audioSrc && storyAudioElementRef.current) {
      if (!next) {
        storyAudioElementRef.current.pause();
        setStoryMusicPlaying(false);
        return;
      }
      void storyAudioElementRef.current.play()
        .then(() => setStoryMusicPlaying(true))
        .catch(() => {
          setStoryMusicPlaying(false);
          emitToast('Tap play again to allow music on this device.');
        });
      return;
    }
    if (youtubeSrc && storyYouTubeFrameRef.current?.contentWindow) {
      storyYouTubeFrameRef.current.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: next ? 'playVideo' : 'pauseVideo',
        args: [],
      }), '*');
    }
    setStoryMusicPlaying(next);
  };

  const toggleMute = () => {
    setMuted(value => {
      const next = !value;
      if (next) stopAmbientMusic();
      else if (isPlaying) startAmbientMusic();
      return next;
    });
  };

  const searchStoryMusic = async (value = musicQuery) => {
    const query = value.trim();
    if (!query) {
      emitToast('Search a song or paste a link.');
      return;
    }
    setMusicSearching(true);
    setMusicOpen(true);
    try {
      // Offline-known playable tracks (96 soundtrack, direct audio links, YouTube ids).
      const known = buildStoryMusicResults(query);
      const playableKnown = known.filter(track => track.videoId || track.previewUrl);
      // Real searchable, playable open-source audio from the Internet Archive.
      const openSource = (await searchOpenSourceMusic(query)).map(track => ({
        ...track,
        query,
      } satisfies StoryMusicTrack));
      const merged = [...playableKnown, ...openSource];
      if (!merged.length) {
        setMusicResults(known);
        emitToast('No playable songs found online. Showing search links below.');
        return;
      }
      setMusicResults(merged);
      emitToast(openSource.length
        ? `${openSource.length} open-source songs found. Pick one to play.`
        : 'Song results ready. Pick one to play or add.');
    } catch {
      const results = buildStoryMusicResults(query);
      setMusicResults(results);
      emitToast(results.some(track => track.videoId || track.previewUrl)
        ? 'Online search failed, using known songs.'
        : 'No playable songs found.');
    } finally {
      setMusicSearching(false);
    }
  };

  const playStoryMusic = (value = musicQuery) => {
    void searchStoryMusic(value);
  };

  const setActiveStoryTrack = (track: StoryMusicTrack, playlist = storyPlaylist, index = storyPlaylistIndex) => {
    if (!track.videoId && !track.previewUrl) {
      if (track.externalUrl) window.open(track.externalUrl, '_blank', 'noopener,noreferrer');
      setMusicOpen(true);
      emitToast('Open a YouTube result, then paste its link here to play inside Memoriya.');
      return;
    }
    const shouldUseYouTube = Boolean(track.videoId);
    setAudioSrc(!shouldUseYouTube && track.previewUrl ? track.previewUrl : '');
    setYoutubeSrc(shouldUseYouTube ? buildYouTubePlaylistSrc(playlist, index) || buildYouTubeAudioSrc(track) : '');
    setYoutubeLabel(`${track.title} - ${track.artist}`);
    setLocalAudioName(!shouldUseYouTube ? `${track.title} - ${track.artist}` : '');
    setActiveMusicId(track.id);
    setMusicOpen(true);
    setSettingsOpen(false);
    setMuted(true);
    // Selecting a remote/local file must not pretend that playback succeeded.
    // The browser may reject autoplay; the visible Play button remains honest
    // and starts the element from the user's gesture.
    setStoryMusicPlaying(shouldUseYouTube);
    stopAmbientMusic();
    showChrome(true);
  };

  const addStoryTrackToPlaylist = (track: StoryMusicTrack, playNow = false) => {
    if (!track.videoId && !track.previewUrl) {
      if (track.externalUrl) window.open(track.externalUrl, '_blank', 'noopener,noreferrer');
      emitToast('Open a result, then paste a playable link here to add it.');
      return;
    }
    setStoryPlaylist(previous => {
      const existingIndex = previous.findIndex(item => item.id === track.id);
      const next = existingIndex >= 0 ? previous : [...previous, track];
      const index = existingIndex >= 0 ? existingIndex : next.length - 1;
      if (playNow) {
        setStoryPlaylistIndex(index);
        setActiveStoryTrack(track, next, index);
      }
      return next;
    });
    emitToast(playNow ? 'Playlist started.' : 'Song added to playlist.');
  };

  const playStoryTrack = (track: StoryMusicTrack) => {
    if (!track.videoId && !track.previewUrl) {
      setActiveStoryTrack(track);
      return;
    }
    const playlist = musicResults.length ? musicResults : [track];
    const playablePlaylist = playlist.filter(item => item.videoId || item.previewUrl);
    const safeIndex = Math.max(0, playablePlaylist.findIndex(item => item.id === track.id));
    setStoryPlaylist(playablePlaylist);
    setStoryPlaylistIndex(safeIndex);
    setActiveStoryTrack(track, playablePlaylist, safeIndex);
    emitToast(track.previewUrl ? 'Playlist started.' : 'YouTube playlist started.');
  };

  const playPlaylistTrack = (index: number) => {
    const track = storyPlaylist[index];
    if (!track) return;
    setStoryPlaylistIndex(index);
    setActiveStoryTrack(track, storyPlaylist, index);
    emitToast('Playing playlist song.');
  };

  const movePlaylistTrack = (index: number, direction: -1 | 1) => {
    setStoryPlaylist(previous => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      setStoryPlaylistIndex(current => {
        if (current === index) return nextIndex;
        if (current === nextIndex) return index;
        return current;
      });
      return next;
    });
  };

  const playPreviousStoryTrack = () => {
    if (!storyPlaylist.length) return;
    const previousIndex = storyPlaylistIndex <= 0 ? storyPlaylist.length - 1 : storyPlaylistIndex - 1;
    playPlaylistTrack(previousIndex);
  };

  const playNextStoryTrack = () => {
    if (!storyPlaylist.length) return;
    const nextIndex = storyPlaylistIndex < 0 || storyPlaylistIndex + 1 >= storyPlaylist.length ? 0 : storyPlaylistIndex + 1;
    playPlaylistTrack(nextIndex);
  };

  const stopStoryMusic = () => {
    setAudioSrc('');
    setYoutubeSrc('');
    setYoutubeLabel('');
    setLocalAudioName('');
    setActiveMusicId('');
    setStoryPlaylistIndex(-1);
    setStoryMusicPlaying(false);
    emitToast('Story soundtrack stopped.');
  };

  const addLocalAudioFiles = (files: FileList | File[]) => {
    const tracks = Array.from(files).map((file, index) => {
      const objectUrl = URL.createObjectURL(file);
      localAudioObjectRef.current.push(objectUrl);
      return {
        id: `local-audio-${Date.now()}-${index}-${file.name}`,
        title: file.name.replace(/\.[^.]+$/, ''),
        artist: 'Local music',
        query: file.name,
        previewUrl: objectUrl,
      };
    });
    if (!tracks.length) return;
    setStoryPlaylist(previous => {
      const next = [...previous, ...tracks];
      if (storyPlaylistIndex < 0) {
        setStoryPlaylistIndex(previous.length);
        setActiveStoryTrack(tracks[0], next, previous.length);
      }
      return next;
    });
    setMusicOpen(true);
    setSettingsOpen(false);
    emitToast(tracks.length === 1 ? 'Local song added.' : `${tracks.length} local songs added.`);
  };

  const downloadCurrent = async () => {
    if (!current) return;
    setDownloadLoading(true);
    try {
      const cacheKey = getStoryMediaCacheKey(current);
      let blob = await readCachedStoryMedia(cacheKey);
      if (!blob && current.driveFileId && current.authToken) {
        const result = await withMediaFetch(() => googleDriveService.downloadMediaFileWithReconnect(current.authToken!, current.driveFileId!));
        if (result.accessToken !== current.authToken) saveDriveAccessToken(result.accessToken);
        blob = result.blob;
        void writeCachedStoryMedia(cacheKey, blob, current.mimeType || blob.type);
      }
      if (!blob) {
        const source = driveObjectSrc || mediaSrc || (current.driveFileId ? '' : current.url);
        if (!source) throw new Error('The original media is not ready yet.');
        const response = await fetch(source);
        if (!response.ok) throw new Error(`Media download failed (${response.status}).`);
        blob = await response.blob();
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${current.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'memoriya-memory'}.${mediaExtension(current, blob.type || current.mimeType)}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      emitToast(`${current.type === 'video' ? 'Video' : 'Photo'} saved to your device.`);
    } catch (error) {
      emitToast(error instanceof Error ? error.message : 'Could not download this memory.');
    } finally {
      setDownloadLoading(false);
    }
  };

  const shareCurrent = async () => {
    if (!current) return;
    const text = `${current.title} - ${current.url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: current.title, text, url: current.url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        emitToast('Share link copied.');
      } else {
        emitToast('Share link ready.');
      }
    } catch {
      emitToast('Share cancelled.');
    }
  };

  const toggleFavorite = () => {
    if (!current) return;
    const willFavorite = !favoriteIds.has(current.id);
    setFavoriteIds(ids => {
      const next = new Set(ids);
      if (next.has(current.id)) next.delete(current.id);
      else next.add(current.id);
      return next;
    });
    emitToast(willFavorite ? 'Marked as favorite.' : 'Removed from favorites.');
  };

  const handleTouchEnd = (x: number, y: number) => {
    if (!touchStart) return;
    const dx = x - touchStart.x;
    const dy = y - touchStart.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNext();
      else goPrev();
    }
    setTouchStart(null);
  };

  if (!memory || !current) return null;

  const isFavorite = favoriteIds.has(current.id);
  const variant = transitionVariants[activeTransition];
  const displayVariant = mode === 'story'
    ? {
        initial: { ...variant.initial, opacity: 0.22 },
        animate: { ...variant.animate, opacity: 1 },
        exit: { ...variant.exit, opacity: 0.22 },
      }
    : variant;
  const objectFit = fitMode === 'cover' ? 'cover' : 'contain';
  const mediaClass = `cinema-media cinema-media-${fitMode} cinema-frame-${templateStyle.frame} cinema-camera-shot-${currentIdx % 6}`;
  const storyEffectClass = mode === 'story' ? `cinema-story-effect cinema-story-effect-${currentIdx % 5} cinema-story-edit-${resolvedEditStyle}` : '';
  const zoomScale = zoom * (activeTransition === 'ken-burns' && isPlaying ? 1.035 : 1);
  const counter = `${currentIdx + 1} / ${sequence.length}`;
  const isStoryMode = mode === 'story';
  const baseImageSrc = previewSrc || driveObjectSrc || (current.driveFileId ? '' : current.thumbnail || current.url);
  const showHighResLayer = !isVideoMemory(current) && !mediaFailed && highResReady && mediaSrc && mediaSrc !== baseImageSrc;
  const progressSegments = sequence.map((_, index) => (index < currentIdx ? 100 : index === currentIdx ? progress : 0));
  const sideMemories = isStoryMode && sequence.length > 2
    ? [-1, 1]
        .map(offset => {
          const item = sequence[(currentIdx + offset + sequence.length) % sequence.length];
          return item ? { item, offset, src: getDecorativeMemorySrc(item) } : null;
        })
        .filter((entry): entry is { item: Memory; offset: number; src: string } => Boolean(entry?.src && entry.item.type === 'photo' && entry.item.id !== current.id))
        .slice(0, 2)
    : [];
  const mediaMotion = (() => {
    if (!isPlaying) {
      return {
        scale: zoom,
        rotate: rotation,
        x: 0,
        y: 0,
        filter: 'brightness(1) saturate(1)',
      };
    }

    const direction = currentIdx % 2 === 0 ? 1 : -1;
    const drift = currentIntensity === 'dramatic' ? 28 : currentIntensity === 'soft' ? 10 : 18;
    const lift = currentIntensity === 'dramatic' ? 16 : currentIntensity === 'soft' ? 6 : 11;
    const tilt = currentIntensity === 'dramatic' ? 2.2 : currentIntensity === 'soft' ? 0.7 : 1.3;
    const pulse = currentIntensity === 'dramatic' ? 0.072 : currentIntensity === 'soft' ? 0.024 : 0.046;
    const shot = currentIdx % 6;
    const cinematicShot = [
      { scale: [1.01, 1.045, 1.09], x: [0, direction * 8, direction * 18], y: [4, -5, -10], rotate: [0, direction * 0.2, direction * 0.35] },
      { scale: [1.08, 1.1, 1.075], x: [direction * 30, direction * 4, direction * -28], y: [6, -2, -8], rotate: [direction * 0.35, direction * 0.08, direction * -0.26] },
      { scale: [1.13, 1.08, 1.025], x: [direction * -18, direction * -4, direction * 12], y: [-10, 1, 12], rotate: [direction * -0.25, direction * 0.05, direction * 0.28] },
      { scale: [1.045, 1.08, 1.1], x: [direction * -8, direction * 12, direction * 30], y: [14, 4, -12], rotate: [direction * -0.32, direction * -0.06, direction * 0.24] },
      { scale: [1.055, 1.1, 1.07], x: [direction * 18, direction * -12, direction * 8], y: [-8, -18, -2], rotate: [direction * 0.2, direction * -0.4, direction * 0.18] },
      { scale: [1.02, 1.065, 1.095], x: [direction * -4, direction * -18, direction * -30], y: [10, 0, -14], rotate: [direction * 0.12, direction * 0.36, direction * 0.56] },
    ][shot];
    let scaleFrames = cinematicShot.scale.map(value => zoomScale * value);
    let xFrames = cinematicShot.x.map(value => value * (drift / 18));
    let yFrames = cinematicShot.y.map(value => value * (lift / 11));
    let rotateFrames = cinematicShot.rotate.map(value => rotation + value * (tilt / 1.3));
    let filterFrames = [
      'brightness(0.96) saturate(1.04)',
      'brightness(1.04) saturate(1.12)',
      'brightness(1) saturate(1.06)',
    ];

    if (resolvedEditStyle === 'marriage') {
      scaleFrames = [zoomScale * 1.01, zoomScale * 1.075, zoomScale * 1.035];
      xFrames = [direction * 4, direction * -12, direction * 7];
      yFrames = [6, -10, -4];
      rotateFrames = [rotation + direction * 0.18, rotation + direction * 0.65, rotation + direction * 0.28];
      filterFrames = ['brightness(0.98) saturate(1.08)', 'brightness(1.06) saturate(1.16)', 'brightness(1.01) saturate(1.1)'];
    } else if (resolvedEditStyle === 'nature') {
      scaleFrames = [zoomScale * 1.02, zoomScale * 1.09, zoomScale * 1.045];
      xFrames = [direction * -10, direction * 18, direction * 6];
      yFrames = [8, -14, -6];
      rotateFrames = [rotation, rotation + direction * 0.34, rotation + direction * 0.16];
      filterFrames = ['brightness(0.96) saturate(1.14)', 'brightness(1.04) saturate(1.28)', 'brightness(1) saturate(1.18)'];
    } else if (resolvedEditStyle === 'family') {
      scaleFrames = [zoomScale * 1.005, zoomScale * 1.045, zoomScale * 1.018];
      xFrames = [direction * 3, direction * -8, direction * 4];
      yFrames = [4, -7, -2];
      rotateFrames = [rotation, rotation + direction * 0.42, rotation + direction * 0.12];
      filterFrames = ['brightness(0.98) saturate(1.02)', 'brightness(1.035) saturate(1.1)', 'brightness(1) saturate(1.06)'];
    } else if (resolvedEditStyle === 'birthday') {
      scaleFrames = [zoomScale * 0.99, zoomScale * 1.095, zoomScale * 1.025];
      xFrames = [direction * 10, direction * -16, direction * 8];
      yFrames = [10, -18, 2];
      rotateFrames = [rotation + direction * 0.4, rotation + direction * 1.2, rotation + direction * 0.25];
      filterFrames = ['brightness(0.94) saturate(1.2)', 'brightness(1.12) saturate(1.36)', 'brightness(1.02) saturate(1.2)'];
    } else if (resolvedEditStyle === 'cinematic') {
      scaleFrames = [zoomScale * 1.018, zoomScale * 1.085, zoomScale * 1.032];
      xFrames = [direction * 14, direction * -20, direction * 9];
      yFrames = [lift * 0.72, -lift, -lift * 0.42];
      rotateFrames = [rotation + direction * 0.24, rotation + direction * 0.82, rotation + direction * 0.18];
      filterFrames = ['brightness(0.88) contrast(1.08) saturate(1.06)', 'brightness(1.06) contrast(1.02) saturate(1.12)', 'brightness(0.98) contrast(1.04) saturate(1.08)'];
    }

    switch (activeTransition) {
      case 'ken-burns':
        scaleFrames = [zoomScale * 1.018, zoomScale * (1.06 + pulse * 0.45), zoomScale * 1.09];
        xFrames = [direction * 6, direction * -drift * 0.5, direction * drift * 0.28];
        yFrames = [lift * 0.45, -lift * 0.9, -lift * 1.18];
        rotateFrames = [rotation, rotation + direction * tilt * 0.38, rotation + direction * tilt * 0.72];
        break;
      case 'parallax':
        xFrames = [direction * 18, direction * -drift * 0.72, direction * drift * 0.52];
        yFrames = [lift * 0.48, -lift * 0.55, lift * 0.22];
        rotateFrames = [rotation + direction * tilt, rotation + direction * tilt * -0.52, rotation + direction * tilt * 0.4];
        break;
      case 'scrapbook':
        scaleFrames = [zoomScale * 0.985, zoomScale * (1.03 + pulse * 0.32), zoomScale * 1.01];
        rotateFrames = [rotation + direction * tilt * 1.1, rotation + direction * tilt * -0.38, rotation + direction * tilt * 0.55];
        xFrames = [direction * drift * 0.24, direction * -drift * 0.2, direction * drift * 0.14];
        break;
      case 'film-fade':
        yFrames = [lift * 1.15, 0, -lift * 0.75];
        filterFrames = [
          'brightness(0.84) contrast(1.08) saturate(1.04)',
          'brightness(1.04) contrast(1.02) saturate(1.08)',
          'brightness(0.98) contrast(1.04) saturate(1.02)',
        ];
        break;
      case 'vertical-reveal':
        yFrames = [lift * 1.55, -lift * 0.3, -lift * 1.18];
        xFrames = [0, direction * drift * 0.18, direction * -drift * 0.12];
        break;
      case 'glow-pulse':
        scaleFrames = [zoomScale * 0.97, zoomScale * (1.05 + pulse * 0.28), zoomScale * 1.01];
        filterFrames = [
          'brightness(0.94) saturate(1.1)',
          'brightness(1.08) saturate(1.22)',
          'brightness(1) saturate(1.1)',
        ];
        break;
      case 'dream-dissolve':
        xFrames = [direction * drift * 0.14, direction * -drift * 0.24, direction * drift * 0.18];
        yFrames = [lift * 0.68, -lift * 0.82, -lift * 0.34];
        filterFrames = [
          'brightness(0.9) saturate(1.14)',
          'brightness(1.06) saturate(1.24)',
          'brightness(1) saturate(1.12)',
        ];
        break;
      default:
        break;
    }

    return {
      scale: scaleFrames,
      rotate: rotateFrames,
      x: xFrames,
      y: yFrames,
      filter: filterFrames,
    };
  })();
  const mediaMotionTransition = {
    duration: isPlaying ? (mode === 'story' ? Math.max(duration / 1000, 5.2) : Math.max(duration / 1000, 4.8)) : 0.42,
    ease: [0.22, 1, 0.36, 1] as const,
    times: [0, 0.58, 1],
  };

  const content = (
    <AnimatePresence>
      <motion.div
        key="cinematic-lightbox"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`cinema-viewer cinema-template-${resolvedTemplate} cinema-mode-${mode} cinema-edit-${resolvedEditStyle} ${chromeVisible ? 'cinema-ui-visible' : 'cinema-ui-hidden'}`}
        onClick={event => {
          if (mode === 'story') {
            showChrome();
            return;
          }
          if (event.target === event.currentTarget) onClose();
        }}
        onMouseMove={() => showChrome()}
        onTouchStart={event => {
          showChrome();
          setTouchStart({ x: event.touches[0].clientX, y: event.touches[0].clientY });
        }}
        onTouchEnd={event => {
          showChrome();
          handleTouchEnd(event.changedTouches[0].clientX, event.changedTouches[0].clientY);
        }}
      >
        <div className="cinema-backdrop">
          <img src={current.driveFileId ? '' : current.thumbnail || current.url} alt="" aria-hidden="true" />
          <div className="cinema-backdrop-color" style={{ background: `radial-gradient(circle at 48% 35%, ${colors[0]}33, transparent 36%), radial-gradient(circle at 76% 65%, ${colors[1]}24, transparent 34%)` }} />
        </div>

        <div className={`cinema-particles cinema-particles-${templateStyle.particle}`} aria-hidden="true">
          {Array.from({ length: mode === 'story' ? 6 : 12 }).map((_, index) => <span key={index} style={{ '--i': index } as React.CSSProperties} />)}
        </div>

        {treeOverlayOn && (
          <div className="cinema-tree-overlay" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}

        <div className="cinema-topbar cinema-auto-chrome">
          <div className="cinema-breadcrumb">
            <Sparkles size={15} />
            <span>{templateStyle.label}</span>
            <strong>{current.event || `${MONTH_NAMES[current.month]} ${current.year}`}</strong>
          </div>
          <div className="cinema-top-actions">
            <button onClick={() => setCaptionsOn(value => !value)} aria-label="Toggle captions" title="Toggle captions">
              {captionsOn ? <Eye size={17} /> : <EyeOff size={17} />}
            </button>
            <button onClick={toggleMute} aria-label="Mute / Unmute" title="Mute / Unmute">
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <button onClick={() => {
              setSettingsOpen(value => !value);
              setMusicOpen(false);
              showChrome(true);
            }} aria-label="Toggle effects panel" title="Toggle effects panel">
              <SlidersHorizontal size={17} />
            </button>
            {mode === 'story' && (
              <button onClick={() => {
                setMusicOpen(value => !value);
                setSettingsOpen(false);
                showChrome(true);
              }} aria-label="YouTube music" title="YouTube music">
                <Music size={17} />
              </button>
            )}
            {mode === 'story' && onImportLocalMedia && (
              <button onClick={onImportLocalMedia} aria-label="Use local photos or videos" title="Use local photos or videos">
                <Upload size={17} />
              </button>
            )}
            <button onClick={toggleFullscreen} aria-label="Fullscreen" title="Fullscreen">
              {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            <button onClick={onClose} aria-label="Close lightbox" title="Close" className="cinema-action-close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="cinema-progress-rail cinema-auto-chrome">
          {isStoryMode && sequence.length > 1 ? (
            progressSegments.map((value, index) => (
              <div key={sequence[index]?.id || index} className={`cinema-progress-segment ${index === currentIdx ? 'is-active' : ''}`}>
                <motion.span
                  animate={{ width: `${value}%` }}
                  transition={{ duration: index === currentIdx ? 0.18 : 0.32, ease: 'easeOut' }}
                  style={{ background: `linear-gradient(90deg, ${colors[0]}, ${colors[1]}, ${colors[2]})` }}
                />
              </div>
            ))
          ) : (
            <motion.div style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${colors[0]}, ${colors[1]}, ${colors[2]})` }} />
          )}
        </div>

        <button className="cinema-nav cinema-nav-left cinema-auto-chrome" onClick={goPrev} aria-label="Previous memory">
          <ChevronLeft size={26} />
        </button>
        <button className="cinema-nav cinema-nav-right cinema-auto-chrome" onClick={goNext} aria-label="Next memory">
          <ChevronRight size={26} />
        </button>

        <main className="cinema-stage">
          <div className="cinema-stage-atmosphere" aria-hidden="true">
            <span style={{ background: `radial-gradient(circle, ${colors[0]}2f 0%, ${colors[0]}00 70%)` }} />
            <span style={{ background: `radial-gradient(circle, ${colors[1]}29 0%, ${colors[1]}00 72%)` }} />
          </div>
          <div className="cinema-stage-rings" aria-hidden="true">
            <span style={{ borderColor: `${colors[0]}22` }} />
            <span style={{ borderColor: `${colors[1]}18` }} />
          </div>
          {isStoryMode && (
            <div className="cinema-empty-spark-rain" aria-hidden="true">
              {Array.from({ length: 34 }).map((_, index) => (
                <span
                  key={index}
                  style={{
                    '--i': index,
                    '--x': `${(index * 23) % 100}%`,
                    '--y': `${10 + ((index * 17) % 78)}%`,
                    '--d': `${(index % 9) * 0.42}s`,
                    '--s': `${0.55 + (index % 5) * 0.12}`,
                    background: index % 3 === 0 ? colors[0] : index % 3 === 1 ? colors[1] : colors[2],
                  } as React.CSSProperties}
                />
              ))}
            </div>
          )}
          {sideMemories.length > 0 && (
            <div className="cinema-side-memories" aria-hidden="true">
              {sideMemories.map(({ item, offset, src }, index) => (
                <motion.img
                  key={`${item.id}-${offset}`}
                  src={src}
                  alt=""
                  className={`cinema-side-memory ${offset < 0 ? 'is-left' : 'is-right'} ${Math.abs(offset) === 1 ? 'is-near' : 'is-far'}`}
                  initial={{ opacity: 0, scale: 0.94, x: offset < 0 ? -36 : 36 }}
                  animate={{
                    opacity: [0.96, 1, 0.98],
                    scale: [0.98, 1.02, 1],
                    x: offset < 0 ? [-8, -14, -6] : [8, 14, 6],
                    y: [-5, 7, -3],
                  }}
                  exit={{ opacity: 0.12, scale: 0.94, x: offset < 0 ? -34 : 34 }}
                  transition={{ duration: Math.max(transitionDuration * 1.35, 1.35), ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    top: '50%',
                    [offset < 0 ? 'left' : 'right']: '5.4%',
                    animationDelay: `${index * -1.3}s`,
                  } as React.CSSProperties}
                />
              ))}
            </div>
          )}
          {isStoryMode ? (
            <div className="cinema-story-camera-wall" aria-label="Cinematic photo camera">
              <div
                className="cinema-story-camera-track"
                style={{ transform: `translate3d(calc(50vw - ${typeof window !== 'undefined' && window.innerWidth <= 760 ? 44 : 38}vw - ${currentIdx * (typeof window !== 'undefined' && window.innerWidth <= 760 ? 93 : 82)}vw), -50%, 0)` }}
              >
                {sequence.map((item, index) => {
                  const active = index === currentIdx;
                  const source = active
                    ? (item.id === current.id && driveObjectSrc ? driveObjectSrc : item.driveFileId ? '' : (item.url || item.thumbnail))
                    : getDecorativeMemorySrc(item);
                  return (
                    <button
                      key={`${item.id}-camera-wall`}
                      type="button"
                      className={`cinema-story-camera-card ${active ? 'is-active' : 'is-blurred'}`}
                      onClick={event => {
                        event.stopPropagation();
                        setIndex(index);
                        showChrome(true);
                      }}
                      aria-label={`Show ${item.title}`}
                    >
                      {source ? (
                        <img
                          src={source}
                          alt={item.title}
                          loading={active ? 'eager' : 'lazy'}
                          decoding="async"
                          onError={event => {
                            const fallback = item.driveFileId ? '' : item.thumbnail || item.url;
                            if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
                          }}
                        />
                      ) : (
                        <span className="cinema-story-camera-card-fallback"><ImageIcon size={28} /></span>
                      )}
                      <span className="cinema-story-camera-card-label">{String(index + 1).padStart(2, '0')}</span>
                    </button>
                  );
                })}
              </div>
              <div className="cinema-story-camera-focus" aria-hidden="true" />
              <div className="cinema-story-camera-sweep" aria-hidden="true" />
            </div>
          ) : (
            <AnimatePresence mode="wait" initial>
              <motion.figure
                key={`${current.id}-${activeTransition}-${fitMode}`}
                variants={displayVariant}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: transitionDuration, ease: [0.16, 1, 0.3, 1] }}
                className={`${mediaClass} ${storyEffectClass}`}
                style={{
                  borderColor: `${colors[0]}66`,
                  boxShadow: `0 0 90px ${colors[0]}33, 0 36px 120px rgba(0,0,0,0.72)`,
                }}
              >
              <div className="cinema-frame-glow" style={{ background: `radial-gradient(circle at 50% 18%, ${colors[0]}36 0%, transparent 72%)` }} />
              <div className="cinema-frame-reflection" style={{ background: `linear-gradient(125deg, rgba(255,255,255,0.22), transparent 30%, transparent 62%, ${colors[1]}18 100%)` }} />
              {isStoryMode && !settingsOpen && !musicOpen && (
                <>
                  <div className="cinema-edit-flash" style={{ background: `linear-gradient(110deg, transparent, ${colors[0]}88, ${colors[1]}44, transparent)` }} />
                  <div className="cinema-prism-shift" aria-hidden="true" />
                  <div className="cinema-speed-lines" aria-hidden="true" />
                </>
              )}
              {!imageLoaded && !baseImageSrc && !driveObjectSrc && (
                <div className="cinema-loader">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}>
                    <Sparkles size={34} />
                  </motion.div>
                  <span>Preparing memory</span>
                </div>
              )}

              <motion.div className="cinema-media-motion" animate={mediaMotion} transition={mediaMotionTransition}>
                {mediaFailed ? (
                  <div className="cinema-media-fallback">
                    <ImageIcon size={38} />
                    <strong>{current.title}</strong>
                    <span>Media could not be loaded. Check the file link or your network.</span>
                  </div>
                ) : isVideoMemory(current) ? (
                  <video
                    key={`${current.id}-${driveObjectSrc || mediaSrc || current.url}`}
                    ref={videoRef}
                    src={driveObjectSrc || mediaSrc || (current.driveFileId ? '' : current.url)}
                    poster={current.driveFileId ? undefined : current.thumbnail}
                    controls
                    autoPlay={isPlaying}
                    muted={isStoryMode ? true : muted}
                    playsInline
                    preload={isStoryMode ? 'auto' : 'metadata'}
                    onLoadedMetadata={markMediaLoaded}
                    onLoadedData={event => {
                      markMediaLoaded();
                      if (isPlaying) void event.currentTarget.play().catch(() => {});
                    }}
                    onCanPlay={event => {
                      if (isPlaying) void event.currentTarget.play().catch(() => {});
                    }}
                    onPlay={() => {
                      if (!isStoryMode) setIsPlaying(true);
                    }}
                    onPause={() => {
                      if (!isStoryMode) setIsPlaying(false);
                    }}
                    onError={handleVideoError}
                    onEnded={() => {
                      if (isStoryMode) {
                        goNext();
                        return;
                      }
                      setIsPlaying(false);
                      goNext();
                    }}
                    style={{ objectFit }}
                  />
                ) : (
                  <>
                    <img
                      className="cinema-photo-layer cinema-photo-preview"
                      src={baseImageSrc}
                      alt={current.title}
                      onLoad={markMediaLoaded}
                      onError={handlePreviewError}
                      decoding="async"
                      loading="eager"
                      style={{ objectFit, opacity: 1 }}
                    />
                    {showHighResLayer && (
                      <img
                        className="cinema-photo-layer cinema-photo-highres"
                        src={mediaSrc}
                        alt={current.title}
                        onError={() => setHighResReady(false)}
                        style={{ objectFit, opacity: highResReady ? 1 : 0 }}
                      />
                    )}
                  </>
                )}

                {fitMode === 'smart' && <img className="cinema-blur-fill" src={baseImageSrc} alt="" aria-hidden="true" />}
              </motion.div>
              <div className="cinema-sweep" />
              <div className="cinema-letterbox" />
              </motion.figure>
            </AnimatePresence>
          )}
        </main>

        <AnimatePresence>
          {captionsOn && (
            <motion.section
              key={`caption-${current.id}`}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 18 }}
              className="cinema-caption"
              style={{ borderColor: `${colors[0]}44` }}
            >
              <div>
                <p className="cinema-counter">{counter}</p>
                <h2>{current.title}</h2>
                <p className="cinema-caption-text">"{current.caption}"</p>
                <div className="cinema-meta">
                  <span><CalendarDays size={13} /> {MONTH_NAMES[current.month]} {current.year}</span>
                  {current.location && <span><MapPin size={13} /> {current.location}</span>}
                  {current.emotion && <span><Sparkles size={13} /> {labelize(current.emotion)}</span>}
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {musicOpen && mode === 'story' && (
            <motion.aside
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              className="cinema-story-music-panel"
              aria-label="YouTube story music"
              onClick={event => {
                event.stopPropagation();
                showChrome(true);
              }}
              onMouseEnter={clearChromeTimer}
              onMouseMove={event => {
                event.stopPropagation();
                clearChromeTimer();
              }}
              onMouseLeave={() => showChrome()}
              onTouchStart={event => {
                event.stopPropagation();
                showChrome(true);
              }}
            >
              <div className="cinema-story-music-head">
                <Music size={16} />
                <span>Story Soundtrack</span>
              </div>
              <input
                ref={localAudioInputRef}
                className="cinema-local-audio-input"
                type="file"
                accept="audio/*"
                multiple
                onChange={event => {
                  const files = event.currentTarget.files;
                  if (files?.length) addLocalAudioFiles(files);
                  event.currentTarget.value = '';
                }}
              />
              <button className="cinema-local-audio-button" onClick={() => localAudioInputRef.current?.click()}>
                <Upload size={15} />
                Use Local Music
              </button>
              <form
                onSubmit={event => {
                  event.preventDefault();
                  playStoryMusic();
                }}
              >
                <Search size={15} />
                <input
                  value={musicQuery}
                  onChange={event => setMusicQuery(event.target.value)}
                  placeholder="Search song or paste YouTube link"
                />
                <button type="submit">{musicSearching ? '...' : 'Find'}</button>
              </form>
              <div className="cinema-story-music-chips">
                {storyMusicSuggestions.slice(0, 6).map(item => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setMusicQuery(item.query);
                      playStoryMusic(item.query);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {musicResults.length > 0 && (
                <div className="cinema-story-music-results">
                  {musicResults.map(track => (
                    <div
                      key={track.id}
                      className={activeMusicId === track.id ? 'is-active' : ''}
                    >
                      <button
                        type="button"
                        className="cinema-story-music-play"
                        onClick={() => playStoryTrack(track)}
                        aria-label={track.videoId || track.previewUrl ? `Play ${track.title}` : `Open ${track.title} on YouTube`}
                        title={track.videoId || track.previewUrl ? 'Play song' : 'Open YouTube search'}
                      >
                        {track.videoId || track.previewUrl ? <Play size={14} /> : <Search size={14} />}
                      </button>
                      <button type="button" onClick={() => playStoryTrack(track)}>
                        <strong>{track.title}</strong>
                        <small>{track.artist}</small>
                      </button>
                      <button
                        type="button"
                        className="cinema-story-music-add"
                        onClick={() => addStoryTrackToPlaylist(track)}
                        disabled={!track.videoId && !track.previewUrl}
                        aria-label={`Add ${track.title} to playlist`}
                        title={track.videoId || track.previewUrl ? 'Add to playlist' : 'Paste a YouTube video link to add it'}
                      >
                        <ListPlus size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {storyPlaylist.length > 0 && (
                <div className="cinema-story-playlist" aria-label="Story music playlist">
                  <div className="cinema-story-playlist-head">
                    <span>Playlist</span>
                    <small>{storyPlaylist.length} song{storyPlaylist.length === 1 ? '' : 's'}</small>
                  </div>
                  <div className="cinema-story-playlist-controls" aria-label="Playlist controls">
                    <button type="button" onClick={playPreviousStoryTrack} title="Previous song" aria-label="Previous song">
                      <SkipBack size={14} />
                    </button>
                    <button type="button" onClick={toggleStoryMusicPlaying} title={storyMusicPlaying ? 'Pause song' : 'Play song'} aria-label={storyMusicPlaying ? 'Pause song' : 'Play song'}>
                      {storyMusicPlaying ? <Pause size={15} /> : <Play size={15} />}
                    </button>
                    <button type="button" onClick={playNextStoryTrack} title="Next song" aria-label="Next song">
                      <SkipForward size={14} />
                    </button>
                  </div>
                  {storyPlaylist.map((track, index) => (
                    <div
                      key={`${track.id}-${index}`}
                      className={`cinema-story-playlist-row ${index === storyPlaylistIndex ? 'is-active' : ''}`}
                    >
                      <span>{index + 1}</span>
                      <button type="button" onClick={() => playPlaylistTrack(index)} title={`Play ${track.title}`}>
                        <strong>{track.title}</strong>
                      </button>
                      <button type="button" onClick={() => movePlaylistTrack(index, -1)} disabled={index === 0} title="Move up" aria-label="Move song up">
                        <ChevronLeft size={13} />
                      </button>
                      <button type="button" onClick={() => movePlaylistTrack(index, 1)} disabled={index === storyPlaylist.length - 1} title="Move down" aria-label="Move song down">
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {!audioSrc && !youtubeSrc && (
                <p className="cinema-story-music-note">Search any song — playable open-source audio from the Internet Archive is found automatically. "96 movie song" also lists the full 96 soundtrack.</p>
              )}
            </motion.aside>
          )}

          {(audioSrc || youtubeSrc) && (
            <div
              className={`cinema-story-player-dock ${musicOpen ? 'is-with-panel' : 'is-floating'}`}
              onClick={event => {
                event.stopPropagation();
                showChrome();
              }}
              onMouseEnter={clearChromeTimer}
              onMouseMove={event => {
                event.stopPropagation();
                clearChromeTimer();
              }}
              onMouseLeave={() => showChrome()}
              onTouchStart={event => {
                event.stopPropagation();
                showChrome();
              }}
            >
              <div className="cinema-audio-stage">
                {audioSrc ? (
                  <audio
                    ref={storyAudioElementRef}
                    src={audioSrc}
                    controls
                    autoPlay={false}
                    preload="auto"
                    onPlay={() => {
                      setMuted(true);
                      setStoryMusicPlaying(true);
                    }}
                    onPause={() => setStoryMusicPlaying(false)}
                    onError={() => {
                      setStoryMusicPlaying(false);
                      emitToast('This song could not play in this browser. Try another result or a local file.');
                    }}
                    onEnded={event => {
                      event.currentTarget.currentTime = 0;
                      playNextStoryTrack();
                    }}
                  />
                ) : (
                  <iframe
                    ref={storyYouTubeFrameRef}
                    src={youtubeSrc}
                    title="YouTube story audio"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                    onLoad={event => {
                      const frameWindow = event.currentTarget.contentWindow;
                      window.setTimeout(() => {
                        frameWindow?.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*');
                        frameWindow?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
                      }, 350);
                    }}
                  />
                )}
                <div className="cinema-audio-visualizer" aria-hidden="true">
                  {Array.from({ length: 24 }).map((_, index) => <span key={index} style={{ '--i': index } as React.CSSProperties} />)}
                </div>
                <div className="cinema-story-music-now">
                  <span>{localAudioName || youtubeLabel || 'Story soundtrack'}</span>
                  <button onClick={playPreviousStoryTrack} title="Previous song" aria-label="Previous song">
                    <SkipBack size={13} />
                  </button>
                  <button onClick={toggleStoryMusicPlaying} title={storyMusicPlaying ? 'Pause song' : 'Play song'} aria-label={storyMusicPlaying ? 'Pause song' : 'Play song'}>
                    {storyMusicPlaying ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                  <button onClick={playNextStoryTrack} title="Next song" aria-label="Next song">
                    <SkipForward size={13} />
                  </button>
                  <button onClick={stopStoryMusic}>Stop</button>
                </div>
              </div>
            </div>
          )}

          {settingsOpen && (
            <motion.aside
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              className="cinema-settings-panel"
              aria-label="Slideshow settings"
              onMouseEnter={clearChromeTimer}
              onMouseMove={event => {
                event.stopPropagation();
                clearChromeTimer();
              }}
              onMouseLeave={() => showChrome()}
              onTouchStart={event => {
                event.stopPropagation();
                showChrome(true);
              }}
            >
              <div className="cinema-edit-style-grid" aria-label="Story edit style">
                {STORY_EDIT_STYLES.map(style => (
                  <button
                    key={style.id}
                    className={editStyle === style.id || (editStyle === 'auto' && style.id === resolvedEditStyle) ? 'is-active' : ''}
                    onClick={() => {
                      setEditStyle(style.id);
                      if (style.template) setSelectedTemplate(style.template);
                      setSelectedTransition(null);
                      setCurrentSpeed(style.speed);
                      setCurrentIntensity(style.intensity);
                      emitToast(`${style.label} edit style applied.`);
                    }}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
              <label>
                Template
                <select value={resolvedTemplate} onChange={event => {
                  const next = event.target.value as Exclude<SlideshowTemplate, 'auto'>;
                  setSelectedTemplate(next);
                  setSelectedTransition(TEMPLATE_STYLES[next].defaultTransition);
                  emitToast(`${TEMPLATE_STYLES[next].label} applied.`);
                }}>
                  {templateOptions.map(option => <option key={option} value={option}>{TEMPLATE_STYLES[option].label}</option>)}
                </select>
              </label>
              <label>
                Transition
                <select value={activeTransition} onChange={event => setSelectedTransition(event.target.value as SlideshowTransition)}>
                  {transitionOptions.map(option => <option key={option} value={option}>{labelize(option)}</option>)}
                </select>
              </label>
              <label>
                Speed
                <select value={currentSpeed} onChange={event => setCurrentSpeed(event.target.value as SpeedMode)}>
                  <option value="slow">Slow Emotional</option>
                  <option value="balanced">Balanced</option>
                  <option value="fast">Fast Highlights</option>
                </select>
              </label>
              <label>
                Intensity
                <select value={currentIntensity} onChange={event => setCurrentIntensity(event.target.value as MotionIntensity)}>
                  <option value="soft">Soft</option>
                  <option value="premium">Premium</option>
                  <option value="dramatic">Dramatic</option>
                </select>
              </label>
            </motion.aside>
          )}
        </AnimatePresence>

        <div
          className="cinema-controls cinema-auto-chrome"
          onClick={event => event.stopPropagation()}
          onTouchStart={event => event.stopPropagation()}
          onTouchEnd={event => event.stopPropagation()}
        >
          <button onClick={goPrev} aria-label="Previous"><ChevronLeft size={18} /></button>
          <button className="cinema-play-button" onClick={togglePlaying} aria-label={isPlaying ? 'Pause slideshow' : 'Play slideshow'}>
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button onClick={goNext} aria-label="Next"><ChevronRight size={18} /></button>
          <button onClick={() => setZoom(value => Math.max(0.75, value - 0.12))} aria-label="Zoom out"><ZoomOut size={17} /></button>
          <button onClick={() => setZoom(value => Math.min(1.9, value + 0.12))} aria-label="Zoom in"><ZoomIn size={17} /></button>
          <button onClick={() => setRotation(value => value + 90)} aria-label="Rotate"><RotateCw size={17} /></button>
          <button onClick={() => setFitMode(value => value === 'contain' ? 'cover' : value === 'cover' ? 'smart' : 'contain')} aria-label="Fit / Fill toggle">
            <Expand size={17} />
            <span>{fitMode}</span>
          </button>
          <button onClick={() => setTreeOverlayOn(value => !value)} aria-label="Toggle tree overlay"><ImageIcon size={17} /></button>
          <button onClick={toggleFavorite} aria-label="Favorite" className={isFavorite ? 'is-active' : ''}><Heart size={17} fill={isFavorite ? 'currentColor' : 'none'} /></button>
          <button onClick={shareCurrent} aria-label="Share"><Share2 size={17} /></button>
          <button onClick={() => void downloadCurrent()} disabled={downloadLoading} aria-label={downloadLoading ? 'Preparing download' : 'Download'} title={downloadLoading ? 'Preparing download' : 'Save to device'}><Download size={17} /></button>
        </div>

        {sequence.length > 1 && (
          <div
            className="cinema-filmstrip cinema-auto-chrome"
            onClick={event => event.stopPropagation()}
            onTouchStart={event => event.stopPropagation()}
            onTouchEnd={event => event.stopPropagation()}
          >
            {sequence.map((item, index) => (
              <button
                key={item.id}
                onClick={() => setIndex(index)}
                className={index === currentIdx ? 'is-active' : ''}
                style={{ borderColor: index === currentIdx ? colors[0] : 'rgba(255,255,255,0.16)' }}
                aria-label={`Jump to slide ${index + 1}`}
              >
                {!item.driveFileId && item.thumbnail ? (
                  <img src={item.thumbnail} alt={item.title} loading="lazy" />
                ) : (
                  <div className="cinema-filmstrip-fallback">{item.type === 'video' ? <Play size={16} /> : <ImageIcon size={16} />}</div>
                )}
                <span>{index + 1}</span>
              </button>
            ))}
          </div>
        )}

        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              className="cinema-toast"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(content, document.body);
};

export default MemoryLightbox;
