import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Music2, Pause, Play, RotateCcw, Search, Upload, X } from 'lucide-react';
import type { Memory } from '../data/memories';
import { googleDriveService, type DriveAudioFile } from '../services/googleDriveService';
import { searchOpenSourceMusic, type OpenSourceMusicTrack } from '../services/openSourceMusic';

export interface MemoryReelTitle {
  line?: string;
  big?: string;
}

interface ReelSource {
  id: string;
  src: string;
  fallbackSrc?: string;
  type: 'image' | 'video';
  label: string;
}

interface MemoryReelProps {
  memories: Memory[];
  title?: MemoryReelTitle;
  audio?: string;
  autoPlay?: boolean;
  loop?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onNeedMore?: () => void;
  driveAccessToken?: string;
  driveFolderId?: string;
  driveFolders?: Array<{ id: string; name: string }>;
  onDriveFolderChange?: (folderId: string) => void;
  onClose?: () => void;
}

interface MemoryReelOptions {
  items: ReelSource[];
  title?: MemoryReelTitle;
  audio?: string;
  hold?: number;
  move?: number;
  loop?: boolean;
  reducedMotion?: boolean;
  onProgress?: (progress: number, total: number) => void;
  onStateChange?: (playing: boolean) => void;
}

interface LoadedMedia {
  node: HTMLImageElement | HTMLVideoElement;
  video?: HTMLVideoElement;
  aspect: number;
}

