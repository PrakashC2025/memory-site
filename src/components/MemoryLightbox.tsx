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
  MapPin,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCw,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Memory } from '../data/memories';

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
  | 'dream-dissolve';

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
};

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
];

const templateOptions: Exclude<SlideshowTemplate, 'auto'>[] = ['wedding', 'kids-birthday', 'birthday', 'baby', 'travel', 'college', 'family', 'nostalgia'];

const labelize = (value: string) => value.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

const isVideoMemory = (memory: Memory) => memory.type === 'video';

const makeDownloadFile = (memory: Memory) => {
  const payload = [
    memory.title,
    '',
    memory.caption,
    '',
    `Date: ${MONTH_NAMES[memory.month]} ${memory.year}`,
    memory.location ? `Location: ${memory.location}` : '',
    memory.event ? `Event: ${memory.event}` : '',
    `Media: ${memory.url}`,
  ].filter(Boolean).join('\n');
  const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
  return URL.createObjectURL(blob);
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
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [previewSrc, setPreviewSrc] = useState('');
  const [mediaSrc, setMediaSrc] = useState('');
  const [mediaFailed, setMediaFailed] = useState(false);
  const [highResReady, setHighResReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [progress, setProgress] = useState(0);
  const [fitMode, setFitMode] = useState<FitMode>('contain');
  const [captionsOn, setCaptionsOn] = useState(true);
  const [treeOverlayOn, setTreeOverlayOn] = useState(showTreeOverlay);
  const [muted, setMuted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState<SpeedMode>(speed);
  const [currentIntensity, setCurrentIntensity] = useState<MotionIntensity>(intensity);
  const [selectedTransition, setSelectedTransition] = useState<SlideshowTransition | null>(transitionStyle || null);
  const [selectedTemplate, setSelectedTemplate] = useState<Exclude<SlideshowTemplate, 'auto'> | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set(memories.filter(item => item.isFavorite).map(item => item.id)));
  const [toast, setToast] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const frameRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);
  const pausedAtRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
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
  }, [memory, sequence]);

  useEffect(() => {
    setIsPlaying(autoplay);
  }, [autoplay]);

  const current = sequence[currentIdx] || memory;
  const resolvedTemplate = useMemo(() => selectedTemplate || detectTemplate(current || null, template), [current, selectedTemplate, template]);
  const templateStyle = TEMPLATE_STYLES[resolvedTemplate];
  const activeTransition = selectedTransition || transitionStyle || templateStyle.defaultTransition;
  const colors = templateStyle.colors;
  const duration = SPEED_MS[currentSpeed];
  const transitionDuration = currentIntensity === 'dramatic' ? 0.95 : currentIntensity === 'soft' ? 0.48 : 0.68;

  const emitToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 1800);
  };

  useEffect(() => {
    if (!current) return;
    setImageLoaded(false);
    setMediaFailed(false);
    setHighResReady(false);
    if (isVideoMemory(current)) {
      setPreviewSrc('');
      setMediaSrc(current.url);
      return;
    }
    const quickPreview = current.thumbnail || current.url;
    setPreviewSrc(quickPreview);
    setMediaSrc(current.url);
  }, [current?.id, current?.url]);

  useEffect(() => {
    if (!current || isVideoMemory(current) || mediaFailed || !current.url) {
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
    if (!isVideoMemory(current) && current.url && previewSrc !== current.url) {
      setPreviewSrc(current.url);
      setImageLoaded(false);
      return;
    }
    setImageLoaded(true);
    setMediaFailed(true);
    emitToast('This memory media could not be loaded.');
  };

  const handleVideoError = () => {
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
      stopAmbientMusic();
    };
  }, [memory, stopAmbientMusic]);

  useEffect(() => {
    if (memory && isPlaying && !muted) startAmbientMusic();
    else stopAmbientMusic();
  }, [isPlaying, memory, muted, startAmbientMusic, stopAmbientMusic]);

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
      if (elapsed >= duration && !isVideoMemory(current)) {
        pausedAtRef.current = 0;
        goNext();
        return;
      }
      pausedAtRef.current = elapsed;
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [current, duration, goNext, isPlaying]);

  useEffect(() => {
    if (!current || !sequence.length) return;
    const preload = [sequence[(currentIdx + 1) % sequence.length], sequence[(currentIdx - 1 + sequence.length) % sequence.length]];
    preload.forEach(item => {
      if (item && !isVideoMemory(item)) {
        const img = new Image();
        img.src = item.url;
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
    setIsPlaying(value => !value);
    if (videoRef.current) {
      if (videoRef.current.paused) void videoRef.current.play().catch(() => emitToast('Tap play to allow video playback.'));
      else videoRef.current.pause();
    }
  };

  const toggleMute = () => {
    setMuted(value => {
      const next = !value;
      if (next) stopAmbientMusic();
      else if (isPlaying) startAmbientMusic();
      return next;
    });
  };

  const downloadCurrent = () => {
    if (!current) return;
    const url = makeDownloadFile(current);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${current.title.replace(/[^\w-]+/g, '-').toLowerCase()}-memory.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    emitToast('Download prepared for current memory.');
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
  const objectFit = fitMode === 'cover' ? 'cover' : 'contain';
  const mediaClass = `cinema-media cinema-media-${fitMode} cinema-frame-${templateStyle.frame}`;
  const zoomScale = zoom * (activeTransition === 'ken-burns' && isPlaying ? 1.035 : 1);
  const counter = `${currentIdx + 1} / ${sequence.length}`;
  const isStoryMode = mode === 'story';
  const baseImageSrc = previewSrc || current.thumbnail || current.url;
  const showHighResLayer = !isVideoMemory(current) && !mediaFailed && highResReady && mediaSrc && mediaSrc !== baseImageSrc;
  const progressSegments = sequence.map((_, index) => (index < currentIdx ? 100 : index === currentIdx ? progress : 0));
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
    let scaleFrames = [zoomScale, zoomScale * (1 + pulse), zoomScale * 1.012];
    let xFrames = [0, direction * drift * 0.42, direction * -drift * 0.24];
    let yFrames = [0, -lift, lift * 0.35];
    let rotateFrames = [rotation, rotation + direction * tilt, rotation + direction * tilt * 0.32];
    let filterFrames = [
      'brightness(0.96) saturate(1.04)',
      'brightness(1.04) saturate(1.12)',
      'brightness(1) saturate(1.06)',
    ];

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
    duration: isPlaying ? Math.max(duration / 1000, 4.8) : 0.42,
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
        className={`cinema-viewer cinema-template-${resolvedTemplate} cinema-mode-${mode}`}
        onClick={event => {
          if (event.target === event.currentTarget) onClose();
        }}
        onTouchStart={event => setTouchStart({ x: event.touches[0].clientX, y: event.touches[0].clientY })}
        onTouchEnd={event => handleTouchEnd(event.changedTouches[0].clientX, event.changedTouches[0].clientY)}
      >
        <div className="cinema-backdrop">
          <img src={current.thumbnail || current.url} alt="" aria-hidden="true" />
          <div className="cinema-backdrop-color" style={{ background: `radial-gradient(circle at 48% 35%, ${colors[0]}33, transparent 36%), radial-gradient(circle at 76% 65%, ${colors[1]}24, transparent 34%)` }} />
        </div>

        <div className={`cinema-particles cinema-particles-${templateStyle.particle}`} aria-hidden="true">
          {Array.from({ length: 12 }).map((_, index) => <span key={index} style={{ '--i': index } as React.CSSProperties} />)}
        </div>

        {treeOverlayOn && (
          <div className="cinema-tree-overlay" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}

        <div className="cinema-topbar">
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
            <button onClick={() => setSettingsOpen(value => !value)} aria-label="Toggle effects panel" title="Toggle effects panel">
              <SlidersHorizontal size={17} />
            </button>
            <button onClick={toggleFullscreen} aria-label="Fullscreen" title="Fullscreen">
              {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            <button onClick={onClose} aria-label="Close lightbox" title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="cinema-progress-rail">
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

        <button className="cinema-nav cinema-nav-left" onClick={goPrev} aria-label="Previous memory">
          <ChevronLeft size={26} />
        </button>
        <button className="cinema-nav cinema-nav-right" onClick={goNext} aria-label="Next memory">
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
          <AnimatePresence mode="wait">
            <motion.figure
              key={`${current.id}-${activeTransition}-${fitMode}`}
              variants={variant}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: transitionDuration, ease: [0.16, 1, 0.3, 1] }}
              className={mediaClass}
              style={{
                borderColor: `${colors[0]}66`,
                boxShadow: `0 0 90px ${colors[0]}33, 0 36px 120px rgba(0,0,0,0.72)`,
              }}
            >
              <div className="cinema-frame-glow" style={{ background: `radial-gradient(circle at 50% 18%, ${colors[0]}36 0%, transparent 72%)` }} />
              <div className="cinema-frame-reflection" style={{ background: `linear-gradient(125deg, rgba(255,255,255,0.22), transparent 30%, transparent 62%, ${colors[1]}18 100%)` }} />
              {!imageLoaded && (
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
                    ref={videoRef}
                    src={mediaSrc || current.url}
                    poster={current.thumbnail}
                    controls
                    autoPlay={isPlaying}
                    muted={muted}
                    playsInline
                    onLoadedData={markMediaLoaded}
                    onError={handleVideoError}
                    onEnded={goNext}
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
                      style={{ objectFit, opacity: imageLoaded ? 1 : 0 }}
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
          {settingsOpen && (
            <motion.aside
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              className="cinema-settings-panel"
              aria-label="Slideshow settings"
            >
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

        <div className="cinema-controls">
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
          <button onClick={downloadCurrent} aria-label="Download"><Download size={17} /></button>
        </div>

        {sequence.length > 1 && (
          <div className="cinema-filmstrip hide-scroll">
            {sequence.map((item, index) => (
              <button
                key={item.id}
                onClick={() => setIndex(index)}
                className={index === currentIdx ? 'is-active' : ''}
                style={{ borderColor: index === currentIdx ? colors[0] : 'rgba(255,255,255,0.16)' }}
                aria-label={`Jump to slide ${index + 1}`}
              >
                <img src={item.thumbnail} alt={item.title} loading="lazy" />
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
