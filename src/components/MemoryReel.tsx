import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, Music2, Pause, Play, RotateCcw, Search, Upload, Volume2, WandSparkles, X } from 'lucide-react';
import { isVisualMemory, type Memory } from '../data/memories';
import { googleDriveService, isDriveAuthorizationError, type DriveAudioFile } from '../services/googleDriveService';
import { saveDriveAccessToken } from '../services/driveLibrary';
import { searchOpenSourceMusic, type OpenSourceMusicTrack } from '../services/openSourceMusic';
import { readCachedDriveMedia } from '../services/driveCache';
import { readCachedStoryMedia, writeCachedStoryMedia } from '../services/storyMediaCache';
import { withMediaFetch } from '../utils/mediaQueue';
import { isLegacyTvBrowser } from '../utils/legacyBrowser';

export interface MemoryReelTitle {
  line?: string;
  big?: string;
}

export type MemoryReelTemplate =
  | 'orbit'
  | 'cinema'
  | 'filmstrip'
  | 'polaroid'
  | 'mosaic'
  | 'spotlight'
  | 'super8'
  | 'dreamscape'
  | 'scrapbook'
  | 'neon-grid';

export type MemoryReelEffect =
  | 'off'
  | 'natural'
  | 'birthday'
  | 'waves'
  | 'cinematic'
  | 'stardust'
  | 'neon';

export const MEMORY_REEL_TEMPLATES: Array<{ id: MemoryReelTemplate; name: string; description: string }> = [
  { id: 'orbit', name: 'Cinematic Camera Motion', description: 'The original camera-wall journey with depth, movement, and living frames.' },
  { id: 'cinema', name: 'Wide Cinema', description: 'A full-frame director cut with a slow, elegant Ken Burns drift.' },
  { id: 'filmstrip', name: 'Filmstrip Journey', description: 'A living horizontal reel that keeps nearby moments in view.' },
  { id: 'polaroid', name: 'Polaroid Afterglow', description: 'Warm stacked prints that feel like a memory journal.' },
  { id: 'mosaic', name: 'Memory Mosaic', description: 'A modern gallery grid that lets the whole archive breathe.' },
  { id: 'spotlight', name: 'Spotlight Premiere', description: 'One hero moment under a soft theater light.' },
  { id: 'super8', name: 'Super 8 Dream', description: 'A nostalgic film look with warm grain and vintage color.' },
  { id: 'dreamscape', name: 'Dreamscape Dissolve', description: 'Soft, slow transitions for intimate and emotional stories.' },
  { id: 'scrapbook', name: 'Editorial Scrapbook', description: 'Layered cards and paper tones inspired by a travel journal.' },
  { id: 'neon-grid', name: 'Neon Memory Gallery', description: 'A vivid midnight gallery with luminous edges and energy.' },
];

export const MEMORY_REEL_EFFECTS: Array<{ id: MemoryReelEffect; name: string; description: string }> = [
  { id: 'off', name: 'Off', description: 'Clean template with no extra effects.' },
  { id: 'natural', name: 'Natural glow', description: 'Soft fireflies, breath, and gentle beat response.' },
  { id: 'birthday', name: 'Birthday sparkle', description: 'Warm confetti and celebratory light bursts.' },
  { id: 'waves', name: 'Music waves', description: 'Smooth waveform bars that follow bass and rhythm.' },
  { id: 'cinematic', name: 'Cinematic film', description: 'Lens bloom, grain, and elegant beat flashes.' },
  { id: 'stardust', name: 'Stardust', description: 'Slow floating stars with a soft musical pulse.' },
  { id: 'neon', name: 'Neon pulse', description: 'Modern spectrum glow for energetic tracks.' },
];

interface ReelSource {
  id: string;
  src: string;
  fallbackSrc?: string;
  poster?: string;
  driveFileId?: string;
  authToken?: string;
  rotation?: number;
  type: 'image' | 'video';
  label: string;
}

interface MemoryReelProps {
  memories: Memory[];
  title?: MemoryReelTitle;
  audio?: string;
  template?: MemoryReelTemplate;
  autoPlay?: boolean;
  loop?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onNeedMore?: () => void;
  driveAccessToken?: string;
  driveFolderId?: string;
  driveFolders?: Array<{ id: string; name: string }>;
  onDriveFolderChange?: (folderId: string) => void;
  onDriveReconnect?: () => Promise<string | undefined> | void;
  onClose?: () => void;
}

