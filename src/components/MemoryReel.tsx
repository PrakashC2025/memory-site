import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Pause, Play, RotateCcw, Search, Upload, X } from 'lucide-react';
import type { Memory } from '../data/memories';
import { searchOpenSourceMusic, type OpenSourceMusicTrack } from '../services/openSourceMusic';
import { withMediaFetch } from '../utils/mediaQueue';

export interface MemoryReelTitle {
  line?: string;
  big?: string;
}

interface ReelSource {
  src: string;
  type: 'image' | 'video';
}

interface MemoryReelProps {
  memories: Memory[];
  title?: MemoryReelTitle;
  audio?: string;
  autoPlay?: boolean;
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

  constructor(el: HTMLElement, options: MemoryReelOptions) {
    this.el = el;
    this.options = {
      hold: 1.7,
      move: 1.2,
      loop: false,
      reducedMotion: false,
      ...options,
    };
    this.world = Object.assign(document.createElement('div'), { className: 'world' });
    const vignette = Object.assign(document.createElement('div'), { className: 'vignette' });
    this.titleEl = Object.assign(document.createElement('div'), { className: 'title' });
    this.progressEl = Object.assign(document.createElement('div'), { className: 'prog' });
    const tap = Object.assign(document.createElement('button'), { className: 'tap', ariaLabel: 'Play or pause' });
    this.poster = Object.assign(document.createElement('div'), { className: 'poster', innerHTML: '<span>▶</span>' });
    tap.onclick = () => this.paused ? this.play() : this.pause();
    this.poster.onclick = () => this.play();
    this.el.innerHTML = '';
    this.el.append(this.world, vignette, this.titleEl, this.progressEl, tap, this.poster);
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

  async setItems(items: ReelSource[]) {
    const generation = ++this.loadGeneration;
    this.pause();
    this.world.innerHTML = '';
    this.cards = [];
    const loaded = await Promise.all(items.map(item => this.load(item)));
    if (this.destroyed || generation !== this.loadGeneration) return;
    const ok = loaded.filter((item): item is LoadedMedia => Boolean(item));
    if (!ok.length) {
      this.options.onProgress?.(0, 0);
      return;
    }

    const columns = Math.max(2, Math.round(Math.sqrt(ok.length * 1.5)));
    const sx = 560;
    const sy = 400;
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    ok.forEach((media, index) => {
      const row = Math.floor(index / columns);
      let column = index % columns;
      if (row % 2) column = columns - 1 - column;
      const height = 380;
      const width = Math.min(620, Math.max(300, height * media.aspect));
      const card = document.createElement('div');
      card.className = `card${random() < 0.16 ? ' frame' : ''}`;
      card.style.width = `${width}px`;
      card.style.height = `${height}px`;
      card.appendChild(media.node);
      const x = column * sx + (random() - 0.5) * 150;
      const y = row * sy + (random() - 0.5) * 120;
      const z = -random() * 160;
      const rot = (random() - 0.5) * 30;
      card.style.transform = `translate3d(${x - width / 2}px,${y - height / 2}px,${z}px) rotateZ(${rot}deg)`;
      card.style.transformOrigin = `${width / 2}px ${height / 2}px`;
      this.world.appendChild(card);
      this.cards.push({ card, x, y, z, rot, width, height, video: media.video });
    });

    this.total = this.cards.length * (this.options.hold + this.options.move) - this.options.move + 2.6;
    this.resize();
    this.render(0);
  }

  private load(item: ReelSource): Promise<LoadedMedia | null> {
    return new Promise(resolve => {
      const isVideo = item.type === 'video' || /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(item.src);
      let finished = false;
      const timer = window.setTimeout(() => {
        if (!finished) {
          finished = true;
          resolve(null);
        }
      }, 14000);
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
        image.onerror = () => finish(null);
        image.src = item.src;
      }
    });
  }

  private resize() {
    this.scale = this.el.clientHeight > 0 ? this.el.clientHeight / 720 : 1;
  }

  play() {
    if (!this.cards.length || this.destroyed || !this.paused && this.raf) return;
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
    const shouldResume = !this.paused;
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
    }
    this.audio = source ? new Audio(source) : undefined;
    if (this.audio) this.audio.loop = true;
    if (shouldResume) void this.audio?.play().catch(() => undefined);
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
      const push = 40 + clamp(holdProgress, 0, 1) * 60 - dip * 300;
      const sway = Math.sin(time * 0.7) * 3 * (1 - dip);
      this.world.style.transform = `scale(${this.scale}) translate3d(0,0,${push}px) rotateY(${-6 + sway}deg) rotateZ(${-camera.rot * 0.9}deg) translate3d(${-camera.x}px,${-camera.y}px,${-camera.z}px)`;
      const flyBlur = dip * 5;
      this.cards.forEach(card => {
        const distance = Math.hypot(card.x - camera.x, card.y - camera.y);
        const blur = clamp((distance - 300) / 60, 0, 9) + (distance > 300 ? flyBlur : 0);
        const near = distance < 200;
        card.card.style.filter = (blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : '') + (near ? '' : ' brightness(.82)');
        if (card.video) {
          const active = near && !this.paused;
          if (active && card.video.paused) void card.video.play().catch(() => undefined);
          else if (!active && !card.video.paused) card.video.pause();
        }
      });
    }

    if (!this.titleEl.innerHTML && this.options.title) this.setTitle(this.options.title);
    const showTitle = shot === count - 1 && local > move + 0.4 && Boolean(this.options.title);
    this.titleEl.classList.toggle('on', showTitle);
    this.progressEl.style.width = `${clamp(time / this.total, 0, 1) * 100}%`;
    this.options.onProgress?.(time, this.total);
  }
}