interface ReelCard {
  card: HTMLDivElement;
  x: number;
  y: number;
  z: number;
  rot: number;
  width: number;
  height: number;
  video?: HTMLVideoElement;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const ease = (value: number) => value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
const escapeHtml = (value: string) => String(value).replace(/[&<>\"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character] || character));

/**
 * The camera-wall controller ported from the supplied memoriya-reel.html.
 * It intentionally uses the same card layout, snake path, easing, pull-back,
 * push-in, sway, and distance-based depth of field as the reference reel.
 */
export class MemoryReelController {
  private readonly el: HTMLElement;
  private readonly options: Required<Pick<MemoryReelOptions, 'hold' | 'move' | 'loop' | 'reducedMotion'>> & MemoryReelOptions;
  private world: HTMLDivElement;
  private ambient: HTMLDivElement;
  private ambientSource = '';
  private titleEl: HTMLDivElement;
  private progressEl: HTMLDivElement;
  private poster: HTMLDivElement;
  private resizeObserver?: ResizeObserver;
  private resizeHandler?: () => void;
  private cards: ReelCard[] = [];
  private raf = 0;
  private loadGeneration = 0;
  private destroyed = false;
  private last = 0;
  private scale = 1;
  private elapsed = 0;
  private paused = true;
  private total = 0;
  private audio?: HTMLAudioElement;
  private audioQueue: string[] = [];
  private audioIndex = 0;

  constructor(el: HTMLElement, options: MemoryReelOptions) {
    this.el = el;
    this.options = {
      // Give every loaded photo a complete six-second focus before the
      // camera starts its transition to the next frame.
      hold: 6,
      move: 1.2,
      loop: false,
      reducedMotion: false,
      ...options,
    };
    this.world = Object.assign(document.createElement('div'), { className: 'world' });
    this.ambient = Object.assign(document.createElement('div'), { className: 'ambient' });
    const vignette = Object.assign(document.createElement('div'), { className: 'vignette' });
    this.titleEl = Object.assign(document.createElement('div'), { className: 'title' });
    this.progressEl = Object.assign(document.createElement('div'), { className: 'prog' });
    const tap = Object.assign(document.createElement('button'), { className: 'tap', ariaLabel: 'Play or pause' });
    this.poster = Object.assign(document.createElement('div'), { className: 'poster', innerHTML: '<span>▶</span>' });
    tap.onclick = () => this.paused ? this.play() : this.pause();
    this.poster.onclick = () => this.play();
    this.el.innerHTML = '';
    this.el.append(this.world, this.ambient, vignette, this.titleEl, this.progressEl, tap, this.poster);
    if (this.options.audio) this.setAudio(this.options.audio);

    this.resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => this.resize())
      : undefined;
    if (this.resizeObserver) this.resizeObserver.observe(el);
    else {
      this.resizeHandler = () => this.resize();
      window.addEventListener('resize', this.resizeHandler, { passive: true });
    }
  }

  async setItems(items: ReelSource[], preserveProgress = false) {
    const generation = ++this.loadGeneration;
    const wasPlaying = !this.paused;
    const previousElapsed = this.elapsed;
    this.pause();
    this.world.innerHTML = '';
    this.cards = [];
    if (!items.length) {
      this.options.onProgress?.(0, 0);
      return;
    }

    let ready = false;
    let resolveReady: () => void = () => undefined;
    const readyPromise = new Promise<void>(resolve => { resolveReady = resolve; });
    const loaded: LoadedMedia[] = [];
    const reveal = (media: LoadedMedia) => {
      if (this.destroyed || generation !== this.loadGeneration) return;
      loaded.push(media);
      this.rebuildWall(loaded, preserveProgress || loaded.length > 1, previousElapsed, wasPlaying);
      if (!ready) {
        ready = true;
        resolveReady();
      }
    };

    void Promise.all(items.map(async item => {
      const media = await this.load(item);
      if (media) reveal(media);
    })).then(() => {
      if (!ready) {
        ready = true;
        resolveReady();
      }
    });
    await readyPromise;
  }

  private rebuildWall(loaded: LoadedMedia[], preserveProgress: boolean, previousElapsed: number, wasPlaying: boolean) {
    const columns = Math.max(3, Math.ceil(Math.sqrt(loaded.length * 1.25)));
    const rows = Math.max(1, Math.ceil(loaded.length / columns));
    // Keep neighboring cards inside the 16:9 viewport so the focused frame
    // is surrounded by real memories instead of empty black space.
    const sx = 620;
    const sy = 460;
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    this.cards.forEach(card => card.video?.pause());
    this.world.innerHTML = '';
    this.cards = [];
    const wallCards = loaded.map((media, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      // Give portrait and square media a taller frame so the complete image
      // can breathe without forcing it into a landscape crop.
      const height = media.aspect < 0.9 ? 420 : media.aspect < 1.15 ? 400 : 360;
      const width = Math.min(560, Math.max(300, height * media.aspect));
      const card = document.createElement('div');
      card.className = `card${random() < 0.16 ? ' frame' : ''}`;
      card.style.width = `${width}px`;
      card.style.height = `${height}px`;
      card.appendChild(media.node);
      const x = (column - (columns - 1) / 2) * sx + (random() - 0.5) * 120;
      const y = (row - (rows - 1) / 2) * sy + (random() - 0.5) * 100;
      // Keep cards on one plane. A large depth spread makes a nearby card
      // grow over the focused card and hide part of it.
      const z = 0;
      const rot = (random() - 0.5) * 20;
      card.style.transform = `translate3d(${x - width / 2}px,${y - height / 2}px,${z}px) rotateZ(${rot}deg)`;
      card.style.transformOrigin = `${width / 2}px ${height / 2}px`;
      return { card, x, y, z, rot, width, height, video: media.video } satisfies ReelCard;
    });

    // Shuffle camera targets without changing the spacing of the photo wall.
    for (let index = wallCards.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [wallCards[index], wallCards[swapIndex]] = [wallCards[swapIndex], wallCards[index]];
    }
    wallCards.forEach(card => {
      this.world.appendChild(card.card);
      this.cards.push(card);
    });

    this.total = this.cards.length * (this.options.hold + this.options.move) - this.options.move + 2.6;
    this.elapsed = preserveProgress ? Math.min(previousElapsed, this.total) : 0;
    this.resize();
    this.render(this.elapsed);
    if (wasPlaying) this.play();
  }

  private load(item: ReelSource): Promise<LoadedMedia | null> {
    return new Promise(resolve => {
      const isVideo = item.type === 'video' || /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(item.src);
      let finished = false;
      let attemptedFallback = false;
      const timer = window.setTimeout(() => finish(null), 12000);
      const finish = (value: LoadedMedia | null) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        resolve(value);
      };

      if (isVideo) {
        const video = document.createElement('video');
        Object.assign(video, { src: item.src, muted: true, loop: true, playsInline: true, preload: 'auto' });
        video.className = 'm';
        video.crossOrigin = 'anonymous';
        video.onloadedmetadata = () => finish({ node: video, video, aspect: video.videoWidth / video.videoHeight || 1.6 });
        video.onerror = () => finish(null);
      } else {
        const image = new Image();
        image.className = 'm';
        image.decoding = 'async';
        image.crossOrigin = 'anonymous';
        image.onload = () => finish({ node: image, aspect: image.naturalWidth / image.naturalHeight || 1.5 });
        image.onerror = () => {
          if (item.fallbackSrc && !attemptedFallback) {
            attemptedFallback = true;
            image.src = item.fallbackSrc;
            return;
          }
          finish(null);
        };
        image.src = item.src;
      }
    });
  }

  private resize() {
    this.scale = this.el.clientHeight > 0 ? this.el.clientHeight / 720 : 1;
  }

  play() {
    if (!this.cards.length || this.destroyed || !this.paused && this.raf) return;
    if (this.elapsed >= this.total) this.elapsed = 0;
    this.paused = false;
    this.poster.classList.add('off');
    this.options.onStateChange?.(true);
    this.last = performance.now();
    void this.audio?.play().catch(() => undefined);
    const tick = (now: number) => {
      if (this.paused || this.destroyed) return;
      this.elapsed += (now - this.last) / 1000;
      this.last = now;
      if (this.elapsed >= this.total) {
        if (this.options.loop) this.elapsed = 0;
        else {
          this.elapsed = this.total;
          this.render(this.elapsed);
          this.paused = true;
          this.options.onStateChange?.(false);
          this.cards.forEach(card => card.video?.pause());
          this.audio?.pause();
          return;
        }
      }
      this.render(this.elapsed);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause() {
    this.paused = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.poster.classList.remove('off');
    this.cards.forEach(card => card.video?.pause());
    this.audio?.pause();
    this.options.onStateChange?.(false);
  }

  restart() {
    this.elapsed = 0;
    this.titleEl.classList.remove('on');
    this.pause();
    this.render(0);
    this.play();
  }

  setTitle(title?: MemoryReelTitle) {
    this.options.title = title;
    this.titleEl.innerHTML = title
      ? `<small>${escapeHtml(title.line || '')}</small><b>${escapeHtml(title.big || '')}</b>`
      : '';
  }

  setAudio(source?: string) {
    this.setAudioQueue(source ? [source] : []);
  }

  setAudioQueue(sources: string[], keepCurrent = true) {
    const shouldResume = !this.paused;
    const currentSource = this.audioQueue[this.audioIndex];
    this.audioQueue = sources.filter(Boolean);
    const currentIndex = currentSource ? this.audioQueue.indexOf(currentSource) : -1;
    this.audioIndex = keepCurrent && currentIndex >= 0 ? currentIndex : 0;
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio.src = '';
    }
    this.audio = this.audioQueue.length ? new Audio(this.audioQueue[this.audioIndex]) : undefined;
    if (this.audio) {
      this.audio.loop = false;
      this.audio.onended = () => this.advanceAudio();
    }
    if (shouldResume) void this.audio?.play().catch(() => undefined);
  }

  nextAudio() {
    this.advanceAudio();
  }

  setLoop(loop: boolean) {
    this.options.loop = loop;
  }

  private advanceAudio() {
    if (!this.audioQueue.length) return;
    if (this.audioIndex < this.audioQueue.length - 1) this.audioIndex += 1;
    else if (this.options.loop) this.audioIndex = 0;
    else return;
    const shouldResume = !this.paused;
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
    }
    this.audio = new Audio(this.audioQueue[this.audioIndex]);
    this.audio.loop = false;
    this.audio.onended = () => this.advanceAudio();
    if (shouldResume) void this.audio.play().catch(() => undefined);
  }

  getProgress() {
    return { progress: this.elapsed, total: this.total };
  }

  destroy() {
    this.destroyed = true;
    this.loadGeneration += 1;
    this.pause();
    this.resizeObserver?.disconnect();
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    this.audio?.pause();
    if (this.audio) this.audio.onended = null;
    this.audio = undefined;
    this.world.innerHTML = '';
    this.cards = [];
  }

  private target(index: number) {
    const card = this.cards[index];
    return card ? { x: card.x, y: card.y, z: card.z, rot: card.rot } : { x: 0, y: 0, z: 0, rot: 0 };
  }

  private render(time: number) {
    const { hold, move } = this.options;
    const step = hold + move;
    const count = this.cards.length;
    if (!count) return;

    let shot = Math.min(count - 1, Math.floor(time / step));
    let local = time - shot * step;
    let from = this.target(shot);
    let to = from;
    let progress = 1;
    let dip = 0;
    let holdProgress = 0;

    if (shot === 0 && local < hold) {
      holdProgress = local / hold;
    } else if (shot === 0) {
      holdProgress = local / hold;
    } else if (local < move) {
      from = this.target(shot - 1);
      to = this.target(shot);
      progress = ease(local / move);
      dip = Math.sin(Math.PI * (local / move));
    } else {
      holdProgress = (local - move) / hold;
    }

    if (this.options.reducedMotion) {
      const visibleShot = shot > 0 && local < move && progress < 0.5 ? shot - 1 : shot;
      this.world.style.transform = `scale(${this.scale}) translate3d(0,0,0)`;
      this.cards.forEach((card, index) => {
        card.card.style.transform = `translate3d(${-card.width / 2}px,${-card.height / 2}px,0)`;
        card.card.style.opacity = index === visibleShot ? '1' : '0';
        card.card.style.filter = 'none';
        if (card.video) {
          if (index === visibleShot && !this.paused) void card.video.play().catch(() => undefined);
          else card.video.pause();
        }
      });
      shot = visibleShot;
    } else {
      const camera = {
        x: lerp(from.x, to.x, progress),
        y: lerp(from.y, to.y, progress),
        z: lerp(from.z, to.z, progress),
        rot: lerp(from.rot, to.rot, progress),
      };
      const push = 100 + clamp(holdProgress, 0, 1) * 180 - dip * 360;
      const sway = Math.sin(time * 0.7) * 3 * (1 - dip);
      this.world.style.transform = `scale(${this.scale}) translate3d(0,0,${push}px) rotateY(${-6 + sway}deg) rotateZ(${-camera.rot * 0.9}deg) translate3d(${-camera.x}px,${-camera.y}px,${-camera.z}px)`;
      const flyBlur = dip * 5;
      let focusedIndex = 0;
      let focusedDistance = Number.POSITIVE_INFINITY;
      this.cards.forEach((card, index) => {
        const distance = Math.hypot(card.x - camera.x, card.y - camera.y);
        if (distance < focusedDistance) {
          focusedDistance = distance;
          focusedIndex = index;
        }
        const blur = clamp((distance - 360) / 100, 0, 5) + (distance > 360 ? flyBlur * 0.65 : 0);
        const near = distance < 200;
        card.card.style.opacity = '1';
        card.card.style.zIndex = index === focusedIndex ? '20' : '1';
        card.card.style.filter = (blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : '') + (near ? '' : ' brightness(.9)');
        if (card.video) {
          const active = near && !this.paused;
          if (active && card.video.paused) void card.video.play().catch(() => undefined);
          else if (!active && !card.video.paused) card.video.pause();
        }
      });
      this.cards.forEach((card, index) => {
        card.card.style.zIndex = index === focusedIndex ? '20' : '1';
      });
      const focusedMedia = this.cards[focusedIndex]?.card.querySelector<HTMLImageElement | HTMLVideoElement>('.m');
      const ambientSource = focusedMedia?.currentSrc || focusedMedia?.getAttribute('src') || '';
      if (ambientSource && ambientSource !== this.ambientSource) {
        this.ambientSource = ambientSource;
        this.ambient.style.backgroundImage = `url("${ambientSource.replace(/"/g, '\\"')}")`;
      }
    }

    if (!this.titleEl.innerHTML && this.options.title) this.setTitle(this.options.title);
    const showTitle = shot === count - 1 && local > move + 0.4 && Boolean(this.options.title);
    this.titleEl.classList.toggle('on', showTitle);
    this.progressEl.style.width = `${clamp(time / this.total, 0, 1) * 100}%`;
    this.options.onProgress?.(time, this.total);
  }
}

const isVideoMemory = (memory: Memory) => memory.type === 'video' || Boolean(memory.mimeType?.startsWith('video/'));

const resolveReelSources = async (memories: Memory[], signal: AbortSignal) => {
  const sources = memories.flatMap(memory => {
    const video = isVideoMemory(memory);
    const preview = video ? memory.url || memory.thumbnail : memory.thumbnail || memory.url;
    if (!preview) return [];
    const authenticatedFallback = !video && memory.driveFileId && memory.authToken && memory.url !== preview
      ? memory.url
      : undefined;
    return [{
      id: memory.id,
      src: preview,
      fallbackSrc: authenticatedFallback,
      type: video ? 'video' : 'image',
      label: memory.title,
    } satisfies ReelSource];
  });
  return signal.aborted ? [] : sources;
};

interface MusicQueueItem {
  id: string;
  src: string;
  label: string;
  owned?: boolean;
  source?: 'local' | 'online' | 'drive';
  driveFileId?: string;
}

const driveAudioUrl = (fileId: string, accessToken: string) =>
  `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&access_token=${encodeURIComponent(accessToken)}`;

const MemoryReel: React.FC<MemoryReelProps> = ({ memories, title, audio, autoPlay = true, loop = true, hasMore = false, loadingMore = false, onNeedMore, driveAccessToken, driveFolderId, driveFolders, onDriveFolderChange, onClose }) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<MemoryReelController | null>(null);
  const audioObjectUrlsRef = useRef<string[]>([]);
  const [resolvedSources, setResolvedSources] = useState<ReelSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState({ progress: 0, total: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [titleDraft, setTitleDraft] = useState<MemoryReelTitle>({ line: title?.line || '', big: title?.big || '' });
  const [activeTitle, setActiveTitle] = useState<MemoryReelTitle | undefined>(title);
  const [musicOpen, setMusicOpen] = useState(false);
  const [musicQuery, setMusicQuery] = useState('');
  const [musicResults, setMusicResults] = useState<OpenSourceMusicTrack[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [driveSongs, setDriveSongs] = useState<DriveAudioFile[]>([]);
  const [driveSongsLoading, setDriveSongsLoading] = useState(false);
  const [driveUploadLoading, setDriveUploadLoading] = useState(false);
  const [musicError, setMusicError] = useState('');
  const [musicName, setMusicName] = useState('');
  const [musicQueue, setMusicQueue] = useState<MusicQueueItem[]>(() => audio ? [{ id: 'initial-audio', src: audio, label: 'Background music' }] : []);
  const [loopEnabled, setLoopEnabled] = useState(loop);
  const reducedMotion = usePrefersReducedMotion();
  const moreRequestedRef = useRef(false);
  const hasLoadedSourcesRef = useRef(false);
  const moreConfigRef = useRef({ hasMore, loadingMore, onNeedMore });
  moreConfigRef.current = { hasMore, loadingMore, onNeedMore };

  useEffect(() => {
    setTitleDraft({ line: title?.line || '', big: title?.big || '' });
    setActiveTitle(title);
  }, [title?.line, title?.big]);

  useEffect(() => {
    const controller = new AbortController();
    const photos = memories.filter(memory => !isVideoMemory(memory));
    const videos = memories.filter(memory => isVideoMemory(memory));
    setLoading(true);
    setResolvedSources([]);
    void (async () => {
      const photoSources = await resolveReelSources(photos, controller.signal);
      if (controller.signal.aborted) return;
      setResolvedSources(photoSources);
      if (photoSources.length) setLoading(false);

      // Videos are intentionally appended after the photo wall is ready so a
      // large video cannot delay the first visual sequence.
      const videoSources = await resolveReelSources(videos, controller.signal);
      if (controller.signal.aborted) return;
      setResolvedSources(current => [...current, ...videoSources]);
      if (!photoSources.length) setLoading(false);
    })();
    return () => {
      controller.abort();
    };
  }, [memories]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const controller = new MemoryReelController(stage, {
      items: [],
      title: activeTitle,
      audio: undefined,
      loop: loopEnabled,
      reducedMotion,
      onProgress: (current, total) => {
        setProgress({ progress: current, total });
        const more = moreConfigRef.current;
        if (more.hasMore && !more.loadingMore && !moreRequestedRef.current && total > 0 && current / total >= 0.55) {
          moreRequestedRef.current = true;
          more.onNeedMore?.();
        }
      },
      onStateChange: setPlaying,
    });
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [audio, reducedMotion]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || !resolvedSources.length) return;
    const preserveProgress = hasLoadedSourcesRef.current;
    hasLoadedSourcesRef.current = true;
    void controller.setItems(resolvedSources, preserveProgress).then(() => {
      if (autoPlay && !preserveProgress) controller.play();
    });
  }, [autoPlay, resolvedSources]);

  useEffect(() => {
    controllerRef.current?.setLoop(loopEnabled);
  }, [loopEnabled]);

  useEffect(() => {
    controllerRef.current?.setAudioQueue(musicQueue.map(track => track.src));
  }, [musicQueue]);

  useEffect(() => {
    moreRequestedRef.current = false;
  }, [memories.length, hasMore]);

  useEffect(() => {
    controllerRef.current?.setTitle(activeTitle);
  }, [activeTitle]);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(document.fullscreenElement === stageRef.current?.parentElement);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  useEffect(() => () => {
    audioObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    audioObjectUrlsRef.current = [];
  }, []);

  const toggleFullscreen = async () => {
    const shell = stageRef.current?.parentElement;
    if (!shell) return;
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    else await shell.requestFullscreen?.().catch(() => undefined);
  };

  const chooseMusicFiles = (files: FileList | File[]) => {
    const nextFiles = Array.from(files || []).filter(file => file.type.startsWith('audio/'));
    if (!nextFiles.length) return;
    const nextTracks = nextFiles.map((file, index) => {
      const src = URL.createObjectURL(file);
      audioObjectUrlsRef.current.push(src);
      return { id: `local-audio-${file.name}-${file.lastModified}-${index}`, src, label: file.name, owned: true, source: 'local' } satisfies MusicQueueItem;
    });
    setMusicName(nextTracks[0].label);
    setMusicQueue(current => [...current, ...nextTracks]);
  };

  const chooseMusicTrack = (track: OpenSourceMusicTrack) => {
    setMusicName(`${track.title} · ${track.artist}`);
    setMusicQueue(current => current.some(item => item.src === track.previewUrl)
      ? current
      : [...current, { id: track.id, src: track.previewUrl, label: `${track.title} · ${track.artist}` }]);
  };

  const moveMusic = (index: number, direction: -1 | 1) => {
    setMusicQueue(current => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const removeMusic = (index: number) => {
    setMusicQueue(current => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const loadDriveSongs = async () => {
    if (!driveAccessToken) {
      setMusicError('Connect Google Drive to load songs stored there.');
      return;
    }
    setDriveSongsLoading(true);
    setMusicError('');
    try {
      setDriveSongs(await googleDriveService.listAudioFiles(driveAccessToken));
    } catch (error) {
      setMusicError(error instanceof Error ? error.message : 'Drive songs could not be loaded.');
    } finally {
      setDriveSongsLoading(false);
    }
  };

  const chooseDriveSong = (song: DriveAudioFile) => {
    if (!driveAccessToken) return;
    const src = driveAudioUrl(song.id, driveAccessToken);
    setMusicName(song.name);
    setMusicQueue(current => current.some(item => item.driveFileId === song.id)
      ? current
      : [...current, { id: `drive-audio-${song.id}`, src, label: song.name, source: 'drive', driveFileId: song.id }]);
  };

  const uploadSongsToDrive = async (files: FileList | File[]) => {
    if (!driveAccessToken) {
      setMusicError('Connect Google Drive before uploading songs.');
      return;
    }
    const nextFiles = Array.from(files || []).filter(file => file.type.startsWith('audio/'));
    if (!nextFiles.length) return;
    setDriveUploadLoading(true);
    setMusicError('');
    try {
      const uploadedTracks: MusicQueueItem[] = [];
      for (const file of nextFiles) {
        const uploaded = await googleDriveService.uploadMedia(driveAccessToken, file);
        uploadedTracks.push({
          id: `drive-audio-${uploaded.id}`,
          src: driveAudioUrl(uploaded.id, driveAccessToken),
          label: uploaded.name || file.name,
          source: 'drive',
          driveFileId: uploaded.id,
        });
      }
      setMusicName(uploadedTracks[0]?.label || '');
      setMusicQueue(current => [...current, ...uploadedTracks.filter(track => !current.some(item => item.driveFileId === track.driveFileId))]);
      await loadDriveSongs();
    } catch (error) {
      setMusicError(error instanceof Error ? error.message : 'Song upload failed.');
    } finally {
      setDriveUploadLoading(false);
    }
  };

  const searchMusic = async () => {
    if (!musicQuery.trim()) return;
    setMusicLoading(true);
    setMusicError('');
    try {
      setMusicResults(await searchOpenSourceMusic(musicQuery));
    } finally {
      setMusicLoading(false);
    }
  };

  const applyTitle = () => {
    setActiveTitle({ line: titleDraft.line?.trim() || '', big: titleDraft.big?.trim() || '' });
  };

  const openMusic = () => {
    const next = !musicOpen;
    setMusicOpen(next);
    if (next && driveAccessToken && !driveSongs.length && !driveSongsLoading) void loadDriveSongs();
  };

  return (
    <div className="memory-reel-overlay" role="dialog" aria-modal="true" aria-label="Memory story reel">
      <div className="memory-reel-shell">
        <div ref={stageRef} className="reel memory-reel-stage" />
        <div className="memory-reel-toolbar">
          <button type="button" onClick={() => playing ? controllerRef.current?.pause() : controllerRef.current?.play()} disabled={loading}>
            {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" onClick={() => controllerRef.current?.restart()} disabled={loading}><RotateCcw size={16} /> Replay</button>
          <button type="button" onClick={toggleFullscreen}><>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</> {fullscreen ? 'Exit' : 'Fullscreen'}</button>
          <button type="button" className={musicOpen ? 'is-active' : ''} aria-expanded={musicOpen} onClick={openMusic}><Music2 size={16} /> Music {musicQueue.length ? `(${musicQueue.length})` : ''}</button>
          {driveFolders && driveFolders.length > 0 && onDriveFolderChange && (
            <label className="memory-reel-folder-picker"><span>Drive folder</span><select value={driveFolderId || ''} onChange={event => onDriveFolderChange(event.target.value)} aria-label="Choose Story Mode Drive folder"><option value="">All My Drive photos</option>{driveFolders.filter(folder => folder.id).map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
          )}
          <button type="button" onClick={() => setLoopEnabled(value => !value)} aria-pressed={loopEnabled}>{loopEnabled ? 'Loop On' : 'Loop Off'}</button>
          {onClose && <button type="button" className="memory-reel-close" onClick={onClose}><X size={17} /> Close</button>}
        </div>
        <div className="memory-reel-progress-text">{loading ? 'Preparing your memories…' : `${Math.round(progress.progress)}s / ${Math.round(progress.total)}s`}</div>
        <div className="memory-reel-editor">
          <input aria-label="Story title line" value={titleDraft.line || ''} onChange={event => setTitleDraft(current => ({ ...current, line: event.target.value }))} placeholder="Title line" />
          <input aria-label="Story big text" value={titleDraft.big || ''} onChange={event => setTitleDraft(current => ({ ...current, big: event.target.value }))} placeholder="Big text" />
          <button type="button" onClick={applyTitle}>Apply title</button>
        </div>
        {musicOpen && (
          <div className="memory-reel-music-panel">
            <div className="memory-reel-music-search">
              <input value={musicQuery} onChange={event => setMusicQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void searchMusic(); }} placeholder="Search free music…" />
              <button type="button" onClick={() => void searchMusic()} disabled={musicLoading}><Search size={15} /> {musicLoading ? 'Searching…' : 'Search'}</button>
              <label className="memory-reel-upload"><Upload size={15} /> Add local songs<input type="file" accept="audio/*" multiple onChange={event => { chooseMusicFiles(event.target.files || []); event.currentTarget.value = ''; }} /></label>
              <label className="memory-reel-upload memory-reel-drive-upload"><Upload size={15} /> {driveUploadLoading ? 'Uploading...' : 'Upload songs to Drive'}<input type="file" accept="audio/*" multiple disabled={driveUploadLoading || !driveAccessToken} onChange={event => { void uploadSongsToDrive(event.target.files || []); event.currentTarget.value = ''; }} /></label>
              {driveAccessToken && <button type="button" onClick={() => void loadDriveSongs()} disabled={driveSongsLoading}><Search size={15} /> {driveSongsLoading ? 'Loading Drive songs...' : 'Load Drive songs'}</button>}
            </div>
            <p className="memory-reel-music-note">Only photos and videos appear in the story. Songs are used as the audio queue.</p>
            {musicError && <p className="memory-reel-music-error" role="alert">{musicError}</p>}
            {musicName && <p className="memory-reel-current-music">Now selected: {musicName}</p>}
            {musicQueue.length > 0 && (
              <div className="memory-reel-queue">
                {musicQueue.map((track, index) => (
                  <div className="memory-reel-queue-item" key={track.id}>
                    <span><b>{index + 1}.</b> {track.label}</span>
                    <div>
                      <button type="button" onClick={() => moveMusic(index, -1)} disabled={index === 0} aria-label="Move song earlier">↑</button>
                      <button type="button" onClick={() => moveMusic(index, 1)} disabled={index === musicQueue.length - 1} aria-label="Move song later">↓</button>
                      <button type="button" onClick={() => removeMusic(index)} aria-label="Remove song">×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!musicQueue.length && !driveSongs.length && !musicResults.length && !musicError && (
              <p className="memory-reel-music-note">No song selected yet. Add a local song, search free music, or load songs from Drive.</p>
            )}
            {driveSongs.length > 0 && (
              <div className="memory-reel-drive-songs">
                <div className="memory-reel-music-heading">Songs stored in Drive</div>
                {driveSongs.map(song => (
                  <button type="button" className="memory-reel-track" key={song.id} onClick={() => chooseDriveSong(song)}>
                    <strong>{song.name}</strong><span>Drive audio · click to add to queue</span>
                  </button>
                ))}
              </div>
            )}
            {musicResults.map(track => (
              <button type="button" className="memory-reel-track" key={track.id} onClick={() => chooseMusicTrack(track)}>
                <strong>{track.title}</strong><span>{track.artist}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
};

export default MemoryReel;