interface MemoryReelOptions {
  items: ReelSource[];
  title?: MemoryReelTitle;
  audio?: string;
  template?: MemoryReelTemplate;
  effect?: MemoryReelEffect;
  hold?: number;
  move?: number;
  loop?: boolean;
  reducedMotion?: boolean;
  legacyTv?: boolean;
  onProgress?: (progress: number, total: number) => void;
  onStateChange?: (playing: boolean) => void;
  onAudioStateChange?: (playing: boolean) => void;
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

const getMediaFrameSize = (aspect: number) => {
  // Fit the complete source inside a generous frame without forcing every
  // portrait into a landscape card. The frame is then scaled by the camera
  // path, so this remains readable on phones, desktops, and TVs.
  const safeAspect = clamp(Number.isFinite(aspect) && aspect > 0 ? aspect : 1.5, 0.3, 3.2);
  const maxWidth = 560;
  const maxHeight = 440;
  let width = maxWidth;
  let height = width / safeAspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * safeAspect;
  }
  return { width: Math.round(width), height: Math.round(height) };
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const ease = (value: number) => value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
const escapeHtml = (value: string) => String(value).replace(/[&<>\"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character] || character));

const AUDIO_MIME_BY_EXTENSION: Record<string, string> = {
  aac: 'audio/aac',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  amr: 'audio/amr',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mka: 'audio/x-matroska',
  mp3: 'audio/mpeg',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  wav: 'audio/wav',
  webm: 'audio/webm',
  wma: 'audio/x-ms-wma',
};

const audioMimeType = (name: string, fallback = '') => {
  if (fallback.startsWith('audio/')) return fallback;
  const extension = name.split(/[?#]/)[0].split('.').pop()?.toLowerCase() || '';
  return AUDIO_MIME_BY_EXTENSION[extension] || fallback || 'audio/mpeg';
};

const isAudioFile = (file: File) => file.type.startsWith('audio/')
  || Boolean(AUDIO_MIME_BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() || '']);

const normalizeAudioFile = (file: File) => file.type.startsWith('audio/')
  ? file
  : new File([file], file.name, { type: audioMimeType(file.name), lastModified: file.lastModified });

/**
 * The camera-wall controller ported from the supplied memoriya-reel.html.
 * It intentionally uses the same card layout, snake path, easing, pull-back,
 * push-in, sway, and distance-based depth of field as the reference reel.
 */
export class MemoryReelController {
  private readonly el: HTMLElement;
  private readonly options: Required<Pick<MemoryReelOptions, 'hold' | 'move' | 'loop' | 'reducedMotion' | 'legacyTv'>> & MemoryReelOptions;
  private world: HTMLDivElement;
  private ambient: HTMLDivElement;
  private ambientEffects: HTMLDivElement;
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
  private lastPaint = 0;
  private audio?: HTMLAudioElement;
  private audioElement?: HTMLAudioElement;
  private analysisAudio?: HTMLAudioElement;
  private audioQueue: string[] = [];
  private audioIndex = 0;
  private audioContext?: AudioContext;
  private audioAnalyser?: AnalyserNode;
  private audioSource?: MediaElementAudioSourceNode;
  private audioData?: Uint8Array<ArrayBuffer>;
  private audioWaveform?: Uint8Array<ArrayBuffer>;
  private audioAnalysisAttempted = false;
  private smoothedBass = 0;
  private smoothedMid = 0;
  private smoothedTreble = 0;
  private smoothedLevel = 0;
  private beatPulse = 0;
  private previousBass = 0;
  private objectUrls = new Set<string>();

  constructor(el: HTMLElement, options: MemoryReelOptions) {
    this.el = el;
    this.options = {
      // Give every loaded photo a complete six-second focus before the
      // camera starts its transition to the next frame.
      hold: 6,
      move: 1.2,
      loop: false,
      reducedMotion: false,
      legacyTv: false,
      template: 'orbit',
      effect: 'natural',
      ...options,
    };
    this.world = Object.assign(document.createElement('div'), { className: 'world' });
    this.ambient = Object.assign(document.createElement('div'), { className: 'ambient' });
    this.ambientEffects = Object.assign(document.createElement('div'), {
      className: 'ambient-effects effect-natural',
      ariaHidden: 'true',
    });
    for (let index = 0; index < 6; index += 1) {
      this.ambientEffects.appendChild(Object.assign(document.createElement('span'), {
        className: `ambient-particle ambient-particle-${index + 1}`,
      }));
    }
    this.ambientEffects.appendChild(Object.assign(document.createElement('span'), {
      className: 'ambient-butterfly',
    }));
    const wave = Object.assign(document.createElement('div'), { className: 'effect-wave', ariaHidden: 'true' });
    for (let index = 0; index < 18; index += 1) {
      wave.appendChild(Object.assign(document.createElement('span'), { className: `effect-wave-bar effect-wave-bar-${index + 1}` }));
    }
    this.ambientEffects.appendChild(wave);
    const rings = Object.assign(document.createElement('div'), { className: 'effect-rings', ariaHidden: 'true' });
    for (let index = 0; index < 3; index += 1) {
      rings.appendChild(Object.assign(document.createElement('span'), { className: `effect-ring effect-ring-${index + 1}` }));
    }
    this.ambientEffects.appendChild(rings);
    const confetti = Object.assign(document.createElement('div'), { className: 'effect-confetti', ariaHidden: 'true' });
    for (let index = 0; index < 14; index += 1) {
      confetti.appendChild(Object.assign(document.createElement('span'), { className: `effect-confetti-piece effect-confetti-piece-${index + 1}` }));
    }
    this.ambientEffects.appendChild(confetti);
    this.ambientEffects.appendChild(Object.assign(document.createElement('div'), { className: 'effect-film-grain', ariaHidden: 'true' }));
    const vignette = Object.assign(document.createElement('div'), { className: 'vignette' });
    this.titleEl = Object.assign(document.createElement('div'), { className: 'title' });
    this.progressEl = Object.assign(document.createElement('div'), { className: 'prog' });
    const tap = Object.assign(document.createElement('button'), { className: 'tap', ariaLabel: 'Play or pause' });
    this.poster = Object.assign(document.createElement('div'), { className: 'poster', innerHTML: '<span>▶</span>' });
    tap.onclick = () => this.paused ? this.play() : this.pause();
    this.poster.onclick = () => this.play();
    this.el.innerHTML = '';
    this.el.append(this.world, this.ambient, this.ambientEffects, vignette, this.titleEl, this.progressEl, tap, this.poster);
    this.applyTemplateClass();
    this.setEffect(this.options.effect || 'natural');
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
    const keepCurrentWall = preserveProgress && this.cards.length > 0 && items.length > 0;
    const previousObjectUrls = keepCurrentWall ? new Set(this.objectUrls) : undefined;
    // A live Drive update is loaded beside the current wall. Do not pause the
    // story/audio or clear the stage while the replacement images arrive.
    if (!keepCurrentWall) {
      this.pause();
      this.revokeObjectUrls();
      this.world.innerHTML = '';
      this.cards = [];
    }
    if (!items.length) {
      this.options.onProgress?.(0, 0);
      return;
    }

    let ready = false;
    let resolveReady: () => void = () => undefined;
    const readyPromise = new Promise<void>(resolve => { resolveReady = resolve; });
    const loaded: LoadedMedia[] = [];
    const reveal = (media: LoadedMedia) => {
      if (this.destroyed || generation !== this.loadGeneration) {
        this.releaseObjectUrl(media.node instanceof HTMLImageElement ? media.node.src : '');
        return;
      }
      loaded.push(media);
      if (!keepCurrentWall) this.rebuildWall(loaded, preserveProgress || loaded.length > 1, previousElapsed, wasPlaying);
      if (!ready) {
        ready = true;
        resolveReady();
      }
    };

    void Promise.all(items.map(async item => {
      const media = await this.load(item);
      if (media) reveal(media);
    })).then(() => {
      if (generation !== this.loadGeneration) return;
      if (keepCurrentWall && loaded.length) {
        // Swap the complete wall once, preserving the current story clock.
        this.rebuildWall(loaded, true, previousElapsed, wasPlaying);
        previousObjectUrls?.forEach(url => {
          if (this.objectUrls.has(url)) {
            this.objectUrls.delete(url);
            URL.revokeObjectURL(url);
          }
        });
      }
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
      const { width, height } = getMediaFrameSize(media.aspect);
      const card = document.createElement('div');
      const aspectClass = media.aspect < 0.9 ? ' media-portrait' : media.aspect > 1.15 ? ' media-landscape' : ' media-square';
      card.className = `card${aspectClass}${random() < 0.16 ? ' frame' : ''}`;
      card.style.setProperty('--media-aspect', String(media.aspect));
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

    this.total = this.cards.reduce((total, card, index) => (
      total + this.cardHold(card) + (index < this.cards.length - 1 ? this.options.move : 0)
    ), 0) + 2.6;
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
      let attemptedAuthenticated = false;
      let timer = 0;
      const finish = (value: LoadedMedia | null) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        resolve(value);
      };

      if (isVideo) {
        const video = document.createElement('video');
        Object.assign(video, { src: '', muted: true, loop: true, playsInline: true, playbackRate: 1, defaultPlaybackRate: 1, preload: 'metadata', poster: item.poster || '' });
        video.defaultMuted = true;
        video.volume = 0;
        video.className = 'm';
        const finishVideo = () => finish({ node: video, video, aspect: video.videoWidth / video.videoHeight || 1.6 });
        const finishVideoPoster = () => {
          if (!item.poster) {
            finish(null);
            return;
          }
          const poster = new Image();
          poster.decoding = 'async';
          poster.onload = () => finish({ node: poster, aspect: poster.naturalWidth / poster.naturalHeight || 1.6 });
          poster.onerror = () => finish(null);
          poster.src = item.poster;
        };
        // Some older TV decoders never fire metadata/error for a codec they
        // cannot decode. Fall back to the poster instead of hanging a story.
        timer = window.setTimeout(() => finishVideoPoster(), 8000);
        video.onloadedmetadata = finishVideo;
        video.onloadeddata = finishVideo;
        video.onerror = () => {
          if (item.driveFileId && item.authToken && !attemptedAuthenticated) {
            attemptedAuthenticated = true;
            void this.loadAuthenticatedDriveImage(item)
              .then(objectUrl => {
                if (!objectUrl) {
                  finish(null);
                  return;
                }
                if (finished) {
                  this.releaseObjectUrl(objectUrl);
                  return;
                }
                video.src = objectUrl;
                video.load();
              })
            .catch(() => finishVideoPoster());
            return;
          }
          finishVideoPoster();
        };
        if (item.driveFileId && item.authToken) {
          attemptedAuthenticated = true;
          void this.loadAuthenticatedDriveImage(item)
            .then(objectUrl => {
              if (!objectUrl) {
                finishVideoPoster();
                return;
              }
              if (finished) {
                this.releaseObjectUrl(objectUrl);
                return;
              }
              video.src = objectUrl;
              video.load();
            })
            .catch(() => finishVideoPoster());
        } else {
          video.src = item.src;
        }
      } else {
        const image = new Image();
        image.className = 'm';
        image.decoding = 'async';
        image.style.imageOrientation = 'from-image';
        let drivePromotionStarted = false;
        let previewObjectUrl = '';
        let previewResolvedFull = false;
        const promoteDriveImage = () => {
          if (drivePromotionStarted || previewResolvedFull || !item.driveFileId || !item.authToken || !item.src) return;
          drivePromotionStarted = true;
          void this.loadAuthenticatedDriveImage(item)
            .then(objectUrl => {
              if (!objectUrl) return;
              // The thumbnail is already visible. Replace only the image
              // source so the current card, clock, and music never restart.
              const oldObjectUrl = previewObjectUrl;
              image.src = objectUrl;
              previewObjectUrl = '';
              if (oldObjectUrl) this.releaseObjectUrl(oldObjectUrl);
            })
            .catch(() => undefined);
        };
        image.onload = () => {
          const aspect = image.naturalWidth / image.naturalHeight || 1.5;
          const isQuarterTurn = ((item.rotation || 0) / 90) % 2 === 1;
          if (item.rotation) {
            // The individual `rotate` property is unavailable on older TV
            // Chromium, so use the widely supported transform there.
            // Use the widely supported transform property on every browser.
            // The individual `rotate` property is missing on older TV WebViews.
            image.style.transform = `rotate(${item.rotation}deg)`;
          }
          finish({ node: image, aspect: isQuarterTurn ? 1 / aspect : aspect });
          promoteDriveImage();
        };
        image.onerror = () => {
          if (item.fallbackSrc && !attemptedFallback) {
            attemptedFallback = true;
            image.src = item.fallbackSrc;
            return;
          }
          if (item.driveFileId && item.authToken && !attemptedAuthenticated) {
            attemptedAuthenticated = true;
            void this.loadAuthenticatedDriveImage(item)
              .then(objectUrl => {
                if (!objectUrl) {
                  finish(null);
                  return;
                }
                if (finished) {
                  this.releaseObjectUrl(objectUrl);
                  return;
                }
                image.src = objectUrl;
              })
              .catch(() => finish(null));
            return;
          }
          finish(null);
        };
        if (item.driveFileId && item.authToken && item.src) {
          // Never assign Drive's short-lived lh3 URL directly to an image.
          // Fetch it with the current token and use a local object URL so a
          // 401/403 cannot create a retry loop or a blank card.
          void this.loadAuthenticatedDrivePreview(item)
            .then(result => {
              if (!result.objectUrl) {
                finish(null);
                return;
              }
              previewObjectUrl = result.objectUrl;
              previewResolvedFull = result.full;
              if (result.full) drivePromotionStarted = true;
              image.src = result.objectUrl;
            })
            .catch(() => {
              void this.loadAuthenticatedDriveImage(item)
                .then(objectUrl => {
                  if (!objectUrl) {
                    finish(null);
                    return;
                  }
                  previewResolvedFull = true;
                  drivePromotionStarted = true;
                  image.src = objectUrl;
                })
                .catch(() => finish(null));
            });
        } else if (item.driveFileId && item.authToken) {
          attemptedAuthenticated = true;
          void this.loadAuthenticatedDriveImage(item)
            .then(objectUrl => {
              if (!objectUrl) {
                finish(null);
                return;
              }
              if (finished) {
                this.releaseObjectUrl(objectUrl);
                return;
              }
              image.src = objectUrl;
            })
            .catch(() => finish(null));
        } else {
          image.src = item.src;
        }
        timer = window.setTimeout(() => finish(null), 12000);
      }
    });
  }

  private async loadAuthenticatedDriveImage(item: ReelSource) {
    if (!item.driveFileId || !item.authToken) return '';
    const cacheKey = item.driveFileId;
    const driveCached = await readCachedDriveMedia(item.driveFileId);
    const cached = driveCached?.blob || await readCachedStoryMedia(cacheKey);
    const result = cached
      ? { blob: cached, accessToken: item.authToken }
      : await withMediaFetch(() => googleDriveService.downloadMediaFileWithReconnect(item.authToken!, item.driveFileId!));
    if (result.accessToken !== item.authToken) saveDriveAccessToken(result.accessToken);
    const blob = result.blob;
    if (!cached) void writeCachedStoryMedia(cacheKey, blob, item.type === 'video' ? 'video/mp4' : blob.type);
    const objectUrl = URL.createObjectURL(blob);
    this.objectUrls.add(objectUrl);
    return objectUrl;
  }

  private async loadAuthenticatedDrivePreview(item: ReelSource): Promise<{ objectUrl: string; full: boolean }> {
    if (!item.driveFileId || !item.authToken) return { objectUrl: '', full: false };
    const driveCached = await readCachedDriveMedia(item.driveFileId);
    const cached = driveCached?.blob || await readCachedStoryMedia(item.driveFileId);
    if (cached) {
      const objectUrl = URL.createObjectURL(cached);
      this.objectUrls.add(objectUrl);
      return { objectUrl, full: true };
    }
    if (!item.src) return { objectUrl: await this.loadAuthenticatedDriveImage(item), full: true };
    // Drive's lh3/thumbnail links are short-lived and frequently return 401
    // or 403 after a refresh. Do not request them again; use the authenticated
    // Drive media endpoint and cache the resulting object URL instead.
    if (/lh\d+\.googleusercontent\.com|drive\.google\.com\/thumbnail/i.test(item.src)) {
      return { objectUrl: await this.loadAuthenticatedDriveImage(item), full: true };
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(item.src, {
        headers: { Authorization: `Bearer ${item.authToken}` },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Drive preview returned ${response.status}.`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('Drive preview was empty.');
      const objectUrl = URL.createObjectURL(blob);
      this.objectUrls.add(objectUrl);
      const full = /\/drive\/v3\/files\//i.test(item.src);
      return { objectUrl, full };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  private resize() {
    this.scale = this.el.clientHeight > 0 ? this.el.clientHeight / 720 : 1;
  }

  setTemplate(template: MemoryReelTemplate) {
    this.options.template = template;
    this.applyTemplateClass();
    this.render(this.elapsed);
  }

  private applyTemplateClass() {
    MEMORY_REEL_TEMPLATES.forEach(item => this.el.classList.remove(`memory-reel-template-${item.id}`));
    this.el.classList.add(`memory-reel-template-${this.options.template || 'orbit'}`);
  }

  setEffect(effect: MemoryReelEffect) {
    this.options.effect = effect;
    MEMORY_REEL_EFFECTS.forEach(item => this.ambientEffects.classList.remove(`effect-${item.id}`));
    this.ambientEffects.classList.add(`effect-${effect}`);
  }

  setAudioAnalysisElement(element: HTMLAudioElement | null) {
    if (this.analysisAudio === element) return;
    this.disconnectAudioAnalysis();
    this.analysisAudio = element || undefined;
    this.audioAnalysisAttempted = false;
  }

  async resumeAudioAnalysis() {
    const analysisAudio = this.analysisAudio || this.audio;
    if (!analysisAudio) return;
    if (!this.audioContext) this.connectAudioAnalysis();
    if (this.audioContext?.state === 'suspended') await this.audioContext.resume();
  }

  private playMutedVideo(video: HTMLVideoElement) {
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.playbackRate = 1;
    video.defaultPlaybackRate = 1;
    void video.play().catch(() => undefined);
  }

  private connectAudioAnalysis() {
    const sourceAudio = this.analysisAudio || this.audio;
    if (!sourceAudio || !sourceAudio.src || this.audioSource || this.audioAnalysisAttempted) return;
    this.audioAnalysisAttempted = true;
    const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;

    try {
      this.audioContext ||= new AudioContextConstructor();
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.82;
      const source = this.audioContext.createMediaElementSource(sourceAudio);
      source.connect(analyser);
      analyser.connect(this.audioContext.destination);
      this.audioSource = source;
      this.audioAnalyser = analyser;
      this.audioData = new Uint8Array(analyser.frequencyBinCount);
      this.audioWaveform = new Uint8Array(analyser.fftSize);
    } catch {
      // Cross-origin audio may not expose an analyser. Keep normal playback
      // working and let the visualizer use its gentle time-based fallback.
      this.audioSource = undefined;
      this.audioAnalyser = undefined;
      this.audioData = undefined;
      this.audioWaveform = undefined;
    }
  }

  private disconnectAudioAnalysis() {
    this.audioSource?.disconnect();
    this.audioAnalyser?.disconnect();
    this.audioSource = undefined;
    this.audioAnalyser = undefined;
    this.audioData = undefined;
    this.audioWaveform = undefined;
    this.audioAnalysisAttempted = false;
  }

  private readAudioMetrics(time: number) {
    const analysisAudio = this.analysisAudio || this.audio;
    if (analysisAudio && analysisAudio.src && !this.audioSource) this.connectAudioAnalysis();
    const playing = Boolean(analysisAudio && !analysisAudio.paused);
    if (playing && this.audioAnalyser && this.audioData) {
      this.audioAnalyser.getByteFrequencyData(this.audioData);
      if (this.audioWaveform) this.audioAnalyser.getByteTimeDomainData(this.audioWaveform);
      const size = this.audioData.length;
      const averageBand = (start: number, end: number) => {
        const from = Math.max(0, Math.floor(size * start));
        const to = Math.max(from + 1, Math.floor(size * end));
        let total = 0;
        for (let index = from; index < Math.min(size, to); index += 1) total += this.audioData![index] / 255;
        return total / Math.max(1, to - from);
      };
      const bass = averageBand(0, 0.16);
      const mid = averageBand(0.16, 0.58);
      const treble = averageBand(0.58, 1);
      const rawLevel = bass * 0.52 + mid * 0.32 + treble * 0.16;
      this.smoothedBass += (bass - this.smoothedBass) * 0.18;
      this.smoothedMid += (mid - this.smoothedMid) * 0.14;
      this.smoothedTreble += (treble - this.smoothedTreble) * 0.14;
      this.smoothedLevel += (rawLevel - this.smoothedLevel) * 0.16;
      const onset = Math.max(0, bass - this.previousBass);
      this.previousBass = bass;
      if (onset > 0.055 && bass > 0.22) this.beatPulse = Math.min(1, this.beatPulse + onset * 4.6 + bass * 0.16);
      this.beatPulse *= 0.84;
    } else {
      const fallbackClock = analysisAudio?.currentTime || time;
      const fallback = playing
        ? this.options.legacyTv
          ? 0.12 + Math.abs(Math.sin(time * 3.2)) * 0.16
          : 0.05 + Math.abs(Math.sin(fallbackClock * 5.2)) * 0.08
        : 0;
      this.smoothedLevel += (fallback - this.smoothedLevel) * 0.08;
      this.smoothedBass += (fallback * 1.1 - this.smoothedBass) * 0.08;
      this.smoothedMid += (fallback * 0.8 - this.smoothedMid) * 0.08;
      this.smoothedTreble += (fallback * 0.65 - this.smoothedTreble) * 0.08;
      this.beatPulse = Math.max(this.beatPulse, playing ? Math.pow(Math.max(0, Math.sin(fallbackClock * 5.2)), 8) * 0.24 : 0);
      this.beatPulse *= 0.86;
      this.previousBass *= 0.9;
    }
    if (!playing) {
      this.smoothedLevel *= 0.9;
      this.smoothedBass *= 0.9;
      this.smoothedMid *= 0.9;
      this.smoothedTreble *= 0.9;
      this.beatPulse *= 0.82;
    }
    return {
      level: clamp(this.smoothedLevel * 1.8, 0, 1),
      bass: clamp(this.smoothedBass * 1.65, 0, 1),
      mid: clamp(this.smoothedMid * 1.55, 0, 1),
      treble: clamp(this.smoothedTreble * 1.8, 0, 1),
      beat: clamp(this.beatPulse, 0, 1),
    };
  }

  play() {
    if (!this.cards.length || this.destroyed || !this.paused && this.raf) return;
    if (this.elapsed >= this.total) this.elapsed = 0;
    this.paused = false;
    this.poster.classList.add('off');
    this.options.onStateChange?.(true);
    this.last = performance.now();
    this.lastPaint = 0;
    void this.playAudio();
    const tick = (now: number) => {
      if (this.paused || this.destroyed) return;
      // A delayed frame must not make the story jump several slides at once.
      // This is especially important while Drive thumbnails are downloading
      // or when a TV browser briefly deprioritizes the tab.
      this.elapsed += Math.min(0.12, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      if (this.elapsed >= this.total) {
        if (this.options.loop) this.elapsed = 0;
        else {
          this.elapsed = this.total;
          this.render(this.elapsed);
          this.paused = true;
          this.raf = 0;
          this.options.onStateChange?.(false);
          this.cards.forEach(card => card.video?.pause());
          this.pauseAudio();
          return;
        }
      }
      // A stable 30fps paint budget is smoother than an overloaded 60fps DOM
      // loop on old TVs. The elapsed clock remains real-time and the browser
      // still schedules frames normally, so transitions never speed up.
      const paintInterval = this.options.legacyTv ? 1000 / 30 : 0;
      if (!paintInterval || now - this.lastPaint >= paintInterval) {
        this.render(this.elapsed);
        this.lastPaint = now;
      }
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
    this.pauseAudio();
    this.options.onStateChange?.(false);
  }

  async playAudio() {
    if (!this.audio) {
      this.options.onAudioStateChange?.(false);
      return false;
    }
    try {
      if (!this.audioContext && navigator.userActivation?.isActive) this.connectAudioAnalysis();
      if (this.audioContext?.state === 'suspended') await this.audioContext.resume();
      await this.audio.play();
      this.options.onAudioStateChange?.(true);
      return true;
    } catch {
      this.options.onAudioStateChange?.(false);
      return false;
    }
  }

  setAudioElement(element: HTMLAudioElement | null) {
    const wasPlaying = Boolean(this.audio && !this.audio.paused && !this.paused);
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
    }
    this.disconnectAudioAnalysis();
    this.audioElement = element || undefined;
    this.audio = element || (this.audioQueue.length ? new Audio() : undefined);
    if (this.audio) {
      this.audio.preload = 'auto';
      this.audio.loop = false;
      this.audio.src = this.audioQueue[this.audioIndex] || '';
      this.audio.onended = () => this.advanceAudio();
      if (this.audio.src) this.audio.load();
      if (this.audioContext && this.audio.src) this.connectAudioAnalysis();
    }
    if (wasPlaying) void this.playAudio();
  }

  pauseAudio() {
    this.audio?.pause();
    this.options.onAudioStateChange?.(false);
  }

  async toggleAudio() {
    if (this.audio && !this.audio.paused) {
      this.pauseAudio();
      return false;
    }
    return this.playAudio();
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
    this.disconnectAudioAnalysis();
    this.audio = this.audioElement || (this.audioQueue.length ? new Audio() : undefined);
    if (this.audio) {
      this.audio.preload = 'auto';
      this.audio.loop = false;
      this.audio.src = this.audioQueue[this.audioIndex] || '';
      this.audio.onended = () => this.advanceAudio();
      if (this.audio.src) this.audio.load();
      if (this.audioContext) this.connectAudioAnalysis();
    }
    if (shouldResume) void this.playAudio();
    else this.options.onAudioStateChange?.(false);
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
    else {
      this.options.onAudioStateChange?.(false);
      return;
    }
    const shouldResume = !this.paused;
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
    }
    this.disconnectAudioAnalysis();
    this.audio = this.audioElement || new Audio();
    this.audio.preload = 'auto';
    this.audio.src = this.audioQueue[this.audioIndex];
    this.audio.loop = false;
    this.audio.onended = () => this.advanceAudio();
    this.audio.load();
    if (this.audioContext) this.connectAudioAnalysis();
    if (shouldResume) void this.playAudio();
    else this.options.onAudioStateChange?.(false);
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
    this.pauseAudio();
    if (this.audio) this.audio.onended = null;
    this.disconnectAudioAnalysis();
    void this.audioContext?.close().catch(() => undefined);
    this.audioContext = undefined;
    this.audio = undefined;
    this.analysisAudio = undefined;
    this.world.innerHTML = '';
    this.cards = [];
    this.revokeObjectUrls();
  }

  private revokeObjectUrls() {
    this.objectUrls.forEach(url => URL.revokeObjectURL(url));
    this.objectUrls.clear();
  }

  private releaseObjectUrl(url: string) {
    if (!url || !this.objectUrls.delete(url)) return;
    URL.revokeObjectURL(url);
  }

  private target(index: number) {
    const card = this.cards[index];
    return card ? { x: card.x, y: card.y, z: card.z, rot: card.rot } : { x: 0, y: 0, z: 0, rot: 0 };
  }

  private cardHold(card: ReelCard) {
    return this.options.hold + (card.video ? 3 : 0);
  }

  private render(time: number) {
    const { move } = this.options;
    const count = this.cards.length;
    if (!count) return;
    const audioMetrics = this.readAudioMetrics(time);
    const audioLevel = audioMetrics.level;
    const audioScale = 1 + audioLevel * 0.035;
    if (!this.options.legacyTv) this.ambient.style.opacity = (0.68 + audioLevel * 0.16).toFixed(3);
    // Keep the empty space alive with a gentle music pulse. Beat and frequency
    // bands are smoothed so visuals breathe with the track instead of twitching.
    const effectLevel = audioLevel;
    this.ambientEffects.style.setProperty('--audio-level', effectLevel.toFixed(3));
    this.ambientEffects.style.setProperty('--bass-level', audioMetrics.bass.toFixed(3));
    this.ambientEffects.style.setProperty('--mid-level', audioMetrics.mid.toFixed(3));
    this.ambientEffects.style.setProperty('--treble-level', audioMetrics.treble.toFixed(3));
    this.ambientEffects.style.setProperty('--beat-pulse', audioMetrics.beat.toFixed(3));
    this.ambientEffects.style.setProperty('--wave-shift', `${(audioMetrics.bass * 18 + audioMetrics.mid * 8).toFixed(2)}px`);
    this.ambientEffects.style.setProperty('--effect-opacity', (0.34 + effectLevel * 0.42).toFixed(3));
    this.ambientEffects.style.setProperty('--glow-scale', (0.92 + effectLevel * 0.48).toFixed(3));
    this.ambientEffects.style.setProperty('--particle-opacity', (0.28 + effectLevel * 0.72).toFixed(3));
    this.ambientEffects.style.setProperty('--particle-scale', (0.72 + effectLevel * 1.1).toFixed(3));
    this.ambientEffects.style.setProperty('--butterfly-opacity', (0.24 + effectLevel * 0.76).toFixed(3));
    this.ambientEffects.style.setProperty('--butterfly-scale', (0.78 + effectLevel * 0.42).toFixed(3));
    this.ambientEffects.classList.toggle('is-playing', !this.paused);

    let shot = 0;
    let local = Math.max(0, time);
    for (let index = 0; index < count; index += 1) {
      const step = this.cardHold(this.cards[index]) + move;
      if (local < step || index === count - 1) {
        shot = index;
        break;
      }
      local -= step;
    }
    const shotHold = this.cardHold(this.cards[shot]);
    let from = this.target(shot);
    let to = from;
    let progress = 1;
    let dip = 0;
    let holdProgress = 0;
    this.el.style.setProperty('--reel-active', String(shot));
    this.cards.forEach((card, index) => {
      card.card.classList.toggle('is-active', index === shot);
      card.card.style.setProperty('--reel-index', String(index));
      card.card.style.setProperty('--reel-offset', `${(index - shot) * 34}vw`);
      card.card.style.setProperty('--reel-angle', `${((index % 5) - 2) * 3}deg`);
      card.card.style.setProperty('--reel-depth', `${Math.min(Math.abs(index - shot) * 18, 120)}px`);
    });

    if (shot === 0 && local < shotHold) {
      holdProgress = local / shotHold;
    } else if (shot === 0) {
      holdProgress = local / shotHold;
    } else if (local < move) {
      from = this.target(shot - 1);
      to = this.target(shot);
      progress = ease(local / move);
      dip = Math.sin(Math.PI * (local / move));
    } else {
      holdProgress = (local - move) / shotHold;
    }

    // Keep the same camera-wall composition on PC, mobile, and Android TV.
    // TV-specific CSS remains available for old controls/fullscreen support,
    // but it must not replace the shared cinematic animation.
    const useLegacyVisualFallback = false;
    if (this.options.legacyTv && useLegacyVisualFallback) {
      // Chromium 66 can animate ordinary 2D transforms and opacity reliably,
      // but its 3D/filter compositor is unstable. Orbit therefore uses a
      // lightweight cross-fade and push. The other nine looks keep their own
      // card layout and 2D keyframe animation so old TVs still feel varied.
      const transitioning = shot > 0 && local < move;
      const transition = transitioning ? clamp(local / move, 0, 1) : 1;
      const previousShot = transitioning ? shot - 1 : -1;
      const template = this.options.template || 'orbit';
      const usesTemplateLayout = template !== 'orbit';
      const restingOpacity: Record<MemoryReelTemplate, number> = {
        orbit: 0,
        cinema: 0,
        filmstrip: 0.24,
        polaroid: 0.2,
        mosaic: 0.62,
        spotlight: 0,
        super8: 0,
        dreamscape: 0,
        scrapbook: 0.62,
        'neon-grid': 0.62,
      };
      this.world.style.transform = usesTemplateLayout ? 'none' : `scale(${this.scale * audioScale})`;
      const driftAmount = this.options.reducedMotion ? 0 : 1;
      const legacyCameraX = lerp(from.x, to.x, progress) + Math.sin(time * 0.22 + shot * 0.8) * 14 * driftAmount;
      const legacyCameraY = lerp(from.y, to.y, progress) + Math.cos(time * 0.18 + shot * 0.6) * 9 * driftAmount;
      this.cards.forEach((card, index) => {
        const isCurrent = index === shot;
        const isPrevious = index === previousShot;
        if (usesTemplateLayout) {
          const visibility = isCurrent ? transition : isPrevious ? 1 - transition : restingOpacity[template];
          // Let each template's unlayered CSS retain its own framing,
          // rotation, grid position and animation on older WebViews.
          card.card.style.removeProperty('transform');
          card.card.style.removeProperty('filter');
          card.card.style.setProperty('opacity', String(visibility), 'important');
          card.card.style.zIndex = isCurrent ? '20' : isPrevious ? '19' : '1';
        } else {
          // Keep a few neighboring frames around the focused photo. The
          // nearby cards are softly blurred and dimmed, while the focused
          // frame stays crisp and follows a slow 2D camera drift on old TVs.
          const distance = Math.hypot(card.x - legacyCameraX, card.y - legacyCameraY);
          const surroundingOpacity = distance < 500 ? 0.34 : distance < 860 ? 0.14 : 0;
          const visibility = isCurrent ? transition : isPrevious ? 1 - transition : surroundingOpacity;
          const breathing = isCurrent && driftAmount ? Math.sin(time * 0.26 + shot) * 0.012 : 0;
          const scale = isCurrent || isPrevious ? 1.02 + visibility * 0.025 + breathing : distance < 500 ? 0.78 : 0.66;
          const blur = isCurrent ? 0 : distance < 500 ? 1.8 : 3.2;
          const brightness = isCurrent ? 1 : distance < 500 ? 0.76 : 0.58;
          card.card.style.setProperty(
            'transform',
            `translate3d(${card.x - legacyCameraX - card.width / 2}px,${card.y - legacyCameraY - card.height / 2}px,0) rotateZ(${card.rot}deg) scale(${scale})`,
            'important',
          );
          card.card.style.setProperty('filter', blur ? `blur(${blur}px) brightness(${brightness})` : 'none', 'important');
          card.card.style.setProperty('opacity', String(visibility), 'important');
          card.card.style.zIndex = isCurrent ? '20' : isPrevious ? '19' : distance < 500 ? '8' : '3';
        }
        if (card.video) {
          if (isCurrent && !this.paused) this.playMutedVideo(card.video);
          else card.video.pause();
        }
      });
      const focusedMedia = this.cards[shot]?.card.querySelector<HTMLImageElement | HTMLVideoElement>('.m');
      const ambientSource = focusedMedia?.currentSrc || focusedMedia?.getAttribute('src') || '';
      if (ambientSource && ambientSource !== this.ambientSource) {
        this.ambientSource = ambientSource;
        this.ambient.style.backgroundImage = `url("${ambientSource.replace(/"/g, '\\"')}")`;
      }
    } else if (this.options.reducedMotion) {
      const visibleShot = shot > 0 && local < move && progress < 0.5 ? shot - 1 : shot;
      this.world.style.transform = `scale(${this.scale * audioScale}) translate3d(0,0,0)`;
      this.cards.forEach((card, index) => {
        // Important inline values win over template-specific CSS rules on old
        // WebViews, keeping exactly one readable frame visible at a time.
        card.card.style.setProperty('transform', `translate3d(${-card.width / 2}px,${-card.height / 2}px,0)`, 'important');
        card.card.style.setProperty('opacity', index === visibleShot ? '1' : '0', 'important');
        card.card.style.setProperty('filter', 'none', 'important');
        if (card.video) {
          if (index === visibleShot && !this.paused) this.playMutedVideo(card.video);
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
      // Keep the same camera targets and pacing on TV, but avoid the costly
      // rotateY/rotateZ/depth stack that makes older WebViews hitch. The
      // gentle zoom pulse restores the cinematic push-in without a jump at
      // each slide boundary.
      const tvZoom = 1.055 + Math.sin(time * 0.24 + shot * 0.7) * 0.045;
      this.world.style.transform = this.options.legacyTv
        ? `scale(${this.scale * tvZoom}) translate3d(${-camera.x}px,${-camera.y}px,0)`
        : `scale(${this.scale * audioScale}) translate3d(0,0,${push}px) rotateY(${-6 + sway}deg) rotateZ(${-camera.rot * 0.9}deg) translate3d(${-camera.x}px,${-camera.y}px,${-camera.z}px)`;
      const flyBlur = dip * 5;
      let focusedIndex = 0;
      let focusedDistance = Number.POSITIVE_INFINITY;
      this.cards.forEach((card, index) => {
        const distance = Math.hypot(card.x - camera.x, card.y - camera.y);
        if (distance < focusedDistance) {
          focusedDistance = distance;
          focusedIndex = index;
        }
        const blur = this.options.legacyTv ? 0 : clamp((distance - 360) / 100, 0, 5) + (distance > 360 ? flyBlur * 0.65 : 0);
        const near = distance < 200;
        card.card.style.opacity = this.options.legacyTv && distance > 900 ? '0.72' : '1';
        card.card.style.zIndex = index === focusedIndex ? '20' : '1';
        card.card.style.filter = this.options.legacyTv
          ? ''
          : (blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : '') + (near ? '' : ' brightness(.9)');
        if (card.video) {
          const active = near && !this.paused;
          if (active && card.video.paused) this.playMutedVideo(card.video);
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

const resolveReelSources = async (memories: Memory[], signal: AbortSignal, driveAccessToken?: string) => {
  const sources = memories.flatMap(memory => {
    const video = isVideoMemory(memory);
    const driveBacked = Boolean(memory.driveFileId && (memory.authToken || driveAccessToken));
    // Drive thumbnails are safe, fast first paint. Originals are fetched by
    // the controller after the thumbnail is visible.
    const preview = video ? memory.url || memory.thumbnail : memory.thumbnail || memory.url;
    if (!preview && !driveBacked) return [];
    return [{
      id: memory.id,
      src: preview,
      fallbackSrc: undefined,
      driveFileId: memory.driveFileId,
      authToken: memory.authToken || driveAccessToken,
      rotation: memory.orientation,
      type: video ? 'video' : 'image',
      poster: video && !driveBacked ? memory.thumbnail : undefined,
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
  cacheKey?: string;
}

const STORY_MUSIC_STORAGE_KEY = 'memoriya-story-music-v1';
// v3 makes the original camera-motion Memory Showcase the default again.
// Older saved choices are intentionally migrated away once so Story Mode
// opens with the requested camera journey on every device.
const STORY_TEMPLATE_STORAGE_KEY = 'memoriya-story-template-v3';
const STORY_EFFECT_STORAGE_KEY = 'memoriya-story-effect-v1';

interface StoredStoryMusic {
  driveSongs: DriveAudioFile[];
  driveSongsLoaded: boolean;
  queue: Array<Omit<MusicQueueItem, 'src'>>;
}

const readStoredStoryMusic = (): StoredStoryMusic | null => {
  try {
    const raw = window.localStorage.getItem(STORY_MUSIC_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredStoryMusic>;
    return {
      driveSongs: Array.isArray(value.driveSongs) ? value.driveSongs : [],
      driveSongsLoaded: Boolean(value.driveSongsLoaded),
      queue: Array.isArray(value.queue) ? value.queue.filter(track => track && track.id && track.label) : [],
    };
  } catch {
    return null;
  }
};

const writeStoredStoryMusic = (value: StoredStoryMusic) => {
  try {
    window.localStorage.setItem(STORY_MUSIC_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Local storage is optional; the current Story Mode session still works.
  }
};

const readStoredStoryEffect = (fallback: MemoryReelEffect): MemoryReelEffect => {
  try {
    const stored = window.localStorage.getItem(STORY_EFFECT_STORAGE_KEY) as MemoryReelEffect | null;
    return stored && MEMORY_REEL_EFFECTS.some(item => item.id === stored) ? stored : fallback;
  } catch {
    return fallback;
  }
};

const readStoredStoryTemplate = (fallback: MemoryReelTemplate): MemoryReelTemplate => {
  try {
    const stored = window.localStorage.getItem(STORY_TEMPLATE_STORAGE_KEY) as MemoryReelTemplate | null;
    return stored && MEMORY_REEL_TEMPLATES.some(item => item.id === stored) ? stored : fallback;
  } catch {
    return fallback;
  }
};

const buildDriveAudioUrl = (song: DriveAudioFile, token: string) =>
  `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(song.id)}?alt=media&supportsAllDrives=true&access_token=${encodeURIComponent(token)}`;

const FULLSCREEN_CONTROLS_HIDE_DELAY = 3600;

type LegacyFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void | Promise<void>;
};

type LegacyFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => void | Promise<void>;
};

const MemoryReel: React.FC<MemoryReelProps> = ({ memories, title, audio, template: initialTemplate = 'orbit', autoPlay = true, loop = true, hasMore = false, loadingMore = false, onNeedMore, driveAccessToken, driveFolderId, driveFolders, onDriveFolderChange, onDriveReconnect, onClose }) => {
  const visualMemories = useMemo(() => memories.filter(isVisualMemory), [memories]);
  const storedStoryMusic = useMemo(readStoredStoryMusic, []);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const musicPanelRef = useRef<HTMLDivElement | null>(null);
  const templatePanelRef = useRef<HTMLDivElement | null>(null);
  const effectsPanelRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<MemoryReelController | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const audioObjectUrlsRef = useRef<string[]>([]);
  const driveAccessTokenRef = useRef(driveAccessToken || '');
  const resolvedDriveAudioSourcesRef = useRef(new Map<string, string>());
  const [resolvedSources, setResolvedSources] = useState<ReelSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [progress, setProgress] = useState({ progress: 0, total: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenControlsVisible, setFullscreenControlsVisible] = useState(true);
  const [titleDraft, setTitleDraft] = useState<MemoryReelTitle>({ line: title?.line || '', big: title?.big || '' });
  const [activeTitle, setActiveTitle] = useState<MemoryReelTitle | undefined>(title);
  const [musicOpen, setMusicOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [template, setTemplate] = useState<MemoryReelTemplate>(() => readStoredStoryTemplate(initialTemplate));
  const [effect, setEffect] = useState<MemoryReelEffect>(() => readStoredStoryEffect('natural'));
  const [musicQuery, setMusicQuery] = useState('');
  const [musicResults, setMusicResults] = useState<OpenSourceMusicTrack[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [driveSongs, setDriveSongs] = useState<DriveAudioFile[]>(() => storedStoryMusic?.driveSongs || []);
  const [driveSongsLoaded, setDriveSongsLoaded] = useState(() => Boolean(storedStoryMusic?.driveSongsLoaded));
  const [driveSongsLoading, setDriveSongsLoading] = useState(false);
  const [driveUploadLoading, setDriveUploadLoading] = useState(false);
  const [musicError, setMusicError] = useState('');
  const [audioLoading, setAudioLoading] = useState(false);
  const [trackLoadingId, setTrackLoadingId] = useState('');
  const [musicName, setMusicName] = useState('');
  const [musicQueue, setMusicQueue] = useState<MusicQueueItem[]>(() => audio ? [{ id: 'initial-audio', src: audio, label: 'Background music' }] : []);
  const [loopEnabled, setLoopEnabled] = useState(loop);
  const reducedMotion = usePrefersReducedMotion();
  const legacyTvMode = useMemo(isLegacyTvBrowser, []);
  const moreRequestedRef = useRef(false);
  const hasLoadedSourcesRef = useRef(false);
  const sourceSignatureRef = useRef('');
  const moreConfigRef = useRef({ hasMore, loadingMore, onNeedMore });
  const fullscreenControlsTimerRef = useRef<number | null>(null);
  const driveSongsRequestRef = useRef(false);
  const audioManuallyStoppedRef = useRef(false);
  const audioPauseGuardRef = useRef(false);
  const musicHydratedRef = useRef(false);
  moreConfigRef.current = { hasMore, loadingMore, onNeedMore };

  useEffect(() => {
    // Story Mode owns the viewport. Without this lock, an older WebView can
    // send remote-wheel/trackpad events through the fixed overlay to Home.
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, []);

  const scrollStoryPanel = (panel: HTMLDivElement, amount: number) => {
    if (typeof panel.scrollBy === 'function') panel.scrollBy(0, amount);
    else panel.scrollTop += amount;
  };

  const handleStoryPanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, panelRef: React.RefObject<HTMLDivElement | null>) => {
    const panel = panelRef.current;
    if (!panel) return;
    const amount = event.key === 'PageDown' || event.key === 'PageUp'
      ? Math.max(180, Math.round(panel.clientHeight * 0.72))
      : 72;
    const target = event.target as HTMLElement;
    const isInteractiveControl = target !== panel && Boolean(target.closest?.('button, input, select'));
    if (event.key === 'ArrowDown' || event.key === 'PageDown') {
      // Keep native focus movement between TV buttons. Only the panel itself
      // needs a forced scroll when it owns focus.
      if (!isInteractiveControl || event.key === 'PageDown') event.preventDefault();
      event.stopPropagation();
      scrollStoryPanel(panel, amount);
    } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      if (!isInteractiveControl || event.key === 'PageUp') event.preventDefault();
      event.stopPropagation();
      scrollStoryPanel(panel, -amount);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      panel.scrollTop = event.key === 'Home' ? 0 : panel.scrollHeight;
    }
  };

  const keepFocusedControlVisible = (event: React.FocusEvent<HTMLDivElement>) => {
    const panel = event.currentTarget;
    const target = event.target as HTMLElement;
    if (target === panel || !panel.contains(target)) return;
    const panelRect = panel.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (targetRect.bottom > panelRect.bottom) panel.scrollTop += targetRect.bottom - panelRect.bottom + 12;
    else if (targetRect.top < panelRect.top) panel.scrollTop -= panelRect.top - targetRect.top + 12;
  };

  const stopPanelScrollPropagation = (event: React.WheelEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  useEffect(() => {
    if (driveAccessToken) driveAccessTokenRef.current = driveAccessToken;
  }, [driveAccessToken]);

  useEffect(() => {
    if (!musicOpen && !templateOpen && !effectsOpen) return;
    const panel = musicOpen ? musicPanelRef.current : effectsOpen ? effectsPanelRef.current : templatePanelRef.current;
    const firstControl = panel?.querySelector<HTMLElement>('button, input, select');
    if (!firstControl) return;
    const focusPanel = () => firstControl.focus();
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(focusPanel);
    else window.setTimeout(focusPanel, 0);
  }, [effectsOpen, musicOpen, templateOpen]);

  useEffect(() => {
    if (!musicOpen && !templateOpen && !effectsOpen) return;
    const closePanels = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Backspace') return;
      event.preventDefault();
      setMusicOpen(false);
      setTemplateOpen(false);
      setEffectsOpen(false);
    };
    window.addEventListener('keydown', closePanels);
    return () => window.removeEventListener('keydown', closePanels);
  }, [effectsOpen, musicOpen, templateOpen]);

  useEffect(() => {
    let active = true;
    const stored = storedStoryMusic;
    audioManuallyStoppedRef.current = true;

    const restoreQueue = async () => {
      if (!stored?.queue.length) {
        musicHydratedRef.current = true;
        return;
      }
      const restored = await Promise.all(stored.queue.map(async savedTrack => {
        if (!savedTrack.cacheKey) return null;
        try {
          let blob = await readCachedStoryMedia(savedTrack.cacheKey);
          let directDriveSource = '';
          if (!blob && savedTrack.driveFileId && driveAccessToken) {
            const song = stored.driveSongs.find(item => item.id === savedTrack.driveFileId);
            if (song) {
              // Restore the queue immediately even when IndexedDB is cold. The
              // direct Drive source can play now and the cache can warm later.
              directDriveSource = buildDriveAudioUrl(song, driveAccessToken);
            }
          }
          if ((!blob && !directDriveSource) || !active) return null;
          const src = blob ? URL.createObjectURL(blob) : directDriveSource;
          if (blob) audioObjectUrlsRef.current.push(src);
          return { ...savedTrack, src } satisfies MusicQueueItem;
        } catch {
          return null;
        }
      }));
      if (!active) return;
      const nextQueue = restored.filter((track): track is MusicQueueItem => Boolean(track));
      if (nextQueue.length) {
        setMusicQueue(current => current.length ? current : nextQueue);
        setMusicName(current => current || nextQueue[0].label);
      }
      musicHydratedRef.current = true;
    };

    void restoreQueue();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!musicHydratedRef.current) return;
    writeStoredStoryMusic({
      driveSongs,
      driveSongsLoaded,
      queue: musicQueue.map(({ src: _src, ...track }) => track),
    });
  }, [driveSongs, driveSongsLoaded, musicQueue]);

  // Drive access tokens and object URLs can change while the same media set
  // is playing. They must not rebuild the reel or restart its clock.
  const sourceSignature = visualMemories.map(memory => [
    memory.driveFileId || memory.id,
    memory.type,
    memory.mimeType || '',
    memory.date,
    memory.driveFileId ? '' : memory.url,
  ].join(':')).join('|');

  useEffect(() => {
    setTitleDraft({ line: title?.line || '', big: title?.big || '' });
    setActiveTitle(title);
  }, [title?.line, title?.big]);

  useEffect(() => {
    if (sourceSignatureRef.current === sourceSignature) return;
    sourceSignatureRef.current = sourceSignature;
    const controller = new AbortController();
    const photos = visualMemories.filter(memory => !isVideoMemory(memory));
    const videos = visualMemories.filter(memory => isVideoMemory(memory));
    const liveUpdate = hasLoadedSourcesRef.current;
    // Keep the current wall visible during a live Drive change. The reel
    // controller swaps the updated list atomically after it has loaded.
    if (!liveUpdate) setLoading(true);
    void (async () => {
      const photoSources = await resolveReelSources(photos, controller.signal, driveAccessToken);
      if (controller.signal.aborted) return;
      setResolvedSources(photoSources);
      if (photoSources.length) setLoading(false);

      // Videos are intentionally appended after the photo wall is ready so a
      // large video cannot delay the first visual sequence.
      const videoSources = await resolveReelSources(videos, controller.signal, driveAccessToken);
      if (controller.signal.aborted) return;
      setResolvedSources(current => [...current, ...videoSources]);
      // Resolve an empty input as a completed state too. This prevents the
      // progress overlay from hanging when a live Drive folder is cleared or
      // all of its media fails validation.
      if (!photoSources.length && !liveUpdate) setLoading(false);
    })();
    return () => {
      controller.abort();
    };
  }, [driveAccessToken, sourceSignature, visualMemories]);

  useEffect(() => {
    if (!driveAccessToken) return;
    setResolvedSources(current => current.map(source => source.driveFileId
      ? { ...source, authToken: driveAccessToken }
      : source));
  }, [driveAccessToken]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const controller = new MemoryReelController(stage, {
      items: [],
      title: activeTitle,
      audio: undefined,
      loop: loopEnabled,
      reducedMotion,
      legacyTv: legacyTvMode,
      template,
      onProgress: (current, total) => {
        setProgress({ progress: current, total });
        const more = moreConfigRef.current;
        if (more.hasMore && !more.loadingMore && !moreRequestedRef.current && total > 0 && current / total >= 0.55) {
          moreRequestedRef.current = true;
          more.onNeedMore?.();
        }
      },
      onStateChange: setPlaying,
      onAudioStateChange: setAudioPlaying,
    });
    controllerRef.current = controller;
    controller.setAudioAnalysisElement(audioPlayerRef.current);
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [audio, legacyTvMode, reducedMotion]);

  useEffect(() => {
    controllerRef.current?.setTemplate(template);
    try {
      window.localStorage.setItem(STORY_TEMPLATE_STORAGE_KEY, template);
    } catch {
      // Template persistence is optional; the current Story Mode remains active.
    }
  }, [template]);

  useEffect(() => {
    controllerRef.current?.setEffect(effect);
    try {
      window.localStorage.setItem(STORY_EFFECT_STORAGE_KEY, effect);
    } catch {
      // Effect persistence is optional; the current story remains active.
    }
  }, [effect]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    const preserveProgress = hasLoadedSourcesRef.current;
    if (resolvedSources.length) hasLoadedSourcesRef.current = true;
    void controller.setItems(resolvedSources, preserveProgress).then(() => {
      if (resolvedSources.length && autoPlay && !preserveProgress) controller.play();
    });
  }, [autoPlay, resolvedSources]);

  useEffect(() => {
    controllerRef.current?.setLoop(loopEnabled);
  }, [loopEnabled]);

  useEffect(() => {
    const sources = musicQueue.map(track => track.src).filter(Boolean);
    // Story Mode uses a dedicated native audio player. The reel controller
    // owns only the visual timeline so it cannot reset or pause music while a
    // Drive/local blob is loading.
    const element = audioPlayerRef.current;
    const source = sources[0] || '';
    if (element && element.src !== source) {
      audioPauseGuardRef.current = true;
      element.pause();
      if (source) {
        element.src = source;
        element.load();
      } else {
        element.removeAttribute('src');
        element.load();
      }
      audioPauseGuardRef.current = false;
      setAudioPlaying(false);
    }
  }, [musicQueue]);

  useEffect(() => {
    moreRequestedRef.current = false;
  }, [visualMemories.length, hasMore]);

  useEffect(() => {
    if (!playing || !musicQueue.length || audioManuallyStoppedRef.current) return;
    const element = audioPlayerRef.current;
    const source = musicQueue[0].src;
    if (!element || !source) return;
    if (element.src !== source) {
      audioPauseGuardRef.current = true;
      element.pause();
      element.src = source;
      element.load();
      audioPauseGuardRef.current = false;
    }
    void element.play()
      .then(() => setAudioPlaying(true))
      .catch(() => setAudioPlaying(false));
  }, [playing, musicQueue]);

  useEffect(() => {
    controllerRef.current?.setTitle(activeTitle);
  }, [activeTitle]);

  useEffect(() => {
    const onFullscreen = () => {
      const doc = document as LegacyFullscreenDocument;
      const shell = stageRef.current?.parentElement;
      setFullscreen(doc.fullscreenElement === shell || doc.webkitFullscreenElement === shell);
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('webkitfullscreenchange', onFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('webkitfullscreenchange', onFullscreen);
    };
  }, []);

  useEffect(() => {
    const clearHideTimer = () => {
      if (fullscreenControlsTimerRef.current !== null) {
        window.clearTimeout(fullscreenControlsTimerRef.current);
        fullscreenControlsTimerRef.current = null;
      }
    };

    const scheduleHide = () => {
      clearHideTimer();
      if (fullscreen && playing) {
        fullscreenControlsTimerRef.current = window.setTimeout(() => {
          setFullscreenControlsVisible(false);
          fullscreenControlsTimerRef.current = null;
        }, FULLSCREEN_CONTROLS_HIDE_DELAY);
      }
    };

    const revealControls = () => {
      if (!fullscreen) return;
      setFullscreenControlsVisible(true);
      scheduleHide();
    };

    if (!fullscreen) {
      clearHideTimer();
      setFullscreenControlsVisible(true);
      return clearHideTimer;
    }

    setFullscreenControlsVisible(true);
    scheduleHide();
    window.addEventListener('pointermove', revealControls, { passive: true });
    window.addEventListener('pointerdown', revealControls, { passive: true });
    window.addEventListener('touchstart', revealControls, { passive: true });
    window.addEventListener('keydown', revealControls);
    return () => {
      clearHideTimer();
      window.removeEventListener('pointermove', revealControls);
      window.removeEventListener('pointerdown', revealControls);
      window.removeEventListener('touchstart', revealControls);
      window.removeEventListener('keydown', revealControls);
    };
  }, [fullscreen, playing]);

  useEffect(() => () => {
    audioObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    audioObjectUrlsRef.current = [];
    resolvedDriveAudioSourcesRef.current.clear();
  }, []);

  const toggleFullscreen = async () => {
    const shell = stageRef.current?.parentElement;
    if (!shell) return;
    // Android TV WebViews often expose a partial Fullscreen API. Calling it
    // can leave the renderer waiting forever and trigger the TV's "page not
    // responding" dialog. The WebView already occupies the TV screen, so a
    // CSS cinema surface is the reliable fullscreen implementation there.
    if (legacyTvMode) {
      setFullscreen(value => !value);
      setFullscreenControlsVisible(true);
      return;
    }
    const doc = document as LegacyFullscreenDocument;
    const activeFullscreen = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (activeFullscreen) {
      if (doc.exitFullscreen) await doc.exitFullscreen().catch(() => undefined);
      else await Promise.resolve(doc.webkitExitFullscreen?.()).catch(() => undefined);
      return;
    }
    const legacyShell = shell as LegacyFullscreenElement;
    if (shell.requestFullscreen) await shell.requestFullscreen().catch(() => undefined);
    else await Promise.resolve(legacyShell.webkitRequestFullscreen?.()).catch(() => undefined);
  };

  const chooseMusicFiles = (files: FileList | File[]) => {
    const nextFiles = Array.from(files || []).filter(isAudioFile).map(normalizeAudioFile);
    if (!nextFiles.length) return;
    audioManuallyStoppedRef.current = false;
    const nextTracks = nextFiles.map((file, index) => {
      const src = URL.createObjectURL(file);
      audioObjectUrlsRef.current.push(src);
      const cacheKey = `local-audio-${file.name}-${file.lastModified}-${index}`;
      void writeCachedStoryMedia(cacheKey, file, file.type);
      return { id: cacheKey, src, cacheKey, label: file.name, owned: true, source: 'local' } satisfies MusicQueueItem;
    });
    setMusicName(nextTracks[0].label);
    setMusicQueue(current => [...current, ...nextTracks]);
  };

  const downloadRemoteAudio = async (source: string) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(source, { signal: controller.signal });
      if (!response.ok) throw new Error(`Audio source returned ${response.status}.`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('The audio source returned an empty file.');
      const playableBlob = blob.type.startsWith('audio/')
        ? blob
        : new Blob([blob], { type: audioMimeType(source, blob.type) });
      const objectUrl = URL.createObjectURL(playableBlob);
      audioObjectUrlsRef.current.push(objectUrl);
      return { src: objectUrl, blob: playableBlob };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('Audio download took too long. Please try again.');
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const normalizeDriveAudioBlob = (blob: Blob, song: DriveAudioFile) => {
    const playableType = audioMimeType(song.name, song.mimeType || blob.type);
    return blob.type === playableType ? blob : new Blob([blob], { type: playableType });
  };

  const driveAudioCacheKey = (song: DriveAudioFile) =>
    `drive-audio-${song.id}-${song.modifiedTime || 'current'}`;

  const driveAudioUrl = (song: DriveAudioFile, token: string) =>
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(song.id)}?alt=media&supportsAllDrives=true&access_token=${encodeURIComponent(token)}`;

  const warmDriveAudioCache = async (song: DriveAudioFile, cacheKey: string, token: string) => {
    if (await readCachedStoryMedia(cacheKey)) return;
    try {
      const result = await googleDriveService.downloadMediaFileWithReconnect(token, song.id);
      const playableBlob = normalizeDriveAudioBlob(result.blob, song);
      await writeCachedStoryMedia(cacheKey, playableBlob, playableBlob.type);
    } catch {
      // The queue already has a direct authenticated source. Cache warming is
      // best-effort so a slow Drive download can never block queue insertion.
    }
  };

  const reconnectDriveForPlayback = async () => {
    const token = onDriveReconnect
      ? await onDriveReconnect()
      : await googleDriveService.refreshAccessToken();
    if (!token) throw new Error('Google Drive authorization was not refreshed. Reconnect Drive and try again.');
    driveAccessTokenRef.current = token;
    saveDriveAccessToken(token);
    return token;
  };

  const prepareDriveTrackForPlayback = async (track: MusicQueueItem, allowRefresh = false) => {
    if (track.source !== 'drive' || !track.driveFileId) return track.src;
    const song = driveSongs.find(item => item.id === track.driveFileId);
    if (!song) return track.src;
    const cacheKey = track.cacheKey || driveAudioCacheKey(song);
    const rememberedSource = resolvedDriveAudioSourcesRef.current.get(cacheKey);
    if (rememberedSource) return rememberedSource;

    const createSource = async (token: string) => {
      const cached = await readCachedStoryMedia(cacheKey);
      const blob = cached || await googleDriveService.downloadMediaFile(token, song.id);
      const playableBlob = normalizeDriveAudioBlob(blob, song);
      if (!cached) void writeCachedStoryMedia(cacheKey, playableBlob, playableBlob.type);
      const objectUrl = URL.createObjectURL(playableBlob);
      resolvedDriveAudioSourcesRef.current.set(cacheKey, objectUrl);
      audioObjectUrlsRef.current.push(objectUrl);
      return objectUrl;
    };

    let token = driveAccessTokenRef.current || driveAccessToken;
    if (!token) throw new Error('Connect Google Drive before playing this song.');
    try {
      return await createSource(token);
    } catch (error) {
      if (!allowRefresh || !isDriveAuthorizationError(error)) throw error;
      token = await reconnectDriveForPlayback();
      return createSource(token);
    }
  };

  const chooseMusicTrack = async (track: OpenSourceMusicTrack) => {
    if (trackLoadingId) return;
    if (musicQueue.some(item => item.src === track.previewUrl || item.id === track.id)) return;
    setTrackLoadingId(track.id);
    setMusicError('');
    try {
      const downloaded = await downloadRemoteAudio(track.previewUrl);
      const src = downloaded.src;
      const cacheKey = `online-audio-${track.id}`;
      void writeCachedStoryMedia(cacheKey, downloaded.blob, downloaded.blob.type);
      audioManuallyStoppedRef.current = false;
      setMusicName(`${track.title} · ${track.artist}`);
      setMusicQueue(current => current.some(item => item.id === track.id)
        ? current
        : [...current, { id: track.id, src, cacheKey, label: `${track.title} · ${track.artist}`, source: 'online' }]);
    } catch (error) {
      setMusicError(error instanceof Error ? `This search result could not be loaded: ${error.message}` : 'This search result could not be loaded.');
    } finally {
      setTrackLoadingId('');
    }
  };

  const playQueuedMusic = async (index: number) => {
    const track = musicQueue[index];
    if (!track) return;
    audioManuallyStoppedRef.current = false;
    setMusicName(track.label);
    setMusicQueue(current => index === 0 ? current : [track, ...current.filter(item => item.id !== track.id)]);
    const element = audioPlayerRef.current;
    if (!element) return;
    setAudioLoading(true);
    void controllerRef.current?.resumeAudioAnalysis().catch(() => undefined);
    try {
      // Keep the first play() call inside the user's tap event. Mobile
      // browsers revoke the user-activation token while an async Drive
      // download is pending; this is especially visible when the phone is
      // mirrored to a TV. The authenticated media URL is safe to use as the
      // immediate native source, while the blob/cache path remains the
      // fallback for browsers that cannot stream it directly.
      if (track.source === 'drive' && track.src && !track.src.startsWith('blob:')) {
        audioPauseGuardRef.current = true;
        element.pause();
        if (element.src !== track.src) {
          element.src = track.src;
          element.load();
        }
        audioPauseGuardRef.current = false;
        try {
          await element.play();
          setAudioPlaying(true);
          setMusicError('');
          return;
        } catch {
          // Fall through to the downloaded blob/cache source below.
        }
      }
      const source = await prepareDriveTrackForPlayback(track, true);
      audioPauseGuardRef.current = true;
      element.pause();
      if (element.src !== source) {
        element.src = source;
        element.load();
      }
      audioPauseGuardRef.current = false;
      await element.play();
      setAudioPlaying(true);
      setMusicError('');
    } catch (error) {
      audioPauseGuardRef.current = false;
      setAudioPlaying(false);
      setMusicError(track.source === 'drive'
        ? (error instanceof Error && /authorization|access denied|reconnect/i.test(error.message)
          ? 'Google Drive authorization expired. Tap Reconnect Drive, then play the queued song again.'
          : 'Drive audio could not be downloaded for playback. Check the file format and try again.')
        : 'Tap Play music once to allow audio on this device.');
    } finally {
      setAudioLoading(false);
    }
  };

  const moveMusic = (index: number, direction: -1 | 1) => {
    audioManuallyStoppedRef.current = true;
    audioPauseGuardRef.current = true;
    audioPlayerRef.current?.pause();
    audioPauseGuardRef.current = false;
    setAudioPlaying(false);
    setMusicQueue(current => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const removeMusic = (index: number) => {
    audioManuallyStoppedRef.current = true;
    audioPauseGuardRef.current = true;
    audioPlayerRef.current?.pause();
    audioPauseGuardRef.current = false;
    setAudioPlaying(false);
    const removed = musicQueue[index];
    if (removed?.src.startsWith('blob:')) {
      URL.revokeObjectURL(removed.src);
      audioObjectUrlsRef.current = audioObjectUrlsRef.current.filter(url => url !== removed.src);
    }
    setMusicQueue(current => {
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const loadDriveSongs = async () => {
    const initialToken = driveAccessTokenRef.current || driveAccessToken;
    if (!initialToken) {
      setMusicError('Connect Google Drive to load songs stored there.');
      return;
    }
    if (driveSongsRequestRef.current) return;
    driveSongsRequestRef.current = true;
    setDriveSongsLoading(true);
    setMusicError('');
    try {
      // Loading is an explicit user action. If the short-lived token has
      // expired, renew it here before giving up with a 403 message.
      let token = initialToken;
      try {
        setDriveSongs(await googleDriveService.listAudioFiles(token));
      } catch (error) {
        if (!isDriveAuthorizationError(error)) throw error;
        token = await reconnectDriveForPlayback();
        setDriveSongs(await googleDriveService.listAudioFiles(token));
      }
      setDriveSongsLoaded(true);
    } catch (error) {
      setMusicError(error instanceof Error ? error.message : 'Drive songs could not be loaded.');
    } finally {
      setDriveSongsLoading(false);
      driveSongsRequestRef.current = false;
    }
  };

  useEffect(() => {
    if (!driveAccessToken) {
      setDriveSongs([]);
      setDriveSongsLoaded(false);
    }
  }, [driveAccessToken]);

  const chooseDriveSong = (song: DriveAudioFile) => {
    const token = driveAccessTokenRef.current || driveAccessToken;
    if (!token) return;
    const trackId = `drive-audio-${song.id}`;
    const existingTrack = musicQueue.find(item => item.driveFileId === song.id || item.id === trackId);
    if (existingTrack) {
      audioManuallyStoppedRef.current = true;
      audioPauseGuardRef.current = true;
      audioPlayerRef.current?.pause();
      audioPauseGuardRef.current = false;
      setAudioPlaying(false);
      setMusicName(existingTrack.label);
      setMusicQueue(current => [existingTrack, ...current.filter(item => item.id !== existingTrack.id)]);
      setMusicError('');
      return;
    }
    setMusicError('');
    const cacheKey = driveAudioCacheKey(song);
    // Queue insertion is immediate. The authenticated Drive URL lets the
    // native audio element start directly from the user's tap on mobile and
    // TV, while the IndexedDB cache warms without blocking the UI.
    const selectedTrack = {
      id: trackId,
      src: driveAudioUrl(song, token),
      label: song.name,
      source: 'drive',
      driveFileId: song.id,
      cacheKey,
    } satisfies MusicQueueItem;
    audioManuallyStoppedRef.current = true;
    audioPauseGuardRef.current = true;
    audioPlayerRef.current?.pause();
    audioPauseGuardRef.current = false;
    setAudioPlaying(false);
    setMusicName(song.name);
    setMusicQueue(current => [selectedTrack, ...current.filter(item => item.driveFileId !== song.id && item.id !== trackId)]);
    void warmDriveAudioCache(song, cacheKey, token);
  };

  const uploadSongsToDrive = async (files: FileList | File[]) => {
    if (!driveAccessToken) {
      setMusicError('Connect Google Drive before uploading songs.');
      return;
    }
    const nextFiles = Array.from(files || []).filter(isAudioFile).map(normalizeAudioFile);
    if (!nextFiles.length) return;
    setDriveUploadLoading(true);
    setMusicError('');
    try {
      const uploadedTracks: MusicQueueItem[] = [];
      let token = driveAccessToken;
      for (const file of nextFiles) {
        let uploaded: DriveAudioFile;
        try {
          uploaded = await googleDriveService.uploadMedia(token, file);
        } catch (error) {
          throw error;
        }
        const localSrc = URL.createObjectURL(file);
        audioObjectUrlsRef.current.push(localSrc);
        uploadedTracks.push({
          id: `drive-audio-${uploaded.id}`,
          src: localSrc,
          label: uploaded.name || file.name,
          source: 'drive',
          driveFileId: uploaded.id,
          cacheKey: driveAudioCacheKey(uploaded),
        });
        void writeCachedStoryMedia(driveAudioCacheKey(uploaded), file, uploaded.mimeType || file.type);
      }
      setMusicName(uploadedTracks[0]?.label || '');
      audioManuallyStoppedRef.current = false;
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
    } catch (error) {
      setMusicResults([]);
      setMusicError(error instanceof Error ? error.message : 'Music search failed. Please try again.');
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
    if (next) {
      setTemplateOpen(false);
      setEffectsOpen(false);
    }
  };

  const openTemplates = () => {
    setTemplateOpen(value => !value);
    setMusicOpen(false);
    setEffectsOpen(false);
  };

  const openEffects = () => {
    setEffectsOpen(value => !value);
    setMusicOpen(false);
    setTemplateOpen(false);
  };

  const playStoryAudio = async (fromUserGesture = false) => {
    const element = audioPlayerRef.current;
    const sourceTrack = musicQueue[0];
    const source = sourceTrack?.src;
    if (!element || !source || audioManuallyStoppedRef.current) return false;
    setAudioLoading(true);
    if (fromUserGesture) void controllerRef.current?.resumeAudioAnalysis().catch(() => undefined);
    try {
      // Start Drive playback before awaiting any network work. Calling
      // play() after prepareDriveTrackForPlayback() loses mobile user
      // activation and can be blocked when the phone is screen-mirroring.
      if (fromUserGesture && sourceTrack.source === 'drive' && !source.startsWith('blob:')) {
        audioPauseGuardRef.current = true;
        element.pause();
        if (element.src !== source) {
          element.src = source;
          element.load();
        }
        audioPauseGuardRef.current = false;
        try {
          await element.play();
          setAudioPlaying(true);
          setMusicError('');
          return true;
        } catch {
          // The direct stream may fail on an older browser; use the local
          // object URL fallback below.
        }
      }
      const playableSource = await prepareDriveTrackForPlayback(sourceTrack, fromUserGesture);
      if (element.src !== playableSource) {
        audioPauseGuardRef.current = true;
        element.pause();
        element.src = playableSource;
        element.load();
        audioPauseGuardRef.current = false;
      }
      await element.play();
      setAudioPlaying(true);
      setMusicError('');
      return true;
    } catch (error) {
      audioPauseGuardRef.current = false;
      setAudioPlaying(false);
      setMusicError(sourceTrack?.source === 'drive'
        ? (error instanceof Error && /authorization|access denied|reconnect/i.test(error.message)
          ? 'Google Drive authorization expired. Tap Reconnect Drive, then play the queued song again.'
          : 'Drive audio could not be downloaded for playback. Check the file format and try again.')
        : 'Tap Play music once to allow audio on this device.');
      return false;
    } finally {
      setAudioLoading(false);
    }
  };

  const toggleStoryPlayback = () => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (playing) {
      controller.pause();
      audioPauseGuardRef.current = true;
      audioPlayerRef.current?.pause();
      audioPauseGuardRef.current = false;
      return;
    }
    controller.play();
    void playStoryAudio(true);
  };

  const advanceMusic = async () => {
    const currentQueue = musicQueue;
    const element = audioPlayerRef.current;
    if (!currentQueue.length || !element) return;
    if (currentQueue.length === 1 && !loopEnabled) {
      setAudioPlaying(false);
      return;
    }

    const nextQueue = loopEnabled
      ? [...currentQueue.slice(1), currentQueue[0]]
      : currentQueue.slice(1);
    const nextTrack = nextQueue[0];
    if (!nextTrack) {
      setAudioPlaying(false);
      return;
    }
    setMusicQueue(nextQueue);
    setMusicName(nextTrack.label);
    audioManuallyStoppedRef.current = false;
    setAudioLoading(true);
    try {
      const source = await prepareDriveTrackForPlayback(nextTrack);
      audioPauseGuardRef.current = true;
      element.pause();
      element.src = source;
      element.load();
      audioPauseGuardRef.current = false;
      await element.play();
      setAudioPlaying(true);
    } catch {
      audioPauseGuardRef.current = false;
      setAudioPlaying(false);
    } finally {
      setAudioLoading(false);
    }
  };

  const toggleMusic = async () => {
    const audioElement = audioPlayerRef.current;
    if (!audioElement || !musicQueue.length) return;
    if (!audioElement.paused) {
      audioManuallyStoppedRef.current = true;
      audioElement.pause();
      return;
    }
    audioManuallyStoppedRef.current = false;
    await playStoryAudio(true);
  };

  return (
    <div className={`memory-reel-overlay${fullscreen ? ' is-fullscreen' : ''}`} role="dialog" aria-modal="true" aria-label="Memory story reel">
      <div className={`memory-reel-shell${fullscreen ? ' is-fullscreen' : ''}${musicOpen || templateOpen || effectsOpen ? ' has-panel-open' : ''}`}>
        <div ref={stageRef} className="reel memory-reel-stage" />
        <div className="memory-reel-toolbar">
          <button type="button" onClick={toggleStoryPlayback} disabled={loading}>
            {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" onClick={() => controllerRef.current?.restart()} disabled={loading}><RotateCcw size={16} /> Replay</button>
          <button type="button" onClick={toggleFullscreen}><>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</> {fullscreen ? 'Exit' : 'Fullscreen'}</button>
          <button type="button" className={musicOpen ? 'is-active' : ''} aria-expanded={musicOpen} onClick={openMusic}><Music2 size={16} /> Music {musicQueue.length ? `(${musicQueue.length})` : driveSongs.length ? `(${driveSongs.length} Drive)` : ''}</button>
          <button type="button" className={templateOpen ? 'is-active' : ''} aria-expanded={templateOpen} onClick={openTemplates}><WandSparkles size={16} /> Template</button>
          {musicQueue.length > 0 && <button type="button" onClick={() => void toggleMusic()} aria-pressed={audioPlaying}><Volume2 size={16} /> {audioPlaying ? 'Stop music' : 'Play music'}</button>}
          <button type="button" className={effectsOpen ? 'is-active' : ''} aria-expanded={effectsOpen} onClick={openEffects}><WandSparkles size={16} /> Effects</button>
          {driveFolders && driveFolders.length > 0 && onDriveFolderChange && (
            <label className="memory-reel-folder-picker"><span>Drive folder</span><select value={driveFolderId || ''} onChange={event => onDriveFolderChange(event.target.value)} aria-label="Choose Story Mode Drive folder"><option value="">All My Drive photos</option>{driveFolders.filter(folder => folder.id).map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
          )}
          <button type="button" onClick={() => setLoopEnabled(value => !value)} aria-pressed={loopEnabled}>{loopEnabled ? 'Loop On' : 'Loop Off'}</button>
          {onClose && <button type="button" className="memory-reel-close" onClick={onClose}><X size={17} /> Close</button>}
        </div>
        <audio
          ref={audioPlayerRef}
          className={`memory-reel-audio-player${musicOpen && musicQueue.length ? ' is-visible' : ''}`}
          controls
          crossOrigin="anonymous"
          playsInline
          preload="metadata"
          aria-label="Story music player"
          onLoadStart={() => setAudioLoading(true)}
          onWaiting={() => setAudioLoading(true)}
          onCanPlay={() => setAudioLoading(false)}
          onLoadedMetadata={() => setAudioLoading(false)}
          onPlaying={() => { setAudioLoading(false); setAudioPlaying(true); }}
          onPause={() => {
            setAudioPlaying(false);
            if (!audioPauseGuardRef.current) audioManuallyStoppedRef.current = true;
          }}
          onEnded={() => void advanceMusic()}
          onError={() => {
            setAudioLoading(false);
            setAudioPlaying(false);
            setMusicError(musicQueue[0]?.source === 'drive'
              ? 'Drive audio could not play. Tap Reconnect Drive, then select the queued song again.'
              : 'This audio file was downloaded, but this browser or TV cannot decode its format. MP3, M4A/AAC, WAV, OGG, and Opus are the most compatible choices.');
          }}
        />
        <div
          className={`memory-reel-fullscreen-controls${fullscreenControlsVisible ? '' : ' is-hidden'}`}
          aria-label="Fullscreen story controls"
          aria-hidden={!fullscreenControlsVisible}
        >
          <button type="button" onClick={toggleStoryPlayback} disabled={loading} aria-label={playing ? 'Pause story' : 'Play story'}>
            {playing ? <Pause size={19} /> : <Play size={19} />}
          </button>
          {musicQueue.length > 0 && <button type="button" onClick={() => void toggleMusic()} aria-pressed={audioPlaying} aria-label={audioPlaying ? 'Stop music' : 'Play music'}>
            <Volume2 size={19} />
          </button>}
          <button type="button" onClick={toggleFullscreen} aria-label="Exit fullscreen"><Minimize2 size={19} /></button>
        </div>
        <div className="memory-reel-progress-text">{loading ? 'Preparing your memories…' : `${Math.round(progress.progress)}s / ${Math.round(progress.total)}s`}</div>
        <div className="memory-reel-editor">
          <input aria-label="Story title line" value={titleDraft.line || ''} onChange={event => setTitleDraft(current => ({ ...current, line: event.target.value }))} placeholder="Title line" />
          <input aria-label="Story big text" value={titleDraft.big || ''} onChange={event => setTitleDraft(current => ({ ...current, big: event.target.value }))} placeholder="Big text" />
          <button type="button" onClick={applyTitle}>Apply title</button>
        </div>
        {musicOpen && (
          <div
            ref={musicPanelRef}
            className="memory-reel-music-panel"
            tabIndex={0}
            onKeyDown={event => handleStoryPanelKeyDown(event, musicPanelRef)}
            onFocusCapture={keepFocusedControlVisible}
            onWheel={stopPanelScrollPropagation}
            onTouchMove={stopPanelScrollPropagation}
          >
            <div className="memory-reel-panel-heading">
              <div>
                <strong>Story music</strong>
                <span>{musicQueue.length ? `${musicQueue.length} queued` : 'Choose a song'}</span>
              </div>
              <button type="button" className="memory-reel-panel-close" onClick={() => setMusicOpen(false)} aria-label="Close music panel">
                <X size={17} />
              </button>
            </div>
            {musicQueue.length > 0 && (
              <button type="button" className="memory-reel-music-primary" onClick={() => void toggleMusic()} aria-pressed={audioPlaying}>
                <Volume2 size={16} /> {audioLoading ? 'Loading music…' : audioPlaying ? 'Stop music' : 'Play selected music'}
              </button>
            )}
            <div className="memory-reel-music-search">
              <input value={musicQuery} onChange={event => setMusicQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void searchMusic(); }} placeholder="Search free music…" />
              <button type="button" onClick={() => void searchMusic()} disabled={musicLoading}><Search size={15} /> {musicLoading ? 'Searching…' : 'Search'}</button>
              <label className="memory-reel-upload"><Upload size={15} /> Add local songs<input type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac,.aiff,.aif,.mka,.webm,.amr,.wma" multiple onChange={event => { chooseMusicFiles(event.target.files || []); event.currentTarget.value = ''; }} /></label>
              <label className="memory-reel-upload memory-reel-drive-upload"><Upload size={15} /> {driveUploadLoading ? 'Uploading...' : 'Upload songs to Drive'}<input type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac,.aiff,.aif,.mka,.webm,.amr,.wma" multiple disabled={driveUploadLoading || !driveAccessToken} onChange={event => { void uploadSongsToDrive(event.target.files || []); event.currentTarget.value = ''; }} /></label>
              {driveAccessToken && <button type="button" onClick={() => void loadDriveSongs()} disabled={driveSongsLoading}><Search size={15} /> {driveSongsLoading ? 'Loading Drive songs...' : 'Load Drive songs'}</button>}
            </div>
            <p className="memory-reel-music-note">Only photos and videos appear in the story. Songs are used as the audio queue. Drive is checked only when you press “Load Drive songs”.</p>
            {musicError && <div className="memory-reel-music-error" role="alert">
              <p>{musicError}</p>
              {onDriveReconnect && /authorization expired|access was denied|reconnect(?: google)? drive|drive audio could not play/i.test(musicError) && <button type="button" onClick={() => void onDriveReconnect()}>Reconnect Drive</button>}
            </div>}
            {musicName && <p className="memory-reel-current-music">Now selected: {musicName}</p>}
            {musicQueue.length > 0 && (
              <div className="memory-reel-queue">
                {musicQueue.map((track, index) => (
                  <div className="memory-reel-queue-item" key={track.id}>
                    <button type="button" className="memory-reel-queue-select" onClick={() => void playQueuedMusic(index)} aria-label={`Play ${track.label}`}><b>{index + 1}.</b> {track.label}</button>
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
                    <strong>{musicQueue.some(track => track.driveFileId === song.id) ? '✓ Queued · ' : ''}{song.name}</strong>
                  </button>
                ))}
              </div>
            )}
            {driveAccessToken && driveSongsLoaded && !driveSongs.length && !musicError && (
              <p className="memory-reel-music-note">No supported audio files were found in Drive. Upload an MP3, M4A, WAV, OGG, FLAC, AAC, or similar file, then press “Load Drive songs” again.</p>
            )}
            {musicResults.map(track => (
              <button type="button" className="memory-reel-track" key={track.id} onClick={() => void chooseMusicTrack(track)} disabled={Boolean(trackLoadingId && trackLoadingId !== track.id)}>
                <strong>{trackLoadingId === track.id ? 'Loading audio…' : track.title}</strong><span>{track.artist}</span>
              </button>
            ))}
          </div>
        )}
        {templateOpen && (
          <div
            ref={templatePanelRef}
            className="memory-reel-template-panel"
            aria-label="Choose a cinematic Story Mode template"
            tabIndex={0}
            onKeyDown={event => handleStoryPanelKeyDown(event, templatePanelRef)}
            onFocusCapture={keepFocusedControlVisible}
            onWheel={stopPanelScrollPropagation}
            onTouchMove={stopPanelScrollPropagation}
          >
            <div className="memory-reel-template-heading">
              <div><WandSparkles size={16} /><strong>Choose your cinematic look</strong></div>
              <div className="memory-reel-template-heading-actions">
                <span>{MEMORY_REEL_TEMPLATES.find(item => item.id === template)?.name}</span>
                <button type="button" className="memory-reel-panel-close" onClick={() => setTemplateOpen(false)} aria-label="Close template panel">
                  <X size={17} />
                </button>
              </div>
            </div>
            <div className="memory-reel-template-grid">
              {MEMORY_REEL_TEMPLATES.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  className={template === item.id ? 'is-active' : ''}
                  onClick={() => setTemplate(item.id)}
                  aria-pressed={template === item.id}
                >
                  <span className="memory-reel-template-number">{String(index + 1).padStart(2, '0')}</span>
                  <span><strong>{item.name}</strong><small>{item.description}</small></span>
                </button>
              ))}
            </div>
          </div>
        )}
        {effectsOpen && (
          <div
            ref={effectsPanelRef}
            className="memory-reel-template-panel memory-reel-effects-panel"
            aria-label="Choose music reactive effects"
            tabIndex={0}
            onKeyDown={event => handleStoryPanelKeyDown(event, effectsPanelRef)}
            onFocusCapture={keepFocusedControlVisible}
            onWheel={stopPanelScrollPropagation}
            onTouchMove={stopPanelScrollPropagation}
          >
            <div className="memory-reel-template-heading">
              <div><WandSparkles size={16} /><strong>Music-reactive effects</strong></div>
              <div className="memory-reel-template-heading-actions">
                <span>{MEMORY_REEL_EFFECTS.find(item => item.id === effect)?.name}</span>
                <button type="button" className="memory-reel-panel-close" onClick={() => setEffectsOpen(false)} aria-label="Close effects panel">
                  <X size={17} />
                </button>
              </div>
            </div>
            <p className="memory-reel-effects-note">Effects follow the real music spectrum with a soft response. Choose Off for a clean, still overlay.</p>
            <div className="memory-reel-effect-grid">
              {MEMORY_REEL_EFFECTS.map(item => (
                <button
                  type="button"
                  key={item.id}
                  className={effect === item.id ? 'is-active' : ''}
                  onClick={() => setEffect(item.id)}
                  aria-pressed={effect === item.id}
                >
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>
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
    const legacyQuery = query as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    };
    if (query.addEventListener) query.addEventListener('change', update);
    else legacyQuery.addListener?.(update);
    return () => {
      if (query.removeEventListener) query.removeEventListener('change', update);
      else legacyQuery.removeListener?.(update);
    };
  }, []);
  return reduced;
};

export default MemoryReel;