const isVideoMemory = (memory: Memory) => memory.type === 'video' || Boolean(memory.mimeType?.startsWith('video/'));

const fetchDriveBlobUrl = async (memory: Memory, signal: AbortSignal) => {
  if (!memory.driveFileId || !memory.authToken) return '';
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 18000);
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  try {
    const response = await withMediaFetch(() => fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(memory.driveFileId!)}?alt=media`, {
      headers: { Authorization: `Bearer ${memory.authToken}` },
      signal: controller.signal,
      cache: 'force-cache',
    }));
    if (!response.ok) throw new Error(`Drive media failed ${response.status}`);
    return URL.createObjectURL(await response.blob());
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
};

const resolveReelSources = async (memories: Memory[], signal: AbortSignal, ownedUrls: string[]) => {
  const sources = await Promise.all(memories.map(async memory => {
    const fallback = isVideoMemory(memory) ? memory.url || memory.thumbnail : memory.thumbnail || memory.url;
    if (!fallback && !memory.driveFileId) return null;
    if (memory.driveFileId && memory.authToken) {
      try {
        const objectUrl = await fetchDriveBlobUrl(memory, signal);
        if (objectUrl) {
          if (signal.aborted) {
            URL.revokeObjectURL(objectUrl);
            return null;
          }
          ownedUrls.push(objectUrl);
          return { src: objectUrl, type: isVideoMemory(memory) ? 'video' : 'image' } satisfies ReelSource;
        }
      } catch {
        if (signal.aborted) return null;
      }
    }
    return fallback ? { src: fallback, type: isVideoMemory(memory) ? 'video' : 'image' } satisfies ReelSource : null;
  }));
  return sources.filter((source): source is ReelSource => Boolean(source));
};

const MemoryReel: React.FC<MemoryReelProps> = ({ memories, title, audio, autoPlay = true, onClose }) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<MemoryReelController | null>(null);
  const audioObjectUrlRef = useRef('');
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
  const [musicName, setMusicName] = useState('');
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    setTitleDraft({ line: title?.line || '', big: title?.big || '' });
    setActiveTitle(title);
  }, [title?.line, title?.big]);

  useEffect(() => {
    const controller = new AbortController();
    const ownedUrls: string[] = [];
    setLoading(true);
    setResolvedSources([]);
    void resolveReelSources(memories, controller.signal, ownedUrls).then(sources => {
      if (!controller.signal.aborted) {
        setResolvedSources(sources);
        setLoading(false);
      }
    });
    return () => {
      controller.abort();
      ownedUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [memories]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !resolvedSources.length) return undefined;
    const controller = new MemoryReelController(stage, {
      items: resolvedSources,
      title: activeTitle,
      audio: audio || audioObjectUrlRef.current || undefined,
      reducedMotion,
      onProgress: (current, total) => setProgress({ progress: current, total }),
      onStateChange: setPlaying,
    });
    controllerRef.current = controller;
    void controller.setItems(resolvedSources).then(() => {
      if (autoPlay) controller.play();
    });
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [resolvedSources, reducedMotion]);

  useEffect(() => {
    controllerRef.current?.setTitle(activeTitle);
  }, [activeTitle]);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(document.fullscreenElement === stageRef.current?.parentElement);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  useEffect(() => () => {
    if (audioObjectUrlRef.current) URL.revokeObjectURL(audioObjectUrlRef.current);
  }, []);

  const toggleFullscreen = async () => {
    const shell = stageRef.current?.parentElement;
    if (!shell) return;
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    else await shell.requestFullscreen?.().catch(() => undefined);
  };

  const chooseMusicFile = (file: File | undefined) => {
    if (!file) return;
    if (audioObjectUrlRef.current) URL.revokeObjectURL(audioObjectUrlRef.current);
    audioObjectUrlRef.current = URL.createObjectURL(file);
    setMusicName(file.name);
    controllerRef.current?.setAudio(audioObjectUrlRef.current);
    if (playing) controllerRef.current?.play();
  };

  const chooseMusicTrack = (track: OpenSourceMusicTrack) => {
    setMusicName(`${track.title} · ${track.artist}`);
    controllerRef.current?.setAudio(track.previewUrl);
    if (playing) controllerRef.current?.play();
  };

  const searchMusic = async () => {
    if (!musicQuery.trim()) return;
    setMusicLoading(true);
    try {
      setMusicResults(await searchOpenSourceMusic(musicQuery));
    } finally {
      setMusicLoading(false);
    }
  };

  const applyTitle = () => {
    setActiveTitle({ line: titleDraft.line?.trim() || '', big: titleDraft.big?.trim() || '' });
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
          <button type="button" onClick={() => setMusicOpen(value => !value)}><Search size={16} /> Music</button>
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
              <label className="memory-reel-upload"><Upload size={15} /> Choose audio<input type="file" accept="audio/*" onChange={event => chooseMusicFile(event.target.files?.[0])} /></label>
            </div>
            {musicName && <p className="memory-reel-current-music">Now selected: {musicName}</p>}
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
