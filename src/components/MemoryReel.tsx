import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import ffmpegCoreScript from '@ffmpeg/core?url';
import ffmpegCoreWasm from '@ffmpeg/core/wasm?url';
import { HardDrive, Maximize2, Minimize2, Music2, Pause, Play, RotateCcw, Search, Upload, Volume2, VolumeX, WandSparkles, X } from 'lucide-react';
import { isVisualMemory, type Memory } from '../data/memories';
import { googleDriveService, isDriveAuthorizationError, type DriveAudioFile } from '../services/googleDriveService';
import { readDriveAuthRequired, saveDriveAccessToken, saveDriveAuthRequired } from '../services/driveLibrary';
import { searchOpenSourceMusic, type OpenSourceMusicTrack } from '../services/openSourceMusic';
import { readCachedDriveMedia } from '../services/driveCache';
import { readCachedStoryMedia, writeCachedStoryMedia } from '../services/storyMediaCache';
import { withMediaFetch } from '../utils/mediaQueue';
import { isLegacyTvBrowser } from '../utils/legacyBrowser';
import { getMediaFrameKind, getMediaFrameSize } from '../utils/mediaFrames';

export interface MemoryReelTitle {
  line?: string;
  big?: string;
}

export type MemoryReelTemplate =
  | 'orbit'
  | 'polaroid-collage'
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
  | 'neon'
  | 'aurora'
  | 'prism'
  | 'ember'
  | 'ocean'
  | 'rose'
  | 'galaxy';

export type MemoryReelClarity = 'natural' | 'clear' | '4k' | '8k';

export const MEMORY_REEL_TEMPLATES: Array<{ id: MemoryReelTemplate; name: string; description: string }> = [
  { id: 'orbit', name: 'Cinematic Camera Motion', description: 'The original camera-wall journey with depth, movement, and living frames.' },
  { id: 'polaroid-collage', name: 'Polaroid Celebration', description: 'Warm cream paper, floating polaroids, and a family-photo collage around the hero.' },
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
  { id: 'natural', name: 'Memory light', description: 'Warm fireflies and a calm breathing glow for family memories.' },
  { id: 'birthday', name: 'Birthday celebration', description: 'Confetti, ribbons, and soft golden bursts that land on the beat.' },
  { id: 'waves', name: 'Music ribbons', description: 'Elegant audio ribbons that rise with bass and treble.' },
  { id: 'cinematic', name: 'Film light', description: 'Subtle lens sweep, film grain, and a premium story finish.' },
  { id: 'stardust', name: 'Memory stars', description: 'Quiet star dust and constellation rings for a dreamy album feel.' },
  { id: 'neon', name: 'Color pulse', description: 'Clean spectrum light for lively celebrations and modern stories.' },
  { id: 'aurora', name: 'Aurora memory', description: 'Silky teal and violet light that breathes with the song.' },
  { id: 'prism', name: 'Prism light', description: 'Soft rainbow refractions that respond to treble without hiding photos.' },
  { id: 'ember', name: 'Ember glow', description: 'Gentle amber embers for intimate, heartfelt memories.' },
  { id: 'ocean', name: 'Ocean tide', description: 'Deep cyan waves and bubbles with a relaxed musical pulse.' },
  { id: 'rose', name: 'Rose gold', description: 'Soft rose-gold bloom for portraits, anniversaries, and family moments.' },
  { id: 'galaxy', name: 'Galaxy bloom', description: 'A refined galaxy of tiny lights with a slow cinematic orbit.' },
];

export const MEMORY_REEL_CLARITIES: Array<{ id: MemoryReelClarity; name: string; description: string }> = [
  { id: 'natural', name: 'Natural depth', description: 'Soft depth blur with gentle camera movement.' },
  { id: 'clear', name: 'Clear', description: 'Sharper frames, reduced blur, and calmer background motion.' },
  { id: '4k', name: '4K crisp', description: 'Extra contrast and detail with a mostly still photo wall.' },
  { id: '8k', name: '8K ultra crisp', description: 'Strongest clarity, clean color, and a still background wall.' },
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
  clarity?: MemoryReelClarity;
  zoom?: boolean;
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
  id?: string;
}

interface ReelCard {
  id: string;
  card: HTMLDivElement;
  x: number;
  y: number;
  z: number;
  rot: number;
  width: number;
  height: number;
  video?: HTMLVideoElement;
}

interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  phase: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const ease = (value: number) => value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
const smoothNoise = (time: number, seed: number) => {
  const position = time * 0.42 + seed;
  const index = Math.floor(position);
  const fraction = position - index;
  const eased = fraction * fraction * (3 - 2 * fraction);
  const sample = (value: number) => {
    const raw = Math.sin(value * 12.9898 + seed * 78.233) * 43758.5453;
    return (raw - Math.floor(raw)) * 2 - 1;
  };
  return lerp(sample(index), sample(index + 1), eased);
};
const escapeHtml = (value: string) => String(value).replace(/[&<>\"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character] || character));

const AUDIO_MIME_BY_EXTENSION: Record<string, string> = {
  '3gp': 'audio/3gpp',
  '3gpp': 'audio/3gpp',
  aac: 'audio/aac',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  amr: 'audio/amr',
  caf: 'audio/x-caf',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mka: 'audio/x-matroska',
  mid: 'audio/midi',
  midi: 'audio/midi',
  mp2: 'audio/mpeg',
  mp3: 'audio/mpeg',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  wav: 'audio/wav',
  webm: 'audio/webm',
  wma: 'audio/x-ms-wma',
};

const audioMimeType = (name: string, fallback = '') => {
  const extension = name.split(/[?#]/)[0].split('.').pop()?.toLowerCase() || '';
  return AUDIO_MIME_BY_EXTENSION[extension] || (fallback.startsWith('audio/') ? fallback : fallback || 'audio/mpeg');
};

const isAudioFile = (file: File) => file.type.startsWith('audio/')
  || Boolean(AUDIO_MIME_BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() || '']);

const normalizeAudioFile = (file: File) => file.type.startsWith('audio/')
  && file.type === audioMimeType(file.name, file.type)
  ? file
  : new File([file], file.name, { type: audioMimeType(file.name, file.type), lastModified: file.lastModified });

const writeWaveText = (view: DataView, offset: number, value: string) => {
  Array.from(value).forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
};

const encodeAudioBufferAsWav = (buffer: AudioBuffer) => {
  const channelCount = Math.max(1, buffer.numberOfChannels);
  const frameCount = buffer.length;
  const bytesPerSample = 2;
  const dataLength = frameCount * channelCount * bytesPerSample;
  const view = new DataView(new ArrayBuffer(44 + dataLength));
  writeWaveText(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeWaveText(view, 8, 'WAVE');
  writeWaveText(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeWaveText(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  const channels = Array.from({ length: channelCount }, (_, channel) => buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1)));
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
};

const convertAudioBlobToWav = async (blob: Blob) => {
  const contextWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = contextWindow.AudioContext || contextWindow.webkitAudioContext;
  if (!AudioContextConstructor) throw new Error('This browser has no audio conversion support.');
  const context = new AudioContextConstructor();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    return encodeAudioBufferAsWav(decoded);
  } finally {
    await context.close().catch(() => undefined);
  }
};

const normalizeDriveAudioBlob = (blob: Blob, song: DriveAudioFile) => {
  const playableType = audioMimeType(song.name, song.mimeType || blob.type);
  return blob.type === playableType ? blob : new Blob([blob], { type: playableType });
};

const preparePlayableAudioBlob = async (blob: Blob, song: DriveAudioFile) => {
  const normalized = normalizeDriveAudioBlob(blob, song);
  const probe = document.createElement('audio');
  const extension = song.name.split(/[?#]/)[0].split('.').pop()?.toLowerCase() || '';
  const nativeFormat = extension === 'mp3' || extension === 'm4a' || extension === 'wav';
  if (nativeFormat && probe.canPlayType(normalized.type)) return normalized;
  try {
    return await convertAudioBlobToWav(normalized);
  } catch {
    return convertAudioBlobWithFfmpeg(normalized, song);
  }
};

let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

const loadFfmpeg = async () => {
  if (!ffmpegLoadPromise) {
    const instance = new FFmpeg();
    ffmpegLoadPromise = Promise.all([
      toBlobURL(ffmpegCoreScript, 'text/javascript'),
      toBlobURL(ffmpegCoreWasm, 'application/wasm'),
    ]).then(async ([coreURL, wasmURL]) => {
      await instance.load({ coreURL, wasmURL });
      return instance;
    }).catch(error => {
      ffmpegLoadPromise = null;
      throw error;
    });
  }
  return ffmpegLoadPromise;
};

const convertAudioBlobWithFfmpeg = async (blob: Blob, song: DriveAudioFile) => {
  const ffmpeg = await loadFfmpeg();
  const extension = song.name.split(/[?#]/)[0].split('.').pop()?.toLowerCase() || 'audio';
  const inputName = `memoriya-input-${Date.now()}.${extension}`;
  const outputName = `memoriya-output-${Date.now()}.wav`;
  try {
    await ffmpeg.writeFile(inputName, await fetchFile(blob));
    await ffmpeg.exec(['-i', inputName, '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'pcm_s16le', '-f', 'wav', outputName]);
    const output = await ffmpeg.readFile(outputName);
    const bytes = typeof output === 'string' ? new TextEncoder().encode(output) : new Uint8Array(output);
    const safeBuffer = new Uint8Array(bytes.byteLength);
    safeBuffer.set(bytes);
    return new Blob([safeBuffer.buffer], { type: 'audio/wav' });
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => undefined);
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
  }
};

const playAudioWithTimeout = async (element: HTMLAudioElement, timeoutMs = 12000) => {
  let timeoutId: number | undefined;
  try {
    await Promise.race([
      element.play(),
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('Audio playback timed out.')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
};

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
  private effectsCanvas: HTMLCanvasElement;
  private effectsContext?: CanvasRenderingContext2D;
  private ambientEffects: HTMLDivElement;
  private dustCanvas: HTMLCanvasElement;
  private dustContext?: CanvasRenderingContext2D;
  private dustParticles: DustParticle[] = [];
  private dustDpr = 1;
  private dustWidth = 0;
  private dustHeight = 0;
  private dustLastPaint = 0;
  private effectsDpr = 1;
  private effectsWidth = 0;
  private effectsHeight = 0;
  private previousEffect: MemoryReelEffect = 'natural';
  private effectChangedAt = 0;
  private effectsDebug?: HTMLDivElement;
  private cinematicCamera = { x: 0, y: 0, z: 0, rot: 0 };
  private cinematicVelocity = { x: 0, y: 0, z: 0, rot: 0 };
  private cinematicCameraAt = 0;
  private cinematicCameraReady = false;
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
  private audioAnalysisAttempted = false;
  private smoothedBass = 0;
  private smoothedMid = 0;
  private smoothedTreble = 0;
  private smoothedLevel = 0;
  private beatPulse = 0;
  private previousBass = 0;
  private bassHistory: Array<{ time: number; value: number }> = [];
  private bassHistoryTotal = 0;
  private lastBeatAt = -Infinity;
  private lastRenderedShot = 0;
  private parallaxX = 0;
  private parallaxY = 0;
  private pointerHandler?: (event: PointerEvent) => void;
  private orientationHandler?: (event: DeviceOrientationEvent) => void;
  private visibilityHandler?: () => void;
  private wasVisiblePlaying = false;
  private lastMetricKey = '';
  private lastLayoutShot = -1;
  private lastStoryPlaying = false;
  private lastAudioActive = false;
  private clarity: MemoryReelClarity = 'clear';
  private zoomEnabled = true;
  private objectUrls = new Set<string>();
  private loadedMedia = new Map<string, LoadedMedia>();

  constructor(el: HTMLElement, options: MemoryReelOptions) {
    this.el = el;
    this.options = {
      // Keep the original pacing for the other templates. Template 01 uses its
      // own compact hold below so the camera keeps moving like the reference.
      hold: 6.6,
      move: 1.2,
      loop: false,
      reducedMotion: false,
      legacyTv: false,
      template: 'orbit',
      effect: 'natural',
      clarity: 'clear',
      zoom: true,
      ...options,
    };
    this.clarity = this.options.clarity || 'clear';
    this.zoomEnabled = this.options.zoom !== false;
    this.world = Object.assign(document.createElement('div'), { className: 'world' });
    this.ambient = Object.assign(document.createElement('div'), { className: 'ambient' });
    this.effectsCanvas = Object.assign(document.createElement('canvas'), {
      className: 'memory-reel-effects-canvas',
      ariaHidden: 'true',
    });
    this.effectsContext = this.effectsCanvas.getContext('2d', { alpha: true }) || undefined;
    this.dustCanvas = Object.assign(document.createElement('canvas'), {
      className: 'memory-reel-dust-canvas',
      ariaHidden: 'true',
    });
    this.dustContext = this.dustCanvas.getContext('2d', { alpha: true }) || undefined;
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
    this.el.append(this.world, this.ambient, this.effectsCanvas, this.dustCanvas, this.ambientEffects, vignette, this.titleEl, this.progressEl, tap, this.poster);
    this.applyTemplateClass();
    this.setEffect(this.options.effect || 'natural');
    this.setClarity(this.clarity);
    if (this.options.audio) this.setAudio(this.options.audio);

    this.pointerHandler = event => {
      if (this.options.reducedMotion || this.options.legacyTv) return;
      const rect = this.el.getBoundingClientRect();
      this.parallaxX = clamp((event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1, -1, 1);
      this.parallaxY = clamp((event.clientY - rect.top) / Math.max(1, rect.height) * 2 - 1, -1, 1);
    };
    this.el.addEventListener('pointermove', this.pointerHandler, { passive: true });
    this.orientationHandler = event => {
      if (this.options.reducedMotion || this.options.legacyTv) return;
      this.parallaxX = clamp((event.gamma || 0) / 32, -1, 1);
      this.parallaxY = clamp((event.beta || 0) / 42, -1, 1);
    };
    window.addEventListener('deviceorientation', this.orientationHandler, { passive: true });
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.wasVisiblePlaying = !this.paused;
        this.pause();
      } else if (this.wasVisiblePlaying && !this.destroyed) {
        this.wasVisiblePlaying = false;
        this.play();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);

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
    const uniqueItems = Array.from(new Map(
      items.map(item => [item.driveFileId || item.id || item.src, item]),
    ).values());
    const generation = ++this.loadGeneration;
    const wasPlaying = !this.paused;
    const previousElapsed = this.elapsed;
    const keepCurrentWall = preserveProgress && this.cards.length > 0 && uniqueItems.length > 0;
    // A live Drive update is loaded beside the current wall. Do not pause the
    // story/audio or clear the stage while the replacement images arrive.
    if (!keepCurrentWall) {
      this.pause();
      this.revokeObjectUrls();
      this.world.innerHTML = '';
      this.cards = [];
      this.loadedMedia.clear();
    } else {
      this.removeMissingMedia(new Set(uniqueItems.map(item => item.id)));
    }
    if (!uniqueItems.length) {
      this.options.onProgress?.(0, 0);
      return;
    }

    const pendingItems = keepCurrentWall
      ? uniqueItems.filter(item => !this.loadedMedia.has(item.id))
      : uniqueItems;
    let liveInsertIndex = keepCurrentWall
      // Put a newly discovered Drive memory just after the next two shots so
      // it joins the live story quickly without interrupting the current one.
      ? Math.min(this.cards.length, Math.max(0, this.lastRenderedShot + 2))
      : this.cards.length;
    if (!pendingItems.length) {
      this.recalculateTotal();
      this.render(this.elapsed);
      return;
    }

    let ready = false;
    let resolveReady: () => void = () => undefined;
    const readyPromise = new Promise<void>(resolve => { resolveReady = resolve; });
    const loaded: LoadedMedia[] = [];
    const reveal = (item: ReelSource, media: LoadedMedia) => {
      if (this.destroyed || generation !== this.loadGeneration) {
        this.releaseObjectUrl(media.node instanceof HTMLImageElement ? media.node.src : '');
        return;
      }
      const resolvedMedia = { ...media, id: item.id };
      this.loadedMedia.set(item.id, resolvedMedia);
      if (keepCurrentWall) {
        this.appendMediaCard(resolvedMedia, liveInsertIndex);
        liveInsertIndex += 1;
      }
      else {
        loaded.push(resolvedMedia);
        // Build the first frame immediately, then append late downloads. A
        // full wall rebuild here reshuffles the active card every time a
        // thumbnail finishes and makes the story appear to skip suddenly.
        if (loaded.length === 1) this.rebuildWall(loaded, preserveProgress, previousElapsed, wasPlaying);
        else this.appendMediaCard(resolvedMedia);
      }
      if (!ready) {
        ready = true;
        resolveReady();
      }
    };

    let nextItemIndex = 0;
    const workerCount = Math.min(8, pendingItems.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextItemIndex < pendingItems.length) {
        const item = pendingItems[nextItemIndex];
        nextItemIndex += 1;
        const media = await this.load(item);
        if (media) reveal(item, media);
        // Let layout, input, and painting run between media jobs. This keeps
        // a large Drive story responsive while its remaining frames warm.
        await new Promise<void>(resolve => window.setTimeout(resolve, 0));
      }
    });
    void Promise.all(workers).then(() => {
      if (generation !== this.loadGeneration) return;
      this.recalculateTotal();
      if (this.cards.length) this.layoutWall(this.shotIndexAt(this.elapsed));
      this.render(this.elapsed);
      if (keepCurrentWall && wasPlaying) this.play();
      if (!ready) {
        ready = true;
        resolveReady();
      }
    });
    await readyPromise;
  }

  private wallSpacing() {
    const stageWidth = this.el.clientWidth || 1280;
    const stageHeight = this.el.clientHeight || 720;
    return {
      // Keep the visible neighborhood spread across the whole frame instead
      // of leaving a large empty upper or lower half.
      sx: clamp(stageWidth * 0.45, 520, 640),
      sy: clamp(stageHeight * 0.9, 360, 480),
    };
  }

  private layoutWall(focusIndex = 0) {
    const count = this.cards.length;
    if (!count) return;
    const columns = Math.max(3, Math.ceil(Math.sqrt(count * 1.25)));
    const rows = Math.max(1, Math.ceil(count / columns));
    const centerSlot = Math.min(count - 1, Math.floor(rows / 2) * columns + Math.floor(columns / 2));
    const safeFocus = clamp(focusIndex, 0, count - 1);
    const slotCards = new Array<number>(count).fill(-1);
    slotCards[centerSlot] = safeFocus;
    let nextCard = 0;
    for (let slot = 0; slot < count; slot += 1) {
      if (slotCards[slot] >= 0) continue;
      while (nextCard === safeFocus) nextCard += 1;
      slotCards[slot] = nextCard;
      nextCard += 1;
    }
    const { sx, sy } = this.wallSpacing();
    slotCards.forEach((cardIndex, slot) => {
      const card = this.cards[cardIndex];
      if (!card) return;
      const row = Math.floor(slot / columns);
      const column = slot % columns;
      const randomUnit = (value: number) => {
        const seeded = Math.sin(value * 12.9898) * 43758.5453;
        return seeded - Math.floor(seeded);
      };
      card.x = (column - (columns - 1) / 2) * sx + (randomUnit(cardIndex + 1) - 0.5) * Math.min(110, sx * 0.22);
      card.y = (row - (rows - 1) / 2) * sy + (randomUnit(cardIndex + 31) - 0.5) * Math.min(80, sy * 0.22);
      card.z = this.options.template === 'orbit' ? -Math.round(randomUnit(cardIndex + 91) * 160) : 0;
      card.rot = (randomUnit(cardIndex + 61) - 0.5) * 16;
      card.card.style.transform = `translate3d(${card.x - card.width / 2}px,${card.y - card.height / 2}px,${card.z}px) rotateZ(${card.rot}deg)`;
      card.card.style.transformOrigin = `${card.width / 2}px ${card.height / 2}px`;
    });
    this.lastLayoutShot = -1;
  }

  private rebuildWall(loaded: LoadedMedia[], preserveProgress: boolean, previousElapsed: number, wasPlaying: boolean) {
    const columns = Math.max(3, Math.ceil(Math.sqrt(loaded.length * 1.25)));
    const rows = Math.max(1, Math.ceil(loaded.length / columns));
    // Keep neighboring cards inside the 16:9 viewport so the focused frame
    // is surrounded by real memories instead of empty black space.
    const { sx, sy } = this.wallSpacing();
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
      const frameKind = getMediaFrameKind(media.aspect);
      card.className = `card media-${frameKind} frame frame-${frameKind}`;
      card.dataset.caption = media.id || `memory-${index + 1}`;
      card.style.setProperty('--media-aspect', String(media.aspect));
      card.style.width = `${width}px`;
      card.style.height = `${height}px`;
      card.appendChild(media.node);
      // Use a calm, balanced grid with only a small organic offset. The
      // cards stay distributed around the hero instead of collapsing into a
      // single pile when portrait and landscape sizes are mixed.
      const x = (column - (columns - 1) / 2) * sx + (random() - 0.5) * 40;
      const y = (row - (rows - 1) / 2) * sy + (random() - 0.5) * 30;
      // Keep cards on one plane. A large depth spread makes a nearby card
      // grow over the focused card and hide part of it.
      const z = this.options.template === 'orbit' ? -Math.round(random() * 160) : 0;
      const rot = (random() - 0.5) * 14;
      if (this.options.template === 'orbit' && index % 6 === 0) card.classList.add('orbit-polaroid');
      card.style.transform = `translate3d(${x - width / 2}px,${y - height / 2}px,${z}px) rotateZ(${rot}deg)`;
      card.style.transformOrigin = `${width / 2}px ${height / 2}px`;
      return { id: media.id || String(index), card, x, y, z, rot, width, height, video: media.video } satisfies ReelCard;
    });

    // Use one deterministic random target order. The layout remains spatially
    // stable, but the story never makes a predictable row-by-row jump.
    for (let index = wallCards.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [wallCards[index], wallCards[swapIndex]] = [wallCards[swapIndex], wallCards[index]];
    }
    wallCards.forEach(card => {
      this.world.appendChild(card.card);
      this.cards.push(card);
    });
    this.layoutWall(0);
    this.lastLayoutShot = -1;

    this.recalculateTotal();
    this.elapsed = preserveProgress ? Math.min(previousElapsed, this.total) : 0;
    this.resize();
    this.render(this.elapsed);
    if (wasPlaying) this.play();
  }

  private appendMediaCard(media: LoadedMedia, insertIndex = this.cards.length) {
    if (this.cards.some(card => card.id === media.id)) return;
    const index = this.cards.length;
    const columns = Math.max(3, Math.ceil(Math.sqrt((index + 1) * 1.25)));
    const rows = Math.max(1, Math.ceil((index + 1) / columns));
    const row = Math.floor(index / columns);
    const column = index % columns;
    const { width, height } = getMediaFrameSize(media.aspect);
    const card = document.createElement('div');
    const frameKind = getMediaFrameKind(media.aspect);
    card.className = `card media-${frameKind} frame frame-${frameKind}`;
    card.dataset.caption = media.id || `memory-${index + 1}`;
    card.style.setProperty('--media-aspect', String(media.aspect));
    card.style.width = `${width}px`;
    card.style.height = `${height}px`;
    card.appendChild(media.node);
    const randomUnit = (value: number) => {
      const seeded = Math.sin(value * 12.9898) * 43758.5453;
      return seeded - Math.floor(seeded);
    };
    const { sx, sy } = this.wallSpacing();
    const x = (column - (columns - 1) / 2) * sx + (randomUnit(index + 1) - 0.5) * Math.min(110, sx * 0.22);
    const y = (row - (rows - 1) / 2) * sy + (randomUnit(index + 31) - 0.5) * Math.min(80, sy * 0.22);
    const z = this.options.template === 'orbit' ? -Math.round(randomUnit(index + 91) * 160) : 0;
    const rot = (randomUnit(index + 61) - 0.5) * 16;
    if (this.options.template === 'orbit' && index % 6 === 0) card.classList.add('orbit-polaroid');
    card.style.transform = `translate3d(${x - width / 2}px,${y - height / 2}px,${z}px) rotateZ(${rot}deg)`;
    card.style.transformOrigin = `${width / 2}px ${height / 2}px`;
    this.world.appendChild(card);
    this.cards.splice(Math.min(insertIndex, this.cards.length), 0, { id: media.id || String(index), card, x, y, z, rot, width, height, video: media.video });
    this.recalculateTotal();
    this.lastLayoutShot = -1;
    this.render(this.elapsed);
  }

  private removeMissingMedia(keepIds: Set<string>) {
    const activeCard = this.cards[this.shotIndexAt(this.elapsed)];
    const activeId = activeCard?.id || '';
    const activeOffset = activeCard ? this.elapsed - this.shotStartAt(this.shotIndexAt(this.elapsed)) : 0;
    for (const [id, media] of this.loadedMedia) {
      if (keepIds.has(id)) continue;
      const card = this.cards.find(current => current.id === id);
      card?.video?.pause();
      card?.card.remove();
      this.cards = this.cards.filter(current => current.id !== id);
      const source = media.node instanceof HTMLVideoElement ? media.node.currentSrc || media.node.src : media.node.src;
      this.releaseObjectUrl(source);
      this.loadedMedia.delete(id);
    }
    this.recalculateTotal();
    if (activeId) {
      const nextIndex = this.cards.findIndex(card => card.id === activeId);
      if (nextIndex >= 0) this.elapsed = Math.min(this.total, this.shotStartAt(nextIndex) + activeOffset);
    }
    this.lastLayoutShot = -1;
    this.render(this.elapsed);
  }

  private shotIndexAt(time: number) {
    let remaining = Math.max(0, time);
    for (let index = 0; index < this.cards.length; index += 1) {
      const step = this.cardHold(this.cards[index]) + this.options.move;
      if (remaining < step || index === this.cards.length - 1) return index;
      remaining -= step;
    }
    return 0;
  }

  private shotStartAt(index: number) {
    return this.cards.slice(0, index).reduce((total, card) => total + this.cardHold(card) + this.options.move, 0);
  }

  private recalculateTotal() {
    this.total = this.cards.reduce((total, card, index) => (
      total + this.cardHold(card) + (index < this.cards.length - 1 ? this.options.move : 0)
    ), 0) + (this.cards.length ? 2.6 : 0);
    this.elapsed = Math.min(this.elapsed, this.total);
  }

  private load(item: ReelSource): Promise<LoadedMedia | null> {
    return new Promise(resolve => {
      const isVideo = item.type === 'video' || /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(item.src);
      let finished = false;
      let finishedWithMedia = false;
      let attemptedFallback = false;
      let attemptedAuthenticated = false;
      let timer = 0;
      const finish = (value: LoadedMedia | null) => {
        if (finished) return;
        finished = true;
        finishedWithMedia = Boolean(value);
        window.clearTimeout(timer);
        resolve(value);
      };

      if (isVideo) {
        const video = document.createElement('video');
        Object.assign(video, { src: '', muted: true, loop: true, playsInline: true, playbackRate: 1, defaultPlaybackRate: 1, preload: 'metadata', poster: item.poster || '' });
        video.defaultMuted = true;
        video.volume = 0;
        video.className = 'm';
        const finishVideo = () => {
          // Metadata alone can produce a black frame on older TV Chromium.
          // Reveal the card only after a decodable video frame is available.
          if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
          finish({ node: video, video, aspect: video.videoWidth / video.videoHeight || 1.6 });
        };
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
        video.onloadeddata = finishVideo;
        video.oncanplay = finishVideo;
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
        if (item.driveFileId) {
          // Start with the lightweight Drive source/poster. A full local
          // original, when cached, replaces it in the background instead of
          // delaying the first visible frame behind an auth/download request.
          if (!readDriveAuthRequired() && item.src) {
            video.src = item.src;
            video.load();
          }
          void this.loadAuthenticatedDrivePreview(item)
            .then(result => {
              if (!result.objectUrl) {
                if (readDriveAuthRequired()) finishVideoPoster();
                return;
              }
              if (finished) {
                this.releaseObjectUrl(result.objectUrl);
                return;
              }
              video.src = result.objectUrl;
              video.load();
            })
            .catch(() => undefined);
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
        if (item.driveFileId && item.src) {
          // Paint Drive's lightweight thumbnail immediately. IndexedDB lookup
          // and the sharper cached original must never delay the first frame.
          if (!readDriveAuthRequired()) image.src = item.src;
          void this.loadAuthenticatedDrivePreview(item)
            .then(result => {
              if (!result.objectUrl) {
                if (readDriveAuthRequired()) finish(null);
                return;
              }
              if (finished && !finishedWithMedia) {
                this.releaseObjectUrl(result.objectUrl);
                return;
              }
              previewObjectUrl = result.objectUrl;
              previewResolvedFull = result.full;
              if (result.full) drivePromotionStarted = true;
              image.src = result.objectUrl;
            })
            .catch(() => undefined);
        } else if (item.driveFileId) {
          attemptedAuthenticated = Boolean(item.authToken);
          void this.loadAuthenticatedDriveImage(item)
            .then(objectUrl => {
              if (!objectUrl) {
                if (item.src) image.src = item.src;
                else finish(null);
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
          if (!readDriveAuthRequired()) image.src = item.src;
        }
        timer = window.setTimeout(() => finish(null), 12000);
      }
    });
  }

  private async loadAuthenticatedDriveImage(item: ReelSource) {
    if (!item.driveFileId) return '';
    const cacheKey = item.driveFileId;
    const [driveCached, storyCached] = await Promise.all([
      readCachedDriveMedia(item.driveFileId),
      readCachedStoryMedia(cacheKey),
    ]);
    const cached = driveCached?.blob || storyCached;
    if (cached) {
      const objectUrl = URL.createObjectURL(cached);
      this.objectUrls.add(objectUrl);
      return objectUrl;
    }
    if (!item.authToken || readDriveAuthRequired()) return '';
    let result: Awaited<ReturnType<typeof googleDriveService.downloadMediaFileWithReconnect>>;
    try {
      result = await withMediaFetch(() => googleDriveService.downloadMediaFileWithReconnect(item.authToken!, item.driveFileId!));
    } catch (error) {
      if (isDriveAuthorizationError(error)) saveDriveAuthRequired(true);
      throw error;
    }
    if (result.accessToken !== item.authToken) saveDriveAccessToken(result.accessToken);
    const blob = result.blob;
    if (!cached) await writeCachedStoryMedia(cacheKey, blob, item.type === 'video' ? 'video/mp4' : blob.type);
    const objectUrl = URL.createObjectURL(blob);
    this.objectUrls.add(objectUrl);
    return objectUrl;
  }

  private async loadAuthenticatedDrivePreview(item: ReelSource): Promise<{ objectUrl: string; full: boolean }> {
    if (!item.driveFileId) return { objectUrl: '', full: false };
    const [driveCached, storyCached] = await Promise.all([
      readCachedDriveMedia(item.driveFileId),
      readCachedStoryMedia(item.driveFileId),
    ]);
    const cached = driveCached?.blob || storyCached;
    if (cached) {
      const objectUrl = URL.createObjectURL(cached);
      this.objectUrls.add(objectUrl);
      return { objectUrl, full: true };
    }
    return { objectUrl: '', full: false };
  }

  private resize() {
    this.scale = this.el.clientHeight > 0 ? this.el.clientHeight / 720 : 1;
    const rect = this.el.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    this.dustWidth = width;
    this.dustHeight = height;
    this.dustDpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.dustCanvas.width = Math.round(width * this.dustDpr);
    this.dustCanvas.height = Math.round(height * this.dustDpr);
    this.dustCanvas.style.width = `${width}px`;
    this.dustCanvas.style.height = `${height}px`;
    if (this.dustContext) this.dustContext.setTransform(this.dustDpr, 0, 0, this.dustDpr, 0, 0);
    this.effectsDpr = Math.min(2, window.devicePixelRatio || 1);
    this.effectsWidth = width;
    this.effectsHeight = height;
    this.effectsCanvas.width = Math.round(width * this.effectsDpr);
    this.effectsCanvas.height = Math.round(height * this.effectsDpr);
    this.effectsCanvas.style.width = `${width}px`;
    this.effectsCanvas.style.height = `${height}px`;
    if (this.effectsContext) this.effectsContext.setTransform(this.effectsDpr, 0, 0, this.effectsDpr, 0, 0);
    const particleCount = width < 640 ? 60 : Math.min(96, Math.max(60, Math.round(width / 12)));
    while (this.dustParticles.length < particleCount) {
      this.dustParticles.push({
        x: Math.random() * this.dustWidth,
        y: Math.random() * this.dustHeight,
        vx: (Math.random() - 0.5) * 0.08,
        vy: -0.05 - Math.random() * 0.12,
        radius: 1 + Math.random() * 2.2,
        alpha: 0.18 + Math.random() * 0.46,
        phase: Math.random() * Math.PI * 2,
      });
    }
    if (this.dustParticles.length > particleCount) this.dustParticles.length = particleCount;
  }

  setTemplate(template: MemoryReelTemplate) {
    this.options.template = template;
    this.cinematicCameraReady = false;
    this.cards.forEach((card, index) => {
      card.card.classList.toggle('orbit-polaroid', template === 'orbit' && index % 6 === 0);
      card.card.classList.remove('orbit-blur-sharp', 'orbit-blur-rack', 'orbit-blur-flight', 'orbit-blur-near', 'orbit-blur-medium', 'orbit-blur-far');
      delete card.card.dataset.orbitBlurTier;
      if (template === 'orbit' && card.z === 0) card.z = -Math.round((Math.sin((index + 1) * 12.9898) * 43758.5453 % 1 + 1) % 1 * 160);
    });
    this.applyTemplateClass();
    this.render(this.elapsed);
  }

  private applyTemplateClass() {
    MEMORY_REEL_TEMPLATES.forEach(item => this.el.classList.remove(`memory-reel-template-${item.id}`));
    this.el.classList.add(`memory-reel-template-${this.options.template || 'orbit'}`);
  }

  setEffect(effect: MemoryReelEffect) {
    if (this.options.effect !== effect) {
      this.previousEffect = this.options.effect || 'natural';
      this.effectChangedAt = performance.now();
    }
    this.options.effect = effect;
    MEMORY_REEL_EFFECTS.forEach(item => this.ambientEffects.classList.remove(`effect-${item.id}`));
    this.ambientEffects.classList.add(`effect-${effect}`);
    // Apply the new effect immediately, including while the story is paused.
    this.lastMetricKey = '';
    this.render(this.elapsed);
  }

  setClarity(clarity: MemoryReelClarity) {
    this.clarity = clarity;
    this.el.dataset.clarity = clarity;
    this.render(this.elapsed);
  }

  setZoomEnabled(enabled: boolean) {
    this.zoomEnabled = enabled;
    this.render(this.elapsed);
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
      analyser.fftSize = 1024;
      // Keep enough smoothing to feel musical while still following the real
      // bass/mid/treble changes instead of a generic timer pulse.
      analyser.smoothingTimeConstant = 0.72;
      const source = this.audioContext.createMediaElementSource(sourceAudio);
      source.connect(analyser);
      analyser.connect(this.audioContext.destination);
      this.audioSource = source;
      this.audioAnalyser = analyser;
      this.audioData = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      // Cross-origin audio may not expose an analyser. Keep normal playback
      // working and let the visualizer use its gentle time-based fallback.
      this.audioSource = undefined;
      this.audioAnalyser = undefined;
      this.audioData = undefined;
    }
  }

  private disconnectAudioAnalysis() {
    this.audioSource?.disconnect();
    this.audioAnalyser?.disconnect();
    this.audioSource = undefined;
    this.audioAnalyser = undefined;
    this.audioData = undefined;
    this.audioAnalysisAttempted = false;
    this.bassHistory = [];
    this.bassHistoryTotal = 0;
    this.previousBass = 0;
    this.lastBeatAt = -Infinity;
  }

  private readAudioMetrics(time: number) {
    const analysisAudio = this.analysisAudio || this.audio;
    if (analysisAudio && analysisAudio.src && !this.audioSource) this.connectAudioAnalysis();
    const playing = Boolean(analysisAudio && !analysisAudio.paused);
    if (playing && this.audioAnalyser && this.audioData) {
      this.audioAnalyser.getByteFrequencyData(this.audioData);
      const size = this.audioData.length;
      const binHz = (this.audioContext?.sampleRate || 44100) / this.audioAnalyser.fftSize;
      const averageBand = (startHz: number, endHz: number) => {
        const from = Math.max(0, Math.floor(startHz / binHz));
        const to = Math.min(size, Math.max(from + 1, Math.ceil(endHz / binHz)));
        let total = 0;
        for (let index = from; index < to; index += 1) total += this.audioData![index] / 255;
        return total / Math.max(1, to - from);
      };
      const sampledBass = averageBand(20, 150);
      const sampledMid = averageBand(150, 2000);
      const sampledTreble = averageBand(2000, Math.max(2001, (this.audioContext?.sampleRate || 44100) / 2));
      const fallbackClock = analysisAudio?.currentTime || time;
      const fallbackPulse = Math.max(0, Math.sin(fallbackClock * Math.PI * 4));
      const analyserSilent = sampledBass + sampledMid + sampledTreble < 0.045;
      const bass = analyserSilent ? 0.08 + fallbackPulse * 0.2 : sampledBass;
      const mid = analyserSilent ? 0.06 + fallbackPulse * 0.12 : sampledMid;
      const treble = analyserSilent ? 0.045 + fallbackPulse * 0.1 : sampledTreble;
      const rawLevel = bass * 0.52 + mid * 0.32 + treble * 0.16;
       this.smoothedBass = lerp(this.smoothedBass, bass, 0.24);
       this.smoothedMid = lerp(this.smoothedMid, mid, 0.22);
       this.smoothedTreble = lerp(this.smoothedTreble, treble, 0.22);
       this.smoothedLevel = lerp(this.smoothedLevel, rawLevel, 0.24);
       const now = performance.now();
      this.bassHistory.push({ time: now, value: bass });
      this.bassHistoryTotal += bass;
       while (this.bassHistory.length && now - this.bassHistory[0].time > 1100) this.bassHistoryTotal -= this.bassHistory.shift()!.value;
       const average = this.bassHistoryTotal / Math.max(1, this.bassHistory.length);
       const bassRise = bass - this.previousBass;
       this.previousBass = bass;
       if (bass > Math.max(0.12, average * 1.14) && bassRise > 0.012 && now - this.lastBeatAt >= 160) {
        this.lastBeatAt = now;
        this.beatPulse = 1;
        this.handleBeat();
      } else {
         this.beatPulse *= 0.88;
      }
    } else {
      const fallbackClock = analysisAudio?.currentTime || time;
      const fallbackPulse = Math.max(0, Math.sin(fallbackClock * Math.PI * 4));
      const fallback = 0.06 + fallbackPulse * 0.16;
      this.smoothedLevel += (fallback - this.smoothedLevel) * 0.08;
      this.smoothedBass += (fallback * 1.1 - this.smoothedBass) * 0.08;
      this.smoothedMid += (fallback * 0.8 - this.smoothedMid) * 0.08;
      this.smoothedTreble += (fallback * 0.65 - this.smoothedTreble) * 0.08;
      this.beatPulse = Math.max(this.beatPulse, Math.pow(fallbackPulse, 8) * 0.42);
      this.beatPulse *= 0.86;
      this.previousBass *= 0.9;
    }
    return {
      level: clamp(this.smoothedLevel * 1.8, 0, 1),
      bass: clamp(this.smoothedBass * 1.65, 0, 1),
      mid: clamp(this.smoothedMid * 1.55, 0, 1),
      treble: clamp(this.smoothedTreble * 1.8, 0, 1),
      beat: clamp(this.beatPulse, 0, 1),
    };
  }

  private handleBeat() {
    // Beat pulses are consumed by the effects canvas and ambient-effects
    // layer. Keep the photo/template compositor independent so music cannot
    // shake, jump, flash, or resize the active memory.
  }

  private drawEffectBackdrop(context: CanvasRenderingContext2D, width: number, height: number, colors: [string, string], energy: number) {
    // The effect canvas sits behind the photo world. Keep this wash subtle so
    // it gives the empty space a responsive atmosphere without tinting or
    // covering the memories themselves.
    const alpha = clamp(0.045 + energy * 0.075, 0.045, 0.12);
    const gradient = context.createRadialGradient(
      width * (0.5 + Math.sin(energy * 4) * 0.08),
      height * (0.42 + Math.cos(energy * 3) * 0.06),
      0,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.78,
    );
    gradient.addColorStop(0, colors[0].replace('ALPHA', alpha.toFixed(3)));
    gradient.addColorStop(0.58, colors[1].replace('ALPHA', (alpha * 0.62).toFixed(3)));
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.save();
    context.globalCompositeOperation = 'screen';
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  private drawEffect(context: CanvasRenderingContext2D, effect: MemoryReelEffect, width: number, height: number, metrics: { level: number; bass: number; mid: number; treble: number; beat: number }, time: number) {
    if (effect === 'off') return;
    const energy = clamp(metrics.level, 0.05, 1);
    const pulse = clamp(metrics.beat + metrics.bass * 0.45, 0, 1);
    const centerX = width / 2;
    const centerY = height / 2;
    const drawDots = (count: number, color: string, size: number, speed: number) => {
      context.fillStyle = color;
      for (let index = 0; index < count; index += 1) {
        const x = ((smoothNoise(time * speed + index * 0.13, index + 3) + 1) * 0.5) * width;
        const y = ((smoothNoise(time * speed * 0.72 + index * 0.19, index + 27) + 1) * 0.5) * height;
        const radius = size * (0.65 + smoothNoise(time * speed * 0.4, index + 81) * 0.25 + pulse * 0.35);
        context.beginPath();
        context.arc(x, y, Math.max(0.7, radius), 0, Math.PI * 2);
        context.fill();
      }
    };
    const drawRibbon = (color: string, base: number, amplitude: number, speed: number, widthPx: number) => {
      context.beginPath();
      for (let x = -width * 0.08; x <= width * 1.08; x += 14) {
        const progress = x / width;
        const y = height * base
          + Math.sin(progress * Math.PI * 2.2 + time * speed) * height * amplitude
          + Math.sin(progress * Math.PI * 5.4 - time * speed * 0.7) * height * amplitude * 0.32
          + pulse * Math.sin(progress * Math.PI * 3) * height * 0.018;
        if (x < 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.strokeStyle = color;
      context.lineWidth = widthPx;
      context.lineCap = 'round';
      context.stroke();
    };
    const drawBurst = (color: string, rayCount: number, radius: number) => {
      context.save();
      context.translate(centerX, centerY);
      context.strokeStyle = color;
      context.lineWidth = 1.5 + pulse * 1.5;
      for (let index = 0; index < rayCount; index += 1) {
        const angle = (index / rayCount) * Math.PI * 2 + time * 0.12;
        const inner = radius * (0.48 + pulse * 0.12);
        const outer = radius * (0.86 + pulse * 0.22 + (index % 3) * 0.04);
        context.beginPath();
        context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        context.stroke();
      }
      context.restore();
    };
    switch (effect) {
      case 'natural':
        this.drawEffectBackdrop(context, width, height, ['rgba(255, 194, 113, ALPHA)', 'rgba(42, 66, 93, ALPHA)'], energy);
        drawDots(22, `rgba(255, 224, 162, ${0.18 + energy * 0.24})`, 2.2, 0.1);
        drawRibbon(`rgba(255, 218, 155, ${0.07 + pulse * 0.08})`, 0.22, 0.055, 0.28, 2);
        break;
      case 'birthday':
        this.drawEffectBackdrop(context, width, height, ['rgba(255, 170, 63, ALPHA)', 'rgba(179, 48, 105, ALPHA)'], energy + pulse * 0.2);
        drawDots(28, `rgba(255, 217, 117, ${0.22 + pulse * 0.42})`, 2.8, 0.2);
        context.strokeStyle = `rgba(255, 205, 123, ${0.28 + pulse * 0.48})`;
        context.lineWidth = 2;
        for (let index = 0; index < 18; index += 1) {
          const x = ((index * 71 + 17) % 100) / 100 * width;
          const y = ((index * 43 + 29) % 100) / 100 * height;
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x + Math.sin(time * 2 + index) * 7, y + 12 + (index % 4) * 4);
          context.stroke();
        }
        drawBurst(`rgba(255, 230, 167, ${0.08 + pulse * 0.3})`, 18, Math.min(width, height) * 0.34);
        break;
      case 'waves':
        this.drawEffectBackdrop(context, width, height, ['rgba(36, 117, 191, ALPHA)', 'rgba(8, 20, 70, ALPHA)'], energy);
        drawRibbon(`rgba(84, 210, 255, ${0.12 + energy * 0.22})`, 0.78, 0.06 + metrics.bass * 0.035, 1.1, 2.2);
        drawRibbon(`rgba(206, 143, 255, ${0.08 + metrics.mid * 0.18})`, 0.84, 0.045 + metrics.treble * 0.028, 1.55, 1.4);
        drawRibbon(`rgba(255, 221, 156, ${0.05 + metrics.treble * 0.12})`, 0.9, 0.028, 1.9, 1);
        break;
      case 'cinematic':
        this.drawEffectBackdrop(context, width, height, ['rgba(222, 121, 74, ALPHA)', 'rgba(24, 82, 89, ALPHA)'], energy);
        drawRibbon(`rgba(255, 218, 154, ${0.06 + pulse * 0.13})`, 0.3, 0.035, 0.45, 3);
        drawBurst(`rgba(255, 226, 180, ${0.04 + pulse * 0.12})`, 14, Math.min(width, height) * 0.45);
        drawDots(28, `rgba(255, 244, 210, ${0.04 + metrics.treble * 0.12})`, 1, 0.3);
        break;
      case 'stardust':
        this.drawEffectBackdrop(context, width, height, ['rgba(50, 77, 164, ALPHA)', 'rgba(4, 10, 43, ALPHA)'], energy);
        drawDots(46, `rgba(170, 202, 255, ${0.18 + metrics.treble * 0.32})`, 1.5, 0.08);
        drawBurst(`rgba(194, 218, 255, ${0.04 + pulse * 0.16})`, 24, Math.min(width, height) * 0.4);
        break;
      case 'neon':
        this.drawEffectBackdrop(context, width, height, ['rgba(205, 28, 213, ALPHA)', 'rgba(18, 4, 50, ALPHA)'], energy + pulse * 0.18);
        drawDots(14, `rgba(255, 66, 224, ${0.18 + pulse * 0.3})`, 2.2, 0.24);
        break;
      case 'aurora':
        this.drawEffectBackdrop(context, width, height, ['rgba(48, 188, 139, ALPHA)', 'rgba(71, 34, 127, ALPHA)'], energy);
        context.lineWidth = Math.max(18, height * 0.06);
        context.lineCap = 'round';
        context.strokeStyle = `rgba(89, 244, 175, ${0.08 + energy * 0.18})`;
        for (let index = 0; index < 3; index += 1) {
          context.beginPath();
          context.moveTo(-width * 0.1, height * (0.25 + index * 0.12));
          context.quadraticCurveTo(centerX, height * (0.05 + Math.sin(time * 0.4 + index) * 0.12 + index * 0.1), width * 1.1, height * (0.34 + index * 0.1));
          context.stroke();
        }
        break;
      case 'prism':
        this.drawEffectBackdrop(context, width, height, ['rgba(89, 103, 226, ALPHA)', 'rgba(111, 35, 120, ALPHA)'], energy);
        for (let index = 0; index < 5; index += 1) {
          context.strokeStyle = `hsla(${(index * 62 + time * 28) % 360}, 90%, 70%, ${0.06 + pulse * 0.12})`;
          context.lineWidth = 4;
          context.beginPath();
          context.arc(centerX, centerY, Math.min(width, height) * (0.25 + index * 0.09 + pulse * 0.02), 0, Math.PI * 2);
          context.stroke();
        }
        break;
      case 'ember':
        this.drawEffectBackdrop(context, width, height, ['rgba(241, 96, 33, ALPHA)', 'rgba(68, 8, 12, ALPHA)'], energy);
        drawDots(30, `rgba(255, 153, 63, ${0.16 + metrics.bass * 0.3})`, 2.4, 0.11);
        break;
      case 'ocean':
        this.drawEffectBackdrop(context, width, height, ['rgba(19, 153, 178, ALPHA)', 'rgba(5, 27, 69, ALPHA)'], energy);
        context.strokeStyle = `rgba(93, 226, 225, ${0.1 + energy * 0.22})`;
        context.lineWidth = 3;
        for (let index = 0; index < 3; index += 1) {
          context.beginPath();
          for (let x = 0; x <= width; x += 14) {
            const y = height * (0.76 + index * 0.06) + Math.sin(x * 0.014 + time * (0.7 + index * 0.22)) * (10 + energy * 12);
            if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
          }
          context.stroke();
        }
        drawDots(18, `rgba(151, 245, 237, ${0.1 + metrics.treble * 0.2})`, 2, 0.09);
        break;
      case 'rose':
        this.drawEffectBackdrop(context, width, height, ['rgba(249, 159, 180, ALPHA)', 'rgba(91, 31, 78, ALPHA)'], energy);
        context.fillStyle = `rgba(255, 201, 178, ${0.07 + pulse * 0.13})`;
        context.beginPath();
        context.arc(centerX, centerY, Math.min(width, height) * (0.28 + pulse * 0.05), 0, Math.PI * 2);
        context.fill();
        break;
      case 'galaxy':
        this.drawEffectBackdrop(context, width, height, ['rgba(78, 54, 182, ALPHA)', 'rgba(8, 10, 41, ALPHA)'], energy);
        drawDots(54, `rgba(212, 190, 255, ${0.12 + metrics.treble * 0.3})`, 1.4, 0.06);
        break;
      default:
        break;
    }
  }

  private renderEffects(metrics: { level: number; bass: number; mid: number; treble: number; beat: number }, time: number) {
    const context = this.effectsContext;
    const width = this.effectsWidth;
    const height = this.effectsHeight;
    if (!context || !width || !height) return;
    context.clearRect(0, 0, width, height);
    const effect = this.options.effect || 'natural';
    // A selected effect must be visible on the same render tick. The old
    // cross-fade left the previous effect on screen for 600ms and made the
    // picker feel unresponsive when the story was paused.
    const transition = 1;
    if (transition < 1 && this.previousEffect !== effect) {
      context.save();
      context.globalAlpha = 1 - transition;
      this.drawEffect(context, this.previousEffect, width, height, metrics, time);
      context.restore();
    }
    context.save();
    context.globalAlpha = transition < 1 && this.previousEffect !== effect ? transition : 1;
    this.drawEffect(context, effect, width, height, metrics, time);
    context.restore();
    if (this.effectsDebug) {
      this.effectsDebug.textContent = `${effect} · bass ${metrics.bass.toFixed(2)} · mid ${metrics.mid.toFixed(2)} · treble ${metrics.treble.toFixed(2)}`;
    }
  }

  private renderDust(metrics: { treble: number; beat: number }, playing: boolean) {
    const context = this.dustContext;
    const width = this.dustWidth;
    const height = this.dustHeight;
    if (this.options.template === 'orbit' || !context || !width || !height || this.options.effect === 'off' || this.options.reducedMotion) {
      context?.clearRect(0, 0, width, height);
      return;
    }
    const now = performance.now();
    const delta = this.dustLastPaint ? Math.min(0.04, (now - this.dustLastPaint) / 1000) : 0;
    this.dustLastPaint = now;
    const treble = metrics.treble;
    const beat = metrics.beat;
    context.clearRect(0, 0, width, height);
    context.save();
    context.globalCompositeOperation = 'screen';
    context.shadowBlur = 8 + treble * 16 + beat * 14;
    context.shadowColor = 'rgba(255, 206, 141, 0.55)';
    this.dustParticles.forEach(particle => {
      const speed = (playing ? 1 : 0.18) * (0.35 + treble * 1.8);
      particle.x += particle.vx * speed * delta * 60;
      particle.y += particle.vy * speed * delta * 60;
      particle.phase += delta * (0.5 + treble * 2.2);
      if (particle.y < -12) particle.y = height + 12;
      if (particle.x < -12) particle.x = width + 12;
      if (particle.x > width + 12) particle.x = -12;
      const radius = particle.radius * (0.8 + treble * 1.65 + beat * 1.8);
      const alpha = particle.alpha * (0.55 + treble * 0.7 + beat * 0.4) * (0.86 + Math.sin(particle.phase) * 0.14);
      context.beginPath();
      context.fillStyle = `rgba(255, ${204 + Math.round(treble * 34)}, 142, ${clamp(alpha, 0.05, 0.9)})`;
      context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      context.fill();
    });
    context.restore();
  }

  play() {
    if (!this.cards.length || this.destroyed || !this.paused && this.raf) return;
    if (this.elapsed >= this.total) this.elapsed = 0;
    this.paused = false;
    this.poster.classList.add('off');
    this.options.onStateChange?.(true);
    this.last = performance.now();
    this.lastPaint = 0;
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
    const reveal = (value: string) => Array.from(value).map((character, index) =>
      `<span class="title-letter" style="--letter-index:${index}">${character === ' ' ? '&nbsp;' : escapeHtml(character)}</span>`,
    ).join('');
    this.titleEl.innerHTML = title
      ? `<small>${reveal(title.line || '')}</small><b>${reveal(title.big || '')}</b>`
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
    if (this.pointerHandler) this.el.removeEventListener('pointermove', this.pointerHandler);
    if (this.orientationHandler) window.removeEventListener('deviceorientation', this.orientationHandler);
    if (this.visibilityHandler) document.removeEventListener('visibilitychange', this.visibilityHandler);
    void this.audioContext?.close().catch(() => undefined);
    this.audioContext = undefined;
    this.audio = undefined;
    this.analysisAudio = undefined;
    this.effectsContext?.clearRect(0, 0, this.effectsWidth, this.effectsHeight);
    this.world.innerHTML = '';
    this.cards = [];
    this.loadedMedia.clear();
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

  private springCamera(target: { x: number; y: number; z: number; rot: number }) {
    const now = performance.now();
    const delta = this.cinematicCameraAt ? clamp((now - this.cinematicCameraAt) / 1000, 0, 0.05) : 0;
    this.cinematicCameraAt = now;
    if (!this.cinematicCameraReady) {
      this.cinematicCamera = { ...target };
      this.cinematicVelocity = { x: 0, y: 0, z: 0, rot: 0 };
      this.cinematicCameraReady = true;
      return this.cinematicCamera;
    }
    const spring = 13;
    (['x', 'y', 'z', 'rot'] as const).forEach(axis => {
      const acceleration = (target[axis] - this.cinematicCamera[axis]) * spring * spring - this.cinematicVelocity[axis] * spring * 2;
      this.cinematicVelocity[axis] += acceleration * delta;
      this.cinematicCamera[axis] += this.cinematicVelocity[axis] * delta;
    });
    return this.cinematicCamera;
  }

  private cardHold(card: ReelCard) {
    if (this.options.template === 'orbit') return 4;
    return 2 + (card.video ? 0.4 : 0);
  }

  private render(time: number) {
    const { move } = this.options;
    const count = this.cards.length;
    if (!count) return;
    const audioMetrics = this.readAudioMetrics(time);
    const audioLevel = audioMetrics.level;
    this.renderEffects(audioMetrics, time);
    if (!this.options.legacyTv && this.options.template !== 'orbit') this.ambient.style.opacity = (0.68 + audioLevel * 0.16).toFixed(3);
    // Keep the empty space alive with a gentle music pulse. Beat and frequency
    // bands are smoothed so visuals breathe with the track instead of twitching.
    const effectLevel = audioLevel;
    const metricKey = [
      effectLevel.toFixed(3),
      audioMetrics.bass.toFixed(3),
      audioMetrics.mid.toFixed(3),
      audioMetrics.treble.toFixed(3),
      audioMetrics.beat.toFixed(3),
    ].join('|');
    if (metricKey !== this.lastMetricKey) {
      this.lastMetricKey = metricKey;
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
    }
    const audioActive = Boolean((this.analysisAudio || this.audio) && !(this.analysisAudio || this.audio)?.paused);
    if (this.lastStoryPlaying !== !this.paused || this.lastAudioActive !== audioActive) {
      this.lastStoryPlaying = !this.paused;
      this.lastAudioActive = audioActive;
      this.ambientEffects.classList.toggle('is-playing', !this.paused && audioActive);
      this.el.classList.toggle('is-playing', !this.paused);
      this.el.classList.toggle('is-music-playing', audioActive);
    }
    this.renderDust(audioMetrics, audioActive);

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
    if (this.lastLayoutShot !== shot) {
      this.lastLayoutShot = shot;
      this.el.style.setProperty('--reel-active', String(shot));
      this.cards.forEach((card, index) => {
        const relative = index - shot;
        card.card.classList.toggle('is-active', index === shot);
         card.card.classList.toggle('is-neighbor', Math.abs(relative) > 0 && Math.abs(relative) <= 2);
        card.card.style.setProperty('--reel-index', String(index));
        card.card.style.setProperty('--reel-offset', `${(index - shot) * 34}vw`);
        card.card.style.setProperty('--reel-angle', `${((index % 5) - 2) * 3}deg`);
        card.card.style.setProperty('--reel-depth', `${Math.min(Math.abs(index - shot) * 18, 120)}px`);
        card.card.style.setProperty('--reel-collage-x', `${relative * 30}vw`);
        card.card.style.setProperty('--reel-collage-y', `${relative % 2 === 0 ? 11 : -8}vh`);
         card.card.style.setProperty('--reel-collage-rotate', `${relative * 5}deg`);
       });
       const activeCard = this.cards[shot]?.card;
       if (activeCard && activeCard.parentElement === this.world) this.world.appendChild(activeCard);
    }

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
        'polaroid-collage': 0.18,
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
      this.world.style.transform = usesTemplateLayout ? 'none' : `scale(${this.scale})`;
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
      this.world.style.transform = `scale(${this.scale}) translate3d(0,0,0)`;
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
      let camera = {
        x: lerp(from.x, to.x, progress),
        y: lerp(from.y, to.y, progress),
        z: lerp(from.z, to.z, progress),
        rot: lerp(from.rot, to.rot, progress),
      };
      const flightRatio = shot > 0 && local < move ? clamp(local / move, 0, 1) : 1;
      if (this.options.template === 'orbit' && !this.options.reducedMotion) {
        const flightEase = ease(flightRatio);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.hypot(dx, dy) || 1;
        const perpendicularX = -dy / distance;
        const perpendicularY = dx / distance;
        const arc = Math.sin(Math.PI * flightRatio) * Math.min(260, distance * 0.12);
        const anticipation = flightRatio < 0.154 ? (1 - flightRatio / 0.154) * 0.04 : 0;
        const springTarget = {
          x: lerp(from.x, to.x, flightEase) - dx * anticipation + perpendicularX * arc,
          y: lerp(from.y, to.y, flightEase) - dy * anticipation + perpendicularY * arc,
          z: lerp(from.z, to.z, flightEase) - dip * 36,
          rot: lerp(from.rot, to.rot, flightEase) * (1 - dip * 0.65),
        };
        camera = this.springCamera(springTarget);
      } else if (this.options.template !== 'orbit') {
        this.cinematicCameraReady = false;
      }
      const push = 100 + clamp(holdProgress, 0, 1) * 180 - dip * 360;
      // Keep the camera close to the wall. The old push depth made blurred
      // neighboring photos surge toward the viewer and compete with the hero.
      const cameraPush = Math.min(push, 130);
      const stabilizedCameraPush = this.options.template === 'orbit'
        ? Math.min(cameraPush, 60)
        : Math.min(cameraPush, this.clarity === 'natural' ? 56 : 26);
      const handheldFade = 1 - dip;
      const handheldX = this.options.template === 'orbit' && !this.options.reducedMotion
        ? smoothNoise(time * 0.9, 12) * 2.5 * handheldFade
        : 0;
      const handheldY = this.options.template === 'orbit' && !this.options.reducedMotion
        ? smoothNoise(time * 0.75, 38) * 2.2 * handheldFade
        : 0;
      const sway = this.options.template === 'orbit'
        ? smoothNoise(time * 0.55, 71) * 3 * handheldFade
        : Math.sin(time * 0.7) * (this.clarity === 'natural' ? 1.2 : 0.35) * handheldFade;
      // Keep the same camera targets and pacing on TV, but avoid the costly
      // rotateY/rotateZ/depth stack that makes older WebViews hitch. The
      // gentle zoom pulse restores the cinematic push-in without a jump at
      // each slide boundary.
      const tvZoom = 1.055 + Math.sin(time * 0.24 + shot * 0.7) * 0.045;
      const parallax = this.options.legacyTv ? '' : ` translate3d(${(-this.parallaxX * 16).toFixed(1)}px,${(-this.parallaxY * 12).toFixed(1)}px,0)`;
      const orbitCamera = this.options.template === 'orbit';
      this.world.style.transform = this.options.legacyTv
        ? `scale(${this.scale * tvZoom}) translate3d(${-camera.x}px,${-camera.y}px,0)`
        : `scale(${this.scale}) translate3d(0,0,${stabilizedCameraPush}px) rotateY(${orbitCamera ? this.parallaxX * 0.4 : -6 + sway + this.parallaxX * 1.4}deg) rotateX(${orbitCamera ? 0 : this.parallaxY * -1.1}deg) rotateZ(${orbitCamera ? 0 : -camera.rot * 0.9}deg) translate3d(${(-camera.x + this.parallaxX * 16 + handheldX).toFixed(1)}px,${(-camera.y + this.parallaxY * 12 + handheldY).toFixed(1)}px,${-camera.z}px)${parallax}`;
      const flyBlur = dip * (this.clarity === 'natural' ? 2.4 : 0.5);
      const distances = this.cards.map(card => Math.hypot(card.x - camera.x, card.y - camera.y));
      const focusedIndex = distances.reduce((closest, distance, index) => (
        distance < distances[closest] ? index : closest
      ), 0);
      // Keep the full wall visible for normal-sized stories. The previous
      // 28-card cap made the renderer remove perfectly valid memories, which
      // left large empty areas around the hero. Very large libraries still
      // get a bounded neighborhood so the animation remains responsive.
      const orbitVisibleLimit = this.cards.length <= 96 ? this.cards.length : 64;
      const nearestOrbitCards = this.options.template === 'orbit'
        ? new Set(distances
          .map((distance, index) => ({ distance, index }))
          .sort((left, right) => left.distance - right.distance)
          .slice(0, orbitVisibleLimit)
          .map(item => item.index))
        : undefined;
      const renderRadius = this.options.template === 'orbit'
        ? 1120
        : this.clarity === 'natural' ? 1700 : 1450;
      this.cards.forEach((card, index) => {
        const isActive = index === shot;
        const distance = distances[index];
        const shouldRender = isActive || index === focusedIndex || (nearestOrbitCards ? nearestOrbitCards.has(index) : distance <= renderRadius);
        if (!shouldRender) {
          if (this.options.template === 'orbit') {
            card.card.remove();
          } else if (card.card.dataset.reelHidden !== 'true') {
            card.card.dataset.reelHidden = 'true';
            card.card.style.opacity = '0';
            card.card.style.filter = 'none';
          }
          if (card.video && !card.video.paused) card.video.pause();
          return;
        }
        if (this.options.template === 'orbit' && card.card.parentElement !== this.world) this.world.appendChild(card.card);
        delete card.card.dataset.reelHidden;
        const clarityBlurScale = this.clarity === 'natural' ? 1 : this.clarity === 'clear' ? 0.35 : 0;
        const blur = this.options.legacyTv || isActive
          ? 0
          : (clamp((distance - 220) / 100, 1.4, 5) + (distance > 360 ? flyBlur * 0.65 : 0)) * clarityBlurScale;
        const near = distance < 200;
        const drift = this.options.reducedMotion || this.clarity !== 'natural'
          ? 0
          : (index === focusedIndex ? 0.35 : 0.6);
        const orbitMotion = this.options.template === 'orbit' && !this.options.reducedMotion ? 1 : 0;
        const randomMotionX = smoothNoise(time * (0.72 + (index % 5) * 0.05), index + 17) * 7 * orbitMotion;
        const randomMotionY = smoothNoise(time * (0.62 + (index % 7) * 0.04), index + 43) * 5 * orbitMotion;
        const randomMotionZ = smoothNoise(time * (0.5 + (index % 3) * 0.04), index + 79) * 1.2 * orbitMotion;
        const driftX = Math.sin(time * 0.22 + index * 1.7) * drift + randomMotionX;
        const driftY = Math.cos(time * 0.18 + index * 1.2) * drift * 0.72 + randomMotionY;
         const driftZ = (this.clarity === 'natural' ? Math.sin(time * 0.14 + index) * 0.7 : 0) + randomMotionZ;
         const driftRotate = Math.sin(time * 0.16 + index * 0.8) * 0.28;
         const stabilizedDriftRotate = (this.clarity === 'natural' ? driftRotate : 0) + (orbitMotion ? smoothNoise(time * 0.5, index + 101) * 0.16 : 0);
         const zoomProgress = this.zoomEnabled && isActive ? clamp(holdProgress, 0, 1) : 0;
        const heroScale = isActive ? 1.035 : 1;
        const orbitBackgroundScale = heroScale;
         const zoomScale = zoomProgress * 0.055;
         const depthBias = this.options.template === 'orbit' ? (isActive ? 180 : -380) : 0;
        const cinematicDepthBias = this.options.template === 'orbit'
          ? (isActive ? 80 : card.z - 120)
          : depthBias;
        const fitScale = isActive && this.options.template === 'orbit'
          ? Math.min(
            (this.el.clientWidth * 0.82) / Math.max(1, card.width),
            (this.el.clientHeight * 0.86) / Math.max(1, card.height),
          ) / Math.max(0.01, this.scale)
          : this.options.template === 'orbit' ? orbitBackgroundScale : heroScale + zoomScale;
        // Keep the hero inside the stage at every point of the push-in. The
        // previous 8% zoom was enough to push portrait and landscape cards
        // beyond the viewport, especially after the camera perspective was
        // applied. Start just under the fitted size and use only a restrained
        // 2% zoom while preserving a small arrival dip.
        const cinematicScale = isActive && this.options.template === 'orbit'
          ? fitScale * (0.965 + zoomProgress * 0.02) * (1 - dip * 0.08)
          : heroScale + zoomScale;
        const cardRotateZ = isActive && this.options.template === 'orbit'
          ? smoothNoise(time * 0.3, index + 141) * 2.5
          : card.rot + stabilizedDriftRotate * 0.18;
        const cardRotateY = isActive && this.options.template === 'orbit'
          ? smoothNoise(time * 0.24, index + 181) * 4
          : stabilizedDriftRotate;
        const focusRack = this.options.template === 'orbit' && isActive && local < move && progress > 0.75;
        if (this.options.template === 'orbit') {
          // Decorative polaroid paper is useful in the background, but its
          // large lower padding makes the focused photo look undersized. The
          // active shot always uses a tight frame matched to its own aspect.
          card.card.classList.toggle('orbit-polaroid', !isActive && index % 6 === 0);
          const orbitBlurTier = focusRack
            ? 'rack'
            : isActive
              ? 'sharp'
              : dip > 0.05
                ? 'flight'
                : distance < 360
                  ? 'near'
                  : distance < 760 ? 'medium' : 'far';
          if (card.card.dataset.orbitBlurTier !== orbitBlurTier) {
            card.card.dataset.orbitBlurTier = orbitBlurTier;
            card.card.classList.remove('orbit-blur-sharp', 'orbit-blur-rack', 'orbit-blur-flight', 'orbit-blur-near', 'orbit-blur-medium', 'orbit-blur-far');
            card.card.classList.add(`orbit-blur-${orbitBlurTier}`);
          }
        }
        card.card.style.transform = `translate3d(${(card.x - card.width / 2 + driftX).toFixed(1)}px,${(card.y - card.height / 2 + driftY).toFixed(1)}px,${(card.z + driftZ + cinematicDepthBias).toFixed(1)}px) rotateX(${isActive && orbitCamera ? 0 : (stabilizedDriftRotate * 0.5).toFixed(2)}deg) rotateY(${cardRotateY.toFixed(2)}deg) rotateZ(${cardRotateZ.toFixed(2)}deg) scale(${cinematicScale.toFixed(4)})`;
        card.card.style.opacity = this.options.legacyTv && distance > 900 ? '0.72' : '1';
         card.card.style.zIndex = isActive ? '50' : index === focusedIndex ? '8' : '1';
        if (isActive) {
          card.card.style.setProperty('filter', 'none', 'important');
          card.card.querySelector<HTMLImageElement | HTMLVideoElement>('.m')?.style.setProperty('filter', 'none', 'important');
        } else {
          const readableBlur = this.options.template === 'orbit'
            ? Math.min(0.35, blur)
            : Math.min(1.2, blur);
          card.card.style.setProperty(
            'filter',
            readableBlur > 0.15
              ? `blur(${readableBlur.toFixed(1)}px) brightness(${this.options.template === 'orbit' ? '.96' : '.92'})`
              : 'brightness(.96)',
            'important',
          );
        }
        if (card.video) {
          const active = near && !this.paused;
          if (active && card.video.paused) this.playMutedVideo(card.video);
          else if (!active && !card.video.paused) card.video.pause();
        }
      });
      this.cards.forEach((card, index) => {
         card.card.style.zIndex = index === shot ? '50' : index === focusedIndex ? '8' : '1';
      });
      const focusedMedia = this.cards[focusedIndex]?.card.querySelector<HTMLImageElement | HTMLVideoElement>('.m');
      const ambientSource = focusedMedia?.currentSrc || focusedMedia?.getAttribute('src') || '';
      const heroCard = this.cards[shot]?.card;
      const heroMedia = heroCard?.querySelector<HTMLImageElement | HTMLVideoElement>('.m');
      const heroSource = heroMedia?.currentSrc || heroMedia?.getAttribute('src') || '';
      if (heroCard && heroSource) {
        const heroImage = `url("${heroSource.replace(/"/g, '\\"')}")`;
        heroCard.style.setProperty('--hero-image', heroImage);
        this.el.style.setProperty('--hero-image', heroImage);
      }
      if (this.options.template !== 'orbit' && ambientSource && ambientSource !== this.ambientSource) {
        this.ambientSource = ambientSource;
        this.ambient.style.backgroundImage = `url("${ambientSource.replace(/"/g, '\\"')}")`;
      }
    }

    if (!this.titleEl.innerHTML && this.options.title) this.setTitle(this.options.title);
    const showTitle = shot === count - 1 && local > move + 0.4 && Boolean(this.options.title);
    this.titleEl.classList.toggle('on', showTitle);
    this.progressEl.style.width = `${clamp(time / this.total, 0, 1) * 100}%`;
    this.lastRenderedShot = shot;
    this.options.onProgress?.(time, this.total);
  }
}

const isVideoMemory = (memory: Memory) => memory.type === 'video' || Boolean(memory.mimeType?.startsWith('video/'));

const resolveReelSources = async (memories: Memory[], signal: AbortSignal, driveAccessToken?: string) => {
  const sources = memories.flatMap(memory => {
    const video = isVideoMemory(memory);
    const driveBacked = Boolean(memory.driveFileId);
    const driveMediaUrl = driveBacked && driveAccessToken
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(memory.driveFileId!)}?alt=media&access_token=${encodeURIComponent(driveAccessToken)}`
      : memory.url;
    // Drive thumbnails are safe, fast first paint. Originals are fetched by
    // the controller after the thumbnail is visible.
    const preview = video ? driveMediaUrl || memory.thumbnail : memory.thumbnail || driveMediaUrl;
    if (!preview && !driveBacked) return [];
    return [{
      id: memory.id,
      src: preview,
      fallbackSrc: !video && driveMediaUrl && driveMediaUrl !== preview ? driveMediaUrl : undefined,
      driveFileId: memory.driveFileId,
      authToken: driveAccessToken || memory.authToken,
      rotation: memory.orientation,
      type: video ? 'video' : 'image',
      poster: video ? memory.thumbnail : undefined,
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
  driveAccount?: 'primary' | 'secondary';
}

const STORY_MUSIC_STORAGE_KEY = 'memoriya-story-music-v1';
const STORY_MUSIC_PLAYBACK_STORAGE_KEY = 'memoriya-story-music-playback-v1';
// v3 makes the original camera-motion Memory Showcase the default again.
// Older saved choices are intentionally migrated away once so Story Mode
// opens with the requested camera journey on every device.
const STORY_TEMPLATE_STORAGE_KEY = 'memoriya-story-template-v3';
const STORY_EFFECT_STORAGE_KEY = 'memoriya-story-effect-v1';
const STORY_CLARITY_STORAGE_KEY = 'memoriya-story-clarity-v1';
const STORY_ZOOM_STORAGE_KEY = 'memoriya-story-zoom-v1';
const STORY_TITLE_STORAGE_KEY = 'memoriya-story-title-v1';

interface StoredStoryMusic {
  driveSongs: DriveAudioFile[];
  secondaryDriveSongs: DriveAudioFile[];
  driveSongsLoaded: boolean;
  driveFolderId?: string;
  musicFolderId?: string;
  queue: Array<Omit<MusicQueueItem, 'src'>>;
}

interface StoredMusicPlayback {
  trackId: string;
  currentTime: number;
  wasPlaying: boolean;
  updatedAt: number;
}

const readStoredMusicPlayback = (): StoredMusicPlayback | null => {
  try {
    const raw = window.localStorage.getItem(STORY_MUSIC_PLAYBACK_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredMusicPlayback>;
    if (!value.trackId || !Number.isFinite(value.currentTime)) return null;
    return {
      trackId: value.trackId,
      currentTime: Math.max(0, value.currentTime),
      wasPlaying: Boolean(value.wasPlaying),
      updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
};

const writeStoredMusicPlayback = (value: StoredMusicPlayback) => {
  try {
    window.localStorage.setItem(STORY_MUSIC_PLAYBACK_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Local storage is optional; the current Story Mode session still works.
  }
};

const readStoredStoryMusic = (driveFolderId = ''): StoredStoryMusic | null => {
  try {
    const raw = window.localStorage.getItem(STORY_MUSIC_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredStoryMusic>;
    if (value.driveFolderId !== undefined && value.driveFolderId !== driveFolderId) return null;
    return {
      driveSongs: Array.isArray(value.driveSongs) ? value.driveSongs : [],
      secondaryDriveSongs: Array.isArray(value.secondaryDriveSongs) ? value.secondaryDriveSongs : [],
      driveSongsLoaded: Boolean(value.driveSongsLoaded),
      driveFolderId: value.driveFolderId || driveFolderId,
      musicFolderId: value.musicFolderId || '',
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

interface StoredStoryTitle extends MemoryReelTitle {
  driveFolderId: string;
}

const readStoredStoryTitle = (driveFolderId: string, fallback?: MemoryReelTitle): MemoryReelTitle | undefined => {
  try {
    const raw = window.localStorage.getItem(STORY_TITLE_STORAGE_KEY);
    if (!raw) return fallback;
    const value = JSON.parse(raw) as Partial<StoredStoryTitle>;
    if ((value.driveFolderId || '') !== driveFolderId) return fallback;
    if (!value.line?.trim() && !value.big?.trim()) return fallback;
    return { line: value.line || '', big: value.big || '' };
  } catch {
    return fallback;
  }
};

const writeStoredStoryTitle = (title: MemoryReelTitle, driveFolderId: string) => {
  try {
    window.localStorage.setItem(STORY_TITLE_STORAGE_KEY, JSON.stringify({
      driveFolderId,
      line: title.line || '',
      big: title.big || '',
    } satisfies StoredStoryTitle));
  } catch {
    // Local storage is optional; the current Story Mode title still works.
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

const readStoredStoryClarity = (fallback: MemoryReelClarity): MemoryReelClarity => {
  try {
    const stored = window.localStorage.getItem(STORY_CLARITY_STORAGE_KEY) as MemoryReelClarity | null;
    return stored && MEMORY_REEL_CLARITIES.some(item => item.id === stored) ? stored : fallback;
  } catch {
    return fallback;
  }
};

const readStoredStoryZoom = (fallback: boolean): boolean => {
  try {
    const stored = window.localStorage.getItem(STORY_ZOOM_STORAGE_KEY);
    return stored === null ? fallback : stored === 'true';
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

const shouldStartCinemaView = () => {
  if (typeof window === 'undefined') return false;
  return isLegacyTvBrowser() || (window.innerWidth <= 900 && window.innerWidth > window.innerHeight);
};

type LegacyFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void | Promise<void>;
};

type LegacyFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => void | Promise<void>;
};

const MemoryReel: React.FC<MemoryReelProps> = ({ memories, title, audio, template: initialTemplate = 'orbit', autoPlay = true, loop = true, hasMore = false, loadingMore = false, onNeedMore, driveAccessToken, driveFolderId, driveFolders, onDriveFolderChange, onDriveReconnect, onClose }) => {
  const visualMemories = useMemo(() => memories.filter(isVisualMemory), [memories]);
  const storedStoryMusic = useMemo(() => readStoredStoryMusic(driveFolderId || ''), [driveFolderId]);
  const storedStoryTitle = useMemo(
    () => readStoredStoryTitle(driveFolderId || '', title),
    [driveFolderId, title?.big, title?.line],
  );
  const stageRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const musicPanelRef = useRef<HTMLDivElement | null>(null);
  const templatePanelRef = useRef<HTMLDivElement | null>(null);
  const effectsPanelRef = useRef<HTMLDivElement | null>(null);
  const clarityPanelRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<MemoryReelController | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const audioObjectUrlsRef = useRef<string[]>([]);
  const driveAccessTokenRef = useRef(driveAccessToken || '');
  const secondaryDriveAccessTokenRef = useRef('');
  const resolvedDriveAudioSourcesRef = useRef(new Map<string, string>());
  const [resolvedSources, setResolvedSources] = useState<ReelSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [progress, setProgress] = useState({ progress: 0, total: 0 });
  const [fullscreen, setFullscreen] = useState(shouldStartCinemaView);
  const [fullscreenControlsVisible, setFullscreenControlsVisible] = useState(true);
  const [titleDraft, setTitleDraft] = useState<MemoryReelTitle>({ line: storedStoryTitle?.line || '', big: storedStoryTitle?.big || '' });
  const [activeTitle, setActiveTitle] = useState<MemoryReelTitle | undefined>(storedStoryTitle);
  const [musicOpen, setMusicOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [clarityOpen, setClarityOpen] = useState(false);
  const [template, setTemplate] = useState<MemoryReelTemplate>(() => readStoredStoryTemplate(initialTemplate));
  const [effect, setEffect] = useState<MemoryReelEffect>(() => readStoredStoryEffect('natural'));
  const [clarity, setClarity] = useState<MemoryReelClarity>(() => readStoredStoryClarity('clear'));
  const [zoomEnabled, setZoomEnabled] = useState(() => readStoredStoryZoom(true));
  const [musicQuery, setMusicQuery] = useState('');
  const [musicResults, setMusicResults] = useState<OpenSourceMusicTrack[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [driveSongs, setDriveSongs] = useState<DriveAudioFile[]>(() => storedStoryMusic?.driveSongs || []);
  const [secondaryDriveSongs, setSecondaryDriveSongs] = useState<DriveAudioFile[]>(() => storedStoryMusic?.secondaryDriveSongs || []);
  const [driveSongsLoaded, setDriveSongsLoaded] = useState(() => Boolean(storedStoryMusic?.driveSongsLoaded));
  const [musicDriveFolderId, setMusicDriveFolderId] = useState(() => storedStoryMusic?.musicFolderId || '');
  const [driveSongsLoading, setDriveSongsLoading] = useState(false);
  const [secondaryDriveSongsLoading, setSecondaryDriveSongsLoading] = useState(false);
  const [driveUploadLoading, setDriveUploadLoading] = useState(false);
  const [musicError, setMusicError] = useState('');
  const [audioLoading, setAudioLoading] = useState(false);
  const [trackLoadingId, setTrackLoadingId] = useState('');
  const [musicName, setMusicName] = useState('');
  const [musicQueue, setMusicQueue] = useState<MusicQueueItem[]>(() => audio ? [{ id: 'initial-audio', src: audio, label: 'Background music' }] : []);
  const [currentMusicId, setCurrentMusicId] = useState('');
  const [loopEnabled, setLoopEnabled] = useState(loop);
  const musicQueueRef = useRef<MusicQueueItem[]>([]);
  const currentMusicIdRef = useRef('');
  const loopEnabledRef = useRef(loop);
  const reducedMotion = usePrefersReducedMotion();
  const legacyTvMode = useMemo(isLegacyTvBrowser, []);
  const moreRequestedRef = useRef(false);
  const hasLoadedSourcesRef = useRef(false);
  const sourceSignatureRef = useRef('');
  const moreConfigRef = useRef({ hasMore, loadingMore, onNeedMore });
  const fullscreenControlsTimerRef = useRef<number | null>(null);
  const driveSongsRequestRef = useRef(false);
  const secondaryDriveSongsRequestRef = useRef(false);
  const driveMusicFolderRef = useRef(storedStoryMusic?.musicFolderId || '');
  const audioManuallyStoppedRef = useRef(false);
  const failedMusicIdsRef = useRef(new Set<string>());
  const storedMusicPlaybackRef = useRef<StoredMusicPlayback | null>(readStoredMusicPlayback());
  const pendingMusicResumeRef = useRef<{ trackId: string; currentTime: number } | null>(null);
  const playbackPersistTimerRef = useRef<number | null>(null);
  const autoResumeRequestedRef = useRef(false);
  musicQueueRef.current = musicQueue;
  loopEnabledRef.current = loopEnabled;
  const audioPauseGuardRef = useRef(false);
  const musicHydratedRef = useRef(false);
  moreConfigRef.current = { hasMore, loadingMore, onNeedMore };
  const allDriveSongs = useMemo(() => [...driveSongs, ...secondaryDriveSongs], [driveSongs, secondaryDriveSongs]);

  const setCurrentMusic = (id: string) => {
    currentMusicIdRef.current = id;
    setCurrentMusicId(id);
  };

  const persistMusicPlayback = (wasPlaying?: boolean, immediate = false) => {
    const element = audioPlayerRef.current;
    const trackId = currentMusicIdRef.current || musicQueueRef.current[0]?.id;
    if (!trackId) return;
    const currentTime = Number.isFinite(element?.currentTime) ? Math.max(0, element?.currentTime || 0) : 0;
    const nextSnapshot: StoredMusicPlayback = {
      trackId,
      currentTime,
      wasPlaying: wasPlaying ?? Boolean(element && !element.paused),
      updatedAt: Date.now(),
    };
    storedMusicPlaybackRef.current = nextSnapshot;
    if (playbackPersistTimerRef.current !== null) window.clearTimeout(playbackPersistTimerRef.current);
    if (immediate) {
      playbackPersistTimerRef.current = null;
      writeStoredMusicPlayback(nextSnapshot);
      return;
    }
    playbackPersistTimerRef.current = window.setTimeout(() => {
      playbackPersistTimerRef.current = null;
      writeStoredMusicPlayback(storedMusicPlaybackRef.current || nextSnapshot);
    }, 500);
  };

  const applyPendingMusicResume = () => {
    const element = audioPlayerRef.current;
    const pending = pendingMusicResumeRef.current;
    if (!element || !pending || pending.trackId !== currentMusicIdRef.current) return;
    if (!Number.isFinite(element.duration) || element.duration <= 0) return;
    const resumeAt = Math.min(pending.currentTime, Math.max(0, element.duration - 0.25));
    try {
      if (resumeAt > 0.25) element.currentTime = resumeAt;
      pendingMusicResumeRef.current = null;
    } catch {
      // The media element may not accept seeking until its metadata is ready.
    }
  };

  useEffect(() => {
    const nextFolder = musicDriveFolderId || '';
    if (driveMusicFolderRef.current === nextFolder) return;
    driveMusicFolderRef.current = nextFolder;
    setDriveSongs([]);
    setDriveSongsLoaded(false);
    setMusicQueue(current => current.filter(track => track.source !== 'drive'));
    setMusicName('');
  }, [musicDriveFolderId]);

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
    if (!musicOpen && !templateOpen && !effectsOpen && !clarityOpen) return;
    const panel = musicOpen
      ? musicPanelRef.current
      : effectsOpen
        ? effectsPanelRef.current
        : clarityOpen
          ? clarityPanelRef.current
          : templatePanelRef.current;
    const firstControl = panel?.querySelector<HTMLElement>('button, input, select');
    if (!firstControl) return;
    const focusPanel = () => firstControl.focus();
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(focusPanel);
    else window.setTimeout(focusPanel, 0);
  }, [clarityOpen, effectsOpen, musicOpen, templateOpen]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;
    const headings = Array.from(shell.querySelectorAll<HTMLElement>('.memory-reel-reveal'));
    if (!headings.length || typeof IntersectionObserver === 'undefined') {
      headings.forEach(heading => heading.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) observer.unobserve(entry.target);
        entry.target.classList.toggle('is-visible', entry.isIntersecting);
      });
    }, { threshold: 0.16 });
    headings.forEach(heading => observer.observe(heading));
    return () => observer.disconnect();
  }, [clarityOpen, effectsOpen, musicOpen, templateOpen]);

  useEffect(() => {
    if (!musicOpen && !templateOpen && !effectsOpen && !clarityOpen) return;
    const closePanels = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Backspace') return;
      event.preventDefault();
      setMusicOpen(false);
      setTemplateOpen(false);
      setEffectsOpen(false);
      setClarityOpen(false);
    };
    window.addEventListener('keydown', closePanels);
    return () => window.removeEventListener('keydown', closePanels);
  }, [clarityOpen, effectsOpen, musicOpen, templateOpen]);

  useEffect(() => {
    let active = true;
    const stored = storedStoryMusic;
    const storedPlayback = storedMusicPlaybackRef.current;
    // Restore the intent as well as the position. Browsers may still require
    // one user gesture after navigation, but the next Play tap will continue
    // from this exact point instead of starting a new song.
    audioManuallyStoppedRef.current = !storedPlayback?.wasPlaying;

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
            const song = [...stored.driveSongs, ...stored.secondaryDriveSongs].find(item => item.id === savedTrack.driveFileId);
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
        const selectedTrack = storedPlayback
          ? nextQueue.find(track => track.id === storedPlayback.trackId) || nextQueue[0]
          : nextQueue[0];
        setMusicQueue(current => current.length ? current : nextQueue);
        setCurrentMusic(selectedTrack.id);
        setMusicName(current => current || selectedTrack.label);
        if (storedPlayback && selectedTrack.id === storedPlayback.trackId) {
          pendingMusicResumeRef.current = {
            trackId: selectedTrack.id,
            currentTime: storedPlayback.currentTime,
          };
        }
      }
      musicHydratedRef.current = true;
    };

    void restoreQueue();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const playback = storedMusicPlaybackRef.current;
    if (
      !musicHydratedRef.current ||
      !musicQueue.length ||
      !playback?.wasPlaying ||
      !pendingMusicResumeRef.current ||
      autoResumeRequestedRef.current
    ) return undefined;
    autoResumeRequestedRef.current = true;
    audioManuallyStoppedRef.current = false;
    const timer = window.setTimeout(() => {
      void playStoryAudio(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [musicQueue]);

  useEffect(() => () => {
    if (playbackPersistTimerRef.current !== null) {
      window.clearTimeout(playbackPersistTimerRef.current);
      playbackPersistTimerRef.current = null;
    }
    persistMusicPlayback(Boolean(audioPlayerRef.current && !audioPlayerRef.current.paused), true);
  }, []);

  useEffect(() => {
    if (!musicHydratedRef.current) return;
    writeStoredStoryMusic({
      driveSongs,
      secondaryDriveSongs,
      driveSongsLoaded,
      driveFolderId: driveFolderId || '',
      musicFolderId: musicDriveFolderId,
      queue: musicQueue.map(({ src: _src, ...track }) => track),
    });
  }, [driveFolderId, musicDriveFolderId, driveSongs, secondaryDriveSongs, driveSongsLoaded, musicQueue]);

  // Drive access tokens and object URLs can change while the same media set
  // is playing. They must not rebuild the reel or restart its clock.
  const sourceSignature = visualMemories.map(memory => [
    memory.driveFileId || memory.id,
    memory.type,
    memory.mimeType || '',
    memory.date,
    memory.driveFileId
      ? (memory.url?.startsWith('blob:') || memory.thumbnail?.startsWith('blob:') ? 'cached-local' : '')
      : memory.url,
  ].join(':')).join('|');

  useEffect(() => {
    setTitleDraft({ line: storedStoryTitle?.line || '', big: storedStoryTitle?.big || '' });
    setActiveTitle(storedStoryTitle);
  }, [storedStoryTitle]);

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
      // Replace with this request's complete snapshot. Appending through the
      // previous React state could race with the photo update and resurrect a
      // Drive image that was deleted while the video sources were resolving.
      setResolvedSources([...photoSources, ...videoSources]);
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
      zoom: zoomEnabled,
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
    controllerRef.current?.setClarity(clarity);
    try {
      window.localStorage.setItem(STORY_CLARITY_STORAGE_KEY, clarity);
    } catch {
      // Local storage is optional; the current story remains active.
    }
  }, [clarity]);

  useEffect(() => {
    controllerRef.current?.setZoomEnabled(zoomEnabled);
    try {
      window.localStorage.setItem(STORY_ZOOM_STORAGE_KEY, String(zoomEnabled));
    } catch {
      // Local storage is optional; the current story remains active.
    }
  }, [zoomEnabled]);

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
    const activeTrack = musicQueue.find(track => track.id === currentMusicIdRef.current) || musicQueue[0];
    const source = activeTrack?.src || sources[0] || '';
    if (activeTrack && activeTrack.id !== currentMusicIdRef.current) setCurrentMusic(activeTrack.id);
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
    const activeTrack = musicQueue.find(track => track.id === currentMusicIdRef.current) || musicQueue[0];
    const source = activeTrack.src;
    if (!element || !source) return;
    if (element.src !== source) {
      audioPauseGuardRef.current = true;
      element.pause();
      element.src = source;
      element.load();
      audioPauseGuardRef.current = false;
    }
    void playAudioWithTimeout(element)
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
    if (shell.requestFullscreen) {
      await shell.requestFullscreen().catch(() => {
        setFullscreen(true);
        setFullscreenControlsVisible(true);
      });
    } else if (legacyShell.webkitRequestFullscreen) {
      await Promise.resolve(legacyShell.webkitRequestFullscreen()).catch(() => {
        setFullscreen(true);
        setFullscreenControlsVisible(true);
      });
    } else {
      setFullscreen(true);
      setFullscreenControlsVisible(true);
    }
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

  const driveAudioCacheKey = (song: DriveAudioFile) =>
    `drive-audio-${song.id}-${song.modifiedTime || 'current'}`;

  const driveAudioUrl = (song: DriveAudioFile, token: string) =>
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(song.id)}?alt=media&supportsAllDrives=true&access_token=${encodeURIComponent(token)}`;

  const warmDriveAudioCache = async (song: DriveAudioFile, cacheKey: string, token: string) => {
    try {
      const cached = await readCachedStoryMedia(cacheKey);
      const sourceBlob = cached || (await withMediaFetch(() => googleDriveService.downloadMediaFileWithReconnect(token, song.id))).blob;
      const playableBlob = await preparePlayableAudioBlob(sourceBlob, song);
      if (cached && playableBlob === cached) return;
      await writeCachedStoryMedia(cacheKey, playableBlob, playableBlob.type);
    } catch {
      // Cache warming is best-effort; playback retries conversion on demand.
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
    const song = allDriveSongs.find(item => item.id === track.driveFileId);
    if (!song) return track.src;
    const cacheKey = track.cacheKey || driveAudioCacheKey(song);
    const rememberedSource = resolvedDriveAudioSourcesRef.current.get(cacheKey);
    if (rememberedSource) return rememberedSource;

    const createSource = async (token: string) => {
      const cached = await readCachedStoryMedia(cacheKey);
      const sourceBlob = cached || await withMediaFetch(() => googleDriveService.downloadMediaFile(token, song.id));
      const playableBlob = await preparePlayableAudioBlob(sourceBlob, song);
      if (!cached || playableBlob !== cached) await writeCachedStoryMedia(cacheKey, playableBlob, playableBlob.type);
      const objectUrl = URL.createObjectURL(playableBlob);
      resolvedDriveAudioSourcesRef.current.set(cacheKey, objectUrl);
      audioObjectUrlsRef.current.push(objectUrl);
      return objectUrl;
    };

    let token = track.driveAccount === 'secondary'
      ? secondaryDriveAccessTokenRef.current
      : driveAccessTokenRef.current || driveAccessToken;
    const cached = await readCachedStoryMedia(cacheKey);
    if (!token && !cached) throw new Error('This song is not cached on this device. Reconnect Google Drive once to download it.');
    try {
      return await createSource(token || '');
    } catch (error) {
      if (!allowRefresh || !isDriveAuthorizationError(error)) throw error;
      if (track.driveAccount === 'secondary') {
        const connection = await googleDriveService.connect(undefined, 'select_account');
        token = connection.accessToken || '';
        if (!token) throw new Error('The second Google Drive account did not return an access token.');
        secondaryDriveAccessTokenRef.current = token;
      } else {
        token = await reconnectDriveForPlayback();
      }
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
    failedMusicIdsRef.current.delete(track.id);
    audioManuallyStoppedRef.current = false;
    if (pendingMusicResumeRef.current?.trackId !== track.id) pendingMusicResumeRef.current = null;
    setCurrentMusic(track.id);
    setMusicName(track.label);
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
          await playAudioWithTimeout(element);
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
      await playAudioWithTimeout(element);
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
    if (removed?.id === currentMusicIdRef.current) setCurrentMusic('');
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
        const songs = await googleDriveService.listAudioFiles(token, musicDriveFolderId);
        setDriveSongs(songs);
        setDriveSongsLoaded(true);
        await Promise.all(songs.map(song => warmDriveAudioCache(song, driveAudioCacheKey(song), token)));
      } catch (error) {
        if (!isDriveAuthorizationError(error)) throw error;
        token = await reconnectDriveForPlayback();
        const songs = await googleDriveService.listAudioFiles(token, musicDriveFolderId);
        setDriveSongs(songs);
        setDriveSongsLoaded(true);
        await Promise.all(songs.map(song => warmDriveAudioCache(song, driveAudioCacheKey(song), token)));
      }
    } catch (error) {
      setMusicError(error instanceof Error ? error.message : 'Drive songs could not be loaded.');
    } finally {
      setDriveSongsLoading(false);
      driveSongsRequestRef.current = false;
    }
  };

  const connectAdditionalMusicDrive = async () => {
    if (secondaryDriveSongsRequestRef.current) return;
    secondaryDriveSongsRequestRef.current = true;
    setSecondaryDriveSongsLoading(true);
    setMusicError('');
    try {
      // Select the account again so music can come from another Gmail Drive
      // without replacing the Drive used for photos and live synchronization.
      const connection = await googleDriveService.connect(undefined, 'select_account');
      const token = connection.accessToken;
      if (!token) throw new Error('The second Google Drive account did not return an access token.');
      secondaryDriveAccessTokenRef.current = token;
      const songs = await googleDriveService.listAudioFiles(token, '');
      setSecondaryDriveSongs(songs);
      await Promise.all(songs.map(song => warmDriveAudioCache(song, driveAudioCacheKey(song), token)));
      setMusicName(songs.length ? `${songs.length} songs from the second Drive` : 'No audio files found in the second Drive');
    } catch (error) {
      setMusicError(error instanceof Error ? error.message : 'The second Google Drive could not be connected.');
    } finally {
      setSecondaryDriveSongsLoading(false);
      secondaryDriveSongsRequestRef.current = false;
    }
  };

  useEffect(() => {
    if (!driveAccessToken || !driveSongsLoaded) return undefined;
    let active = true;
    const syncDriveSongs = async () => {
      if (driveSongsRequestRef.current) return;
      driveSongsRequestRef.current = true;
      try {
        const songs = await googleDriveService.listAudioFiles(driveAccessTokenRef.current || driveAccessToken, musicDriveFolderId);
        if (!active) return;
        setDriveSongs(songs);
        await Promise.all(songs.map(song => warmDriveAudioCache(song, driveAudioCacheKey(song), driveAccessTokenRef.current || driveAccessToken)));
      } catch {
        // Keep the last song list and cached playback available while offline.
      } finally {
        driveSongsRequestRef.current = false;
      }
    };
    const interval = window.setInterval(() => void syncDriveSongs(), 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [driveAccessToken, musicDriveFolderId, driveSongsLoaded]);

  const chooseDriveSong = (song: DriveAudioFile) => {
    const isSecondaryDriveSong = secondaryDriveSongs.some(item => item.id === song.id);
    const token = isSecondaryDriveSong
      ? secondaryDriveAccessTokenRef.current
      : driveAccessTokenRef.current || driveAccessToken;
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
      src: token ? driveAudioUrl(song, token) : '',
      label: song.name,
      source: 'drive',
      driveFileId: song.id,
      cacheKey,
      driveAccount: isSecondaryDriveSong ? 'secondary' : 'primary',
    } satisfies MusicQueueItem;
    pendingMusicResumeRef.current = null;
    audioManuallyStoppedRef.current = true;
    audioPauseGuardRef.current = true;
    audioPlayerRef.current?.pause();
    audioPauseGuardRef.current = false;
    setAudioPlaying(false);
    setMusicName(song.name);
    setMusicQueue(current => [selectedTrack, ...current.filter(item => item.driveFileId !== song.id && item.id !== trackId)]);
    if (token) void warmDriveAudioCache(song, cacheKey, token);
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
          uploaded = await googleDriveService.uploadMedia(token, file, musicDriveFolderId);
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
        await writeCachedStoryMedia(driveAudioCacheKey(uploaded), file, uploaded.mimeType || file.type);
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
    const nextTitle = { line: titleDraft.line?.trim() || '', big: titleDraft.big?.trim() || '' };
    setActiveTitle(nextTitle);
    writeStoredStoryTitle(nextTitle, driveFolderId || '');
  };

  const openMusic = () => {
    const next = !musicOpen;
    setMusicOpen(next);
    if (next) {
      setTemplateOpen(false);
      setEffectsOpen(false);
      setClarityOpen(false);
    }
  };

  const openTemplates = () => {
    setTemplateOpen(value => !value);
    setMusicOpen(false);
    setEffectsOpen(false);
    setClarityOpen(false);
  };

  const openEffects = () => {
    setEffectsOpen(value => !value);
    setMusicOpen(false);
    setTemplateOpen(false);
    setClarityOpen(false);
  };

  const openClarity = () => {
    setClarityOpen(value => !value);
    setMusicOpen(false);
    setTemplateOpen(false);
    setEffectsOpen(false);
  };

  const playStoryAudio = async (fromUserGesture = false) => {
    const element = audioPlayerRef.current;
    const sourceTrack = musicQueue.find(track => track.id === currentMusicIdRef.current) || musicQueue[0];
    const source = sourceTrack?.src;
    if (!element || !source || audioManuallyStoppedRef.current) return false;
    failedMusicIdsRef.current.delete(sourceTrack.id);
    setCurrentMusic(sourceTrack.id);
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
        applyPendingMusicResume();
        try {
          await playAudioWithTimeout(element);
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
      applyPendingMusicResume();
      await playAudioWithTimeout(element);
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
      const decoderFailure = error instanceof Error && /decode|conversion|not supported|not_supported|cannot play/i.test(error.message);
      if (decoderFailure && sourceTrack && musicQueue.length > 1) {
        failedMusicIdsRef.current.add(sourceTrack.id);
        void advanceMusic();
      }
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
      persistMusicPlayback(false, true);
      return;
    }
    controller.play();
    void playStoryAudio(true);
  };

  const advanceMusic = async () => {
    const currentQueue = musicQueueRef.current;
    const element = audioPlayerRef.current;
    if (!currentQueue.length || !element) return;
    const previousTrackId = currentMusicIdRef.current;
    const currentIndex = currentQueue.findIndex(track => track.id === previousTrackId);
    const activeIndex = currentIndex >= 0 ? currentIndex : 0;
    let nextIndex = activeIndex + 1 < currentQueue.length
      ? activeIndex + 1
      : loopEnabledRef.current ? 0 : -1;
    if (nextIndex >= 0 && currentQueue.length > 1) {
      const firstCandidate = nextIndex;
      do {
        if (!failedMusicIdsRef.current.has(currentQueue[nextIndex].id)) break;
        nextIndex = (nextIndex + 1) % currentQueue.length;
      } while (nextIndex !== firstCandidate);
      if (failedMusicIdsRef.current.has(currentQueue[nextIndex].id)) nextIndex = -1;
    }
    if (nextIndex < 0) {
      setAudioPlaying(false);
      return;
    }

    const nextTrack = currentQueue[nextIndex];
    if (!nextTrack) {
      setAudioPlaying(false);
      return;
    }
    setCurrentMusic(nextTrack.id);
    setMusicName(nextTrack.label);
    audioManuallyStoppedRef.current = false;
    setAudioLoading(true);
    try {
      if (nextTrack.id === previousTrackId && element.src) {
        // Keep a single-song loop gapless. Reusing the already decoded source
        // avoids a Drive/cache round trip and never flashes back to a fresh
        // audio element when the visual story loops.
        audioPauseGuardRef.current = true;
        element.pause();
        element.currentTime = 0;
        audioPauseGuardRef.current = false;
        await playAudioWithTimeout(element);
        setAudioPlaying(true);
        return;
      }
      const source = await prepareDriveTrackForPlayback(nextTrack);
      const sourceChanged = element.src !== source;
      audioPauseGuardRef.current = true;
      element.pause();
      if (sourceChanged) {
        element.src = source;
        element.load();
      } else {
        // A one-song loop should start the same element again, without a
        // source reload that can briefly stop or reset playback elsewhere.
        element.currentTime = 0;
      }
      audioPauseGuardRef.current = false;
      applyPendingMusicResume();
      await playAudioWithTimeout(element);
      setAudioPlaying(true);
    } catch (error) {
      audioPauseGuardRef.current = false;
      setAudioPlaying(false);
      if (error instanceof Error && /decode|conversion|not supported|not_supported|cannot play/i.test(error.message) && currentQueue.length > 1) {
        failedMusicIdsRef.current.add(nextTrack.id);
        void advanceMusic();
      }
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
      persistMusicPlayback(false, true);
      return;
    }
    audioManuallyStoppedRef.current = false;
    await playStoryAudio(true);
  };

  const toggleMute = () => {
    const element = audioPlayerRef.current;
    if (!element) return;
    element.muted = !element.muted;
    setAudioMuted(element.muted);
  };

  return (
    <div className={`memory-reel-overlay${fullscreen ? ' is-fullscreen' : ''}`} role="dialog" aria-modal="true" aria-label="Memory story reel">
      <div ref={shellRef} className={`memory-reel-shell${fullscreen ? ' is-fullscreen' : ''}${musicOpen || templateOpen || effectsOpen || clarityOpen ? ' has-panel-open' : ''}`}>
        <div ref={stageRef} className="reel memory-reel-stage" />
        <div className="memory-reel-toolbar">
          <button type="button" onClick={toggleStoryPlayback} disabled={loading}>
            {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" onClick={() => controllerRef.current?.restart()} disabled={loading}><RotateCcw size={16} /> Replay</button>
          <button type="button" onClick={toggleFullscreen}><>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</> {fullscreen ? 'Exit' : 'Fullscreen'}</button>
          <button type="button" className={musicOpen ? 'is-active' : ''} aria-expanded={musicOpen} onClick={openMusic}><Music2 size={16} /> Music {musicQueue.length ? `(${musicQueue.length})` : allDriveSongs.length ? `(${allDriveSongs.length} Drive)` : ''}</button>
          <button type="button" className={templateOpen ? 'is-active' : ''} aria-expanded={templateOpen} onClick={openTemplates}><WandSparkles size={16} /> Template</button>
          {musicQueue.length > 0 && <button type="button" onClick={() => void toggleMusic()} aria-pressed={audioPlaying}><Volume2 size={16} /> {audioPlaying ? 'Stop music' : 'Play music'}</button>}
          {musicQueue.length > 0 && <button type="button" onClick={toggleMute} aria-pressed={audioMuted} aria-label={audioMuted ? 'Unmute music' : 'Mute music'}>{audioMuted ? <VolumeX size={16} /> : <Volume2 size={16} />} {audioMuted ? 'Unmute' : 'Mute'}</button>}
          <button type="button" className={effectsOpen ? 'is-active' : ''} aria-expanded={effectsOpen} onClick={openEffects}><WandSparkles size={16} /> Effects</button>
          <button type="button" className={zoomEnabled ? 'is-active' : ''} onClick={() => setZoomEnabled(value => !value)} aria-pressed={zoomEnabled}>Zoom {zoomEnabled ? 'On' : 'Off'}</button>
          <button type="button" className={clarityOpen ? 'is-active' : ''} aria-expanded={clarityOpen} onClick={openClarity}><WandSparkles size={16} /> Clarity</button>
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
          playsInline
          crossOrigin={'anonymous'}
          preload="metadata"
          aria-label="Story music player"
          onLoadStart={() => setAudioLoading(true)}
          onWaiting={() => setAudioLoading(true)}
          onCanPlay={() => setAudioLoading(false)}
          onLoadedMetadata={() => { applyPendingMusicResume(); setAudioLoading(false); }}
          onTimeUpdate={() => persistMusicPlayback(Boolean(audioPlayerRef.current && !audioPlayerRef.current.paused))}
          onPlaying={() => {
            void controllerRef.current?.resumeAudioAnalysis().catch(() => undefined);
            applyPendingMusicResume();
            setAudioLoading(false);
            setAudioPlaying(true);
            persistMusicPlayback(true);
          }}
          onVolumeChange={() => setAudioMuted(Boolean(audioPlayerRef.current?.muted))}
          onPause={() => {
            setAudioPlaying(false);
            if (!audioPauseGuardRef.current) {
              audioManuallyStoppedRef.current = true;
              persistMusicPlayback(false, true);
            }
          }}
          onEnded={() => void advanceMusic()}
          onError={() => {
            setAudioLoading(false);
            setAudioPlaying(false);
            setMusicError(musicQueue[0]?.source === 'drive'
              ? 'This Drive song is cached, but this browser or TV cannot decode its format. MP3 or AAC/M4A works on the widest range of phones and TVs.'
              : 'This audio file was downloaded, but this browser or TV cannot decode its format. MP3 or AAC/M4A works on the widest range of phones and TVs.');
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
            <div className="memory-reel-panel-heading memory-reel-reveal">
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
              {driveAccessToken && driveFolders && driveFolders.length > 0 && (
                <label className="memory-reel-folder-picker memory-reel-music-folder-picker">
                  <span>Drive music folder</span>
                  <select value={musicDriveFolderId} onChange={event => setMusicDriveFolderId(event.target.value)} aria-label="Choose Drive music folder">
                    <option value="">All Drive audio</option>
                    {driveFolders.filter(folder => folder.id && folder.id !== 'drive-root').map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                  </select>
                </label>
              )}
              <label className="memory-reel-upload memory-reel-drive-upload"><Upload size={15} /> {driveUploadLoading ? 'Uploading...' : 'Upload songs to Drive'}<input type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac,.aiff,.aif,.mka,.webm,.amr,.wma" multiple disabled={driveUploadLoading || !driveAccessToken} onChange={event => { void uploadSongsToDrive(event.target.files || []); event.currentTarget.value = ''; }} /></label>
              {driveAccessToken && <button type="button" onClick={() => void loadDriveSongs()} disabled={driveSongsLoading}><Search size={15} /> {driveSongsLoading ? 'Loading Drive songs...' : 'Load Drive songs'}</button>}
              <button type="button" onClick={() => void connectAdditionalMusicDrive()} disabled={secondaryDriveSongsLoading}><HardDrive size={15} /> {secondaryDriveSongsLoading ? 'Connecting second Drive...' : 'Add music from another Drive'}</button>
            </div>
            <p className="memory-reel-music-note">Drive songs download locally for offline playback. The second Drive option asks you to choose another Gmail account and is used only for Story Mode music.</p>
            {musicError && <div className="memory-reel-music-error" role="alert">
              <p>{musicError}</p>
              {onDriveReconnect && /authorization expired|access was denied|reconnect(?: google)? drive|drive audio could not play/i.test(musicError) && <button type="button" onClick={() => void onDriveReconnect()}>Reconnect Drive</button>}
            </div>}
            {musicName && <p className="memory-reel-current-music">Now selected: {musicName}</p>}
            {musicQueue.length > 0 && (
              <div className="memory-reel-queue">
                {musicQueue.map((track, index) => {
                  const isCurrent = currentMusicId === track.id;
                  return (
                  <div className={`memory-reel-queue-item${isCurrent ? ' is-current' : ''}`} key={track.id}>
                    <button type="button" className="memory-reel-queue-select" onClick={() => void playQueuedMusic(index)} aria-current={isCurrent ? 'true' : undefined} aria-label={`Play ${track.label}`}><b>{index + 1}.</b> {track.label}{isCurrent && <span className="memory-reel-current-track">Playing</span>}</button>
                    <div>
                      <button type="button" onClick={() => moveMusic(index, -1)} disabled={index === 0} aria-label="Move song earlier">↑</button>
                      <button type="button" onClick={() => moveMusic(index, 1)} disabled={index === musicQueue.length - 1} aria-label="Move song later">↓</button>
                      <button type="button" onClick={() => removeMusic(index)} aria-label="Remove song">×</button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
            {!musicQueue.length && !allDriveSongs.length && !musicResults.length && !musicError && (
              <p className="memory-reel-music-note">No song selected yet. Add a local song, search free music, or load songs from Drive.</p>
            )}
            {allDriveSongs.length > 0 && (
              <div className="memory-reel-drive-songs">
                <div className="memory-reel-music-heading">Songs stored in Drive</div>
                {allDriveSongs.map(song => (
                  <button type="button" className="memory-reel-track" key={song.id} onClick={() => chooseDriveSong(song)}>
                    <strong>{musicQueue.some(track => track.driveFileId === song.id) ? '✓ Queued · ' : ''}{song.name}</strong>
                  </button>
                ))}
              </div>
            )}
            {driveAccessToken && driveSongsLoaded && !allDriveSongs.length && !musicError && (
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
            <div className="memory-reel-template-heading memory-reel-reveal">
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
            <div className="memory-reel-template-heading memory-reel-reveal">
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
        {clarityOpen && (
          <div
            ref={clarityPanelRef}
            className="memory-reel-template-panel memory-reel-clarity-panel"
            aria-label="Choose story image clarity"
            tabIndex={0}
            onKeyDown={event => handleStoryPanelKeyDown(event, clarityPanelRef)}
            onFocusCapture={keepFocusedControlVisible}
            onWheel={stopPanelScrollPropagation}
            onTouchMove={stopPanelScrollPropagation}
          >
            <div className="memory-reel-template-heading memory-reel-reveal">
              <div><WandSparkles size={16} /><strong>Story image clarity</strong></div>
              <div className="memory-reel-template-heading-actions">
                <span>{MEMORY_REEL_CLARITIES.find(item => item.id === clarity)?.name}</span>
                <button type="button" className="memory-reel-panel-close" onClick={() => setClarityOpen(false)} aria-label="Close clarity panel">
                  <X size={17} />
                </button>
              </div>
            </div>
            <p className="memory-reel-effects-note">These presets only change display filters and motion. They do not upscale the source file.</p>
            <div className="memory-reel-effect-grid">
              {MEMORY_REEL_CLARITIES.map(item => (
                <button
                  type="button"
                  key={item.id}
                  className={clarity === item.id ? 'is-active' : ''}
                  onClick={() => setClarity(item.id)}
                  aria-pressed={clarity === item.id}
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
