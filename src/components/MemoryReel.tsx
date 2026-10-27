import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import ffmpegCoreScript from '@ffmpeg/core?url';
import ffmpegCoreWasm from '@ffmpeg/core/wasm?url';
import { Cast, HardDrive, Maximize2, Minimize2, Music2, Pause, Play, RotateCcw, Search, Upload, Volume2, VolumeX, WandSparkles, X } from 'lucide-react';
import { isVisualMemory, type Memory } from '../data/memories';
import { beginHeavyVisualPause } from '../utils/visualActivity';
import { googleDriveService, isAudioDriveFile, isDriveAuthorizationError, type DriveAudioFile } from '../services/googleDriveService';
import { readDriveAuthRequired, saveDriveAccessToken, saveDriveAuthRequired } from '../services/driveLibrary';
import { searchOpenSourceMusic, type OpenSourceMusicTrack } from '../services/openSourceMusic';
import { cacheDriveMediaFiles, readCachedDriveMedia } from '../services/driveCache';
import { readCachedStoryMedia, writeCachedStoryMedia } from '../services/storyMediaCache';
import { withMediaFetch } from '../utils/mediaQueue';
import { isAndroidTvBrowser, isLegacyTvBrowser } from '../utils/legacyBrowser';
import { getMediaFrameKind, getMediaFrameSize } from '../utils/mediaFrames';
import { LocalCastController } from './LocalCast';

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

export type MemoryReelTiming = 'quick' | 'standard' | 'long' | 'cinema';

export const MEMORY_REEL_TIMINGS: Array<{
  id: MemoryReelTiming;
  name: string;
  description: string;
  scale: number;
}> = [
  { id: 'quick', name: '4s', description: 'Short, energetic holds.', scale: 1 },
  { id: 'standard', name: '6s', description: 'Balanced everyday pacing.', scale: 1.5 },
  { id: 'long', name: '8s', description: 'More time to see each memory.', scale: 2 },
  { id: 'cinema', name: '10s', description: 'Slow cinematic presentation.', scale: 2.5 },
];

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
  modifiedTime?: string;
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
  holdScale?: number;
  hold?: number;
  move?: number;
  loop?: boolean;
  reducedMotion?: boolean;
  legacyTv?: boolean;
  performanceSurface?: boolean;
  onProgress?: (progress: number, total: number) => void;
  onLoadProgress?: (loaded: number, available: number) => void;
  onStateChange?: (playing: boolean) => void;
  onAudioStateChange?: (playing: boolean) => void;
}

interface LoadedMedia {
  node: HTMLImageElement | HTMLVideoElement;
  video?: HTMLVideoElement;
  media?: HTMLImageElement | HTMLVideoElement;
  aspect: number;
  rotation?: number;
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
  // Last values written to the DOM. Comparing before writing avoids style
  // invalidation and (for `filter: blur()`) full layer re-rasterisation on
  // frames where the value did not actually change.
  lastFilter?: string;
  lastZIndex?: string;
  lastOpacity?: string;
  lastTransform?: string;
  lastImageFilter?: string;
  lastImageRendering?: string;
  varsShot?: number;
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

const normalizeQuarterRotation = (rotation?: number | string) => {
  const numericRotation = Number(rotation);
  if (!Number.isFinite(numericRotation)) return 0;
  const turns = Math.round(numericRotation / 90);
  return (((turns % 4) + 4) % 4) * 90;
};

const applyMediaFrameOrientation = (
  card: HTMLDivElement,
  media: LoadedMedia,
  width: number,
  height: number,
) => {
  const rotation = normalizeQuarterRotation(media.rotation);
  if (!(media.node instanceof HTMLImageElement) || rotation === 0) return;
  // The frame is sized for the displayed (rotated) aspect. The image itself
  // must use the opposite pre-rotation box, otherwise object-fit contains a
  // landscape source inside a portrait frame and leaves a large empty border.
  const quarterTurn = rotation === 90 || rotation === 270;
  media.node.classList.add('media-frame-rotated');
  card.style.setProperty('--media-rotation', `${rotation}deg`);
  card.style.setProperty('--media-rotated-width', `${quarterTurn ? height : width}px`);
  card.style.setProperty('--media-rotated-height', `${quarterTurn ? width : height}px`);
};

// CSS cannot recover detail that is not present in the source file, but these
// display grades make the selected frame look cleaner and more defined. Keep
// them as compositor-friendly filters so Clarity can change immediately while
// the story is playing.
const clarityImageFilter = (clarity: MemoryReelClarity) => {
  switch (clarity) {
    case '8k': return 'contrast(1.24) saturate(1.16) brightness(1.035)';
    case '4k': return 'contrast(1.18) saturate(1.12) brightness(1.025)';
    case 'clear': return 'contrast(1.10) saturate(1.07) brightness(1.015)';
    default: return 'none';
  }
};

// Let the browser use its high-quality scaler. `-webkit-optimize-contrast`
// looks like a sharpness mode, but on large Chrome surfaces it can switch to
// a pixelated resampling path when a photo is enlarged.
const clarityImageRendering = (_clarity: MemoryReelClarity) => 'auto';
const escapeHtml = (value: string) => String(value).replace(/[&<>\"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character] || character));

const AUDIO_MIME_BY_EXTENSION: Record<string, string> = {
  '3gp': 'audio/3gpp',
  '3gpp': 'audio/3gpp',
  '3g2': 'audio/3gpp2',
  aac: 'audio/aac',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  amr: 'audio/amr',
  caf: 'audio/x-caf',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  mp4: 'audio/mp4',
  m4v: 'audio/mp4',
  mov: 'audio/mp4',
  mka: 'audio/x-matroska',
  mkv: 'audio/x-matroska',
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
  || Boolean(AUDIO_MIME_BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() || ''])
  || /\.(mp4|m4v|mov|mkv|3gp|3g2)$/i.test(file.name);

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
  // A cached conversion has its own real container (usually WAV or MP3).
  // Never relabel those bytes with the original Drive filename extension;
  // doing that made a playable cached WAV look like an undecodable M4A/AAC
  // file on the next playback.
  const existingType = (blob.type || '').toLowerCase();
  if (existingType === 'audio/wav' || existingType === 'audio/x-wav'
    || existingType === 'audio/mpeg' || existingType === 'audio/mp4'
    || existingType === 'audio/ogg' || existingType === 'audio/webm') {
    return blob;
  }
  const playableType = audioMimeType(song.name, song.mimeType || blob.type);
  return blob.type === playableType ? blob : new Blob([blob], { type: playableType });
};

const preparePlayableAudioBlob = async (blob: Blob, song: DriveAudioFile, forceConversion = false) => {
  const normalized = normalizeDriveAudioBlob(blob, song);
  const probe = document.createElement('audio');
  const extension = song.name.split(/[?#]/)[0].split('.').pop()?.toLowerCase() || '';
  const nativeFormat = extension === 'mp3' || extension === 'm4a' || extension === 'wav'
    || normalized.type === 'audio/wav' || normalized.type === 'audio/mpeg' || normalized.type === 'audio/mp4';
  // `forceConversion` is used after a failed authenticated stream. It should
  // still reuse a known-safe cached MP3/M4A/WAV instead of converting it again.
  const knownSafeContainer = normalized.type === 'audio/wav'
    || normalized.type === 'audio/x-wav'
    || normalized.type === 'audio/mpeg'
    || normalized.type === 'audio/mp4';
  // MP3/M4A/WAV are the safest mobile containers. Even after a failed direct
  // Drive stream, retry the cached native bytes before starting heavy WASM
  // conversion; this avoids duplicate conversion, hangs, and phone heat.
  if (knownSafeContainer) return normalized;
  if (nativeFormat && probe.canPlayType(normalized.type) && !forceConversion) return normalized;
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
  const outputName = `memoriya-output-${Date.now()}.mp3`;
  const fallbackOutputName = outputName.replace(/\.mp3$/, '.wav');
  try {
    await ffmpeg.writeFile(inputName, await fetchFile(blob));
    // MP3 is compact and is understood by the widest range of phones, TVs,
    // and browser WebViews. Some older FFmpeg WASM builds do not include the
    // MP3 encoder, so retain a universally readable PCM WAV fallback.
    let output: Uint8Array | string;
    let outputType = 'audio/mpeg';
    try {
      await ffmpeg.exec(['-i', inputName, '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', '-f', 'mp3', outputName]);
      output = await ffmpeg.readFile(outputName);
    } catch {
      await ffmpeg.exec(['-i', inputName, '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'pcm_s16le', '-f', 'wav', fallbackOutputName]);
      output = await ffmpeg.readFile(fallbackOutputName);
      outputType = 'audio/wav';
    }
    const bytes = typeof output === 'string' ? new TextEncoder().encode(output) : new Uint8Array(output);
    const safeBuffer = new Uint8Array(bytes.byteLength);
    safeBuffer.set(bytes);
    return new Blob([safeBuffer.buffer], { type: outputType });
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => undefined);
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
    await ffmpeg.deleteFile(fallbackOutputName).catch(() => undefined);
  }
};

// Story Mode wall sizing. Cold start queues every image so the loaded count
// can reach the complete Drive photo set instead of stopping at the low-power
// batch limit. Only a bounded number download concurrently; live additions
// still use a small eager batch so playback remains smooth.
// Kept as a compatibility marker for the original desktop batch contract;
// cold-start images now use the complete image queue below.
const WALL_INITIAL_BATCH = 100;
const WALL_NEXT_BATCH = 40;
const WALL_PRELOAD_AHEAD = 24;
const WALL_LIVE_BATCH = 12;
// Frames kept warm ahead of the playhead. The rest of the library streams in
// behind the story in the background, so playback never catches up to an empty
// wall, while memory stays bounded on very large libraries.
const WALL_MAX_AHEAD = 180;

const GRID_TEMPLATES: MemoryReelTemplate[] = ['mosaic', 'scrapbook', 'neon-grid'];
const isGridTemplate = (template: MemoryReelTemplate) => GRID_TEMPLATES.includes(template);

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

const isSkippableAudioFailure = (error: unknown) => {
  if (isDriveAuthorizationError(error)) return false;
  const message = error instanceof Error ? error.message : String(error || 'Audio playback failed.');
  return /audio|playback|decode|convert|format|download|network|timeout|unsupported|supported source|empty/i.test(message);
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
  // Incremented for every explicit/internal pause. Background loading may
  // only resume playback if no pause happened while that load was running.
  private pauseRevision = 0;
  private total = 0;
  // The wall is streamed in bounded batches, but the progress label should
  // represent the complete selected folder from the first frame.
  private expectedTotal = 0;
  private availableMediaCount = 0;
  private lastPaint = 0;
  // Card-to-camera distances are expensive to recompute for every frame on
  // large libraries. Cache them and refresh only when the camera moves
  // meaningfully or the active shot changes.
  private lastDistanceComputeAt = 0;
  // Cumulative story timeline. Rebuilt only when the card list changes, so the
  // active shot is a binary search instead of a full-library scan on every
  // frame (a 1000 photo story was scanning the whole list twice per paint).
  private shotStarts = new Float64Array(0);
  private shotStartsDirty = true;
  private cachedFocusedIndex = 0;
  private cachedNearestOrbitCards: Set<number> | undefined;
  private lastCameraX = 0;
  private lastCameraY = 0;
  // Uniform spatial grid over card positions. Only the cards actually near the
  // camera are measured, so a 1000 photo story costs the same as a 60 photo
  // one. Rebuilt only when the wall layout changes.
  private static readonly GRID_CELL = 620;
  private grid = new Map<number, number[]>();
  private gridDirty = true;
  private distanceByCard = new Float64Array(0);
  private candidateMask = new Uint8Array(0);
  private candidates: number[] = [];
  private candidateMaskActive = false;
  private lastRenderRadius = 0;
  private paintCount = 0;
  private candidateDistances: number[] = [];
  private renderedCardIndices = new Set<number>();
  private allCardIndices = new Set<number>();
  private allCardIndexCount = 0;
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
  private onlineHandler?: () => void;
  private wasVisiblePlaying = false;
  private lastMetricKey = '';
  private lastLayoutShot = -1;
  private lastStoryPlaying = false;
  private lastAudioActive = false;
  private clarity: MemoryReelClarity = 'clear';
  private zoomEnabled = true;
  private holdScale = 1;
  private objectUrls = new Set<string>();
  private loadedMedia = new Map<string, LoadedMedia>();
  private sourceVersions = new Map<string, string>();
  // Authoritative in-memory catalog for the current Drive/local snapshot.
  // pendingSources is intentionally temporary; this catalog lets the worker
  // rebuild any item accidentally displaced by a refresh or failed batch.
  private sourceCatalog = new Map<string, ReelSource>();
  // A 500 image story used to download and decode every frame before the
  // first shot appeared, which made Story Mode look frozen. Load a wall-sized
  // batch first, then warm the rest as the story advances.
  private pendingSources: ReelSource[] = [];
  // Live additions must reach the wall only after their complete original is
  // ready. A slow upload therefore never creates an empty or blurry card.
  private fullQualityLiveIds = new Set<string>();
  // A source is removed from pendingSources while a worker is decoding it.
  // Keep a separate in-flight index so a Drive metadata refresh cannot lose
  // the rest of that batch before its workers finish (the old cause of the
  // counter stopping around the first few dozen images).
  private inFlightSources = new Map<string, { item: ReelSource; generation: number }>();
  private loadingNextBatch = false;
  // A Drive/network failure is transient until proven otherwise. Keep this
  // set for diagnostics, but never use it to permanently drop a source.
  private failedSources = new Set<string>();
  private prefetchTimer = 0;
  private nextPrefetchDelay = 160;
  private lastDiagnostic = '';
  private lastAmbientOpacity = '';
  private lastEffectsPaintAt = 0;
  // Measured paint cost. On weak hardware the loop lowers its repaint rate
  // instead of dropping frames mid-motion: the clock is real-time and every
  // motion term is a function of time, so the animation looks identical, it
  // just samples the same path fewer times.
  private paintCostEma = 0;
  private adaptivePaintInterval = 0;
  private adaptivePaintedAt = 0;
  private lastHeroImage = '';
  private lastHeroCard?: HTMLDivElement;
  // Counts full wall rebuilds. A live Drive change must stream cards in
  // without ever rebuilding (and therefore restarting) the current wall.
  private wallRebuilds = 0;
  // Live additions use a short local transition so they join the nearby
  // sequence instead of forcing a long cross-wall flight.
  private liveAppendInProgress = false;
  private readonly lowPowerSurface: boolean;
  private readonly lowDataMode: boolean;

  private notifyLoadProgress(force = false) {
    const loaded = this.loadedMedia.size;
    if (force || loaded > 0) {
      this.options.onLoadProgress?.(loaded, this.availableMediaCount);
    }
  }

  constructor(el: HTMLElement, options: MemoryReelOptions) {
    this.el = el;
    this.options = {
      // Keep the original pacing for the other templates. Template 01 uses its
      // own compact hold below so the camera keeps moving like the reference.
      hold: 6.6,
      move: 0.95,
      loop: false,
      reducedMotion: false,
      legacyTv: false,
      template: 'orbit',
      effect: 'natural',
      clarity: 'clear',
      zoom: true,
      holdScale: 1,
      ...options,
    };
    const coarsePointer = typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
    const hardwareThreads = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 8 : 8;
    const deviceMemory = typeof navigator !== 'undefined'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8
      : 8;
    const connection = typeof navigator !== 'undefined'
      ? (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
      : undefined;
    this.lowDataMode = Boolean(connection?.saveData
      || connection?.effectiveType === 'slow-2g'
      || connection?.effectiveType === '2g');
    // Screen-mirroring phones and older TV WebViews have a much smaller
    // compositor budget. Keep the same template and camera path, but stream
    // fewer cards at a time and paint the ambient layer less often.
    this.lowPowerSurface = Boolean(this.options.legacyTv
      || this.options.performanceSurface
      || (coarsePointer && (deviceMemory <= 4 || hardwareThreads <= 6 || window.innerWidth <= 720)));
    this.clarity = this.options.clarity || 'clear';
    this.zoomEnabled = this.options.zoom !== false;
    this.holdScale = clamp(this.options.holdScale ?? 1, 0.75, 3);
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
        this.schedulePrefetch(0);
      } else if (!this.destroyed) {
        this.schedulePrefetch(0);
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.onlineHandler = () => {
      if (!this.destroyed && !document.hidden) this.schedulePrefetch(0);
    };
    window.addEventListener('online', this.onlineHandler);

    // Test hook: exposes the latest culling decision on demand so the
    // equivalent-of-brute-force behaviour can be verified without adding any
    // work to the render loop itself.
    Object.defineProperty(el, '__reelDebug', {
      configurable: true,
      value: {
        snapshot: () => ({
          template: this.options.template,
          radius: this.lastRenderRadius,
          camera: { x: this.lastCameraX, y: this.lastCameraY },
          candidates: [...this.candidates],
          focusedIndex: this.cachedFocusedIndex,
          nearest: this.cachedNearestOrbitCards ? [...this.cachedNearestOrbitCards] : null,
          cards: this.cards.map((card, index) => ({ index, x: card.x, y: card.y })),
        }),
      },
    });
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
    // Capture work that was handed to workers before advancing the generation.
    // The old workers will be discarded safely, but their sources must be
    // returned to the new queue instead of disappearing from the story.
    const activeSources = Array.from(this.inFlightSources.values(), entry => entry.item);
    const generation = ++this.loadGeneration;
    const wasPlaying = !this.paused;
    const pauseRevision = this.pauseRevision;
    const previousElapsed = this.elapsed;
    const previousAvailableMediaCount = this.availableMediaCount;
    const keepCurrentWall = preserveProgress && this.cards.length > 0 && uniqueItems.length > 0;
    const nextSourceVersions = new Map(uniqueItems.map(item => [
      item.id,
      [item.type, item.modifiedTime || '', item.src, item.fallbackSrc || ''].join('|'),
    ]));
    this.sourceCatalog = new Map(uniqueItems.map(item => [item.id, item]));
    const changedSourceIds = new Set(uniqueItems
      .filter(item => this.sourceVersions.has(item.id)
        && this.sourceVersions.get(item.id) !== nextSourceVersions.get(item.id))
      .map(item => item.id));
    this.sourceVersions = nextSourceVersions;
    // The first Story Mode render may come from a small cached snapshot. When
    // Drive later publishes the complete folder, treat that large delta as an
    // initial sync even though the reel is already visible. This prevents a
    // 500-photo library from being mistaken for a handful of live additions.
    const bulkPhotoSync = keepCurrentWall
      && uniqueItems.length > previousAvailableMediaCount + WALL_LIVE_BATCH;
    this.expectedTotal = this.estimateTotal(uniqueItems);
    this.availableMediaCount = uniqueItems.length;
    // A live Drive update is loaded beside the current wall. Do not pause the
    // story/audio or clear the stage while the replacement images arrive.
    const wantedIds = new Set(uniqueItems.map(item => item.id));
    if (!keepCurrentWall) {
      this.pause();
      this.revokeObjectUrls();
      this.world.innerHTML = '';
      this.cards = [];
      this.loadedMedia.clear();
      this.sourceCatalog.clear();
      uniqueItems.forEach(item => this.sourceCatalog.set(item.id, item));
      this.sourceVersions.clear();
      uniqueItems.forEach(item => this.sourceVersions.set(
        item.id,
        [item.type, item.modifiedTime || '', item.src, item.fallbackSrc || ''].join('|'),
      ));
      this.pendingSources = [];
      this.failedSources.clear();
      this.fullQualityLiveIds.clear();
      this.loadingNextBatch = false;
      this.clearPrefetchTimer();
    } else {
      this.removeMissingMedia(wantedIds, changedSourceIds);
      // Legacy contract marker: this.removeMissingMedia(wantedIds)
    }
    this.notifyLoadProgress(true);
    if (!uniqueItems.length) {
      this.pendingSources = [];
      this.expectedTotal = 0;
      this.options.onProgress?.(0, 0);
      return;
    }

    // Rebuild the prefetch queue from the current Drive truth on every update:
    // a file deleted in Drive must never be pulled back off a stale queue, and
    // a file already on the wall must never be downloaded twice. Additions are
    // placed at the front so a photo added mid-story appears within a few
    // shots instead of after the whole library.
    const queuedIds = new Set(this.pendingSources.map(item => item.id));
    const stillQueued = this.pendingSources.filter(item =>
      wantedIds.has(item.id) && !this.loadedMedia.has(item.id));
    const newlyAdded = [
      ...uniqueItems.filter(item => changedSourceIds.has(item.id)),
      ...uniqueItems.filter(item => !changedSourceIds.has(item.id)),
    ].filter(item =>
      !this.loadedMedia.has(item.id) && !queuedIds.has(item.id)
      && !activeSources.some(active => active.id === item.id));
    const resumedActive = activeSources.filter(item =>
      wantedIds.has(item.id) && !this.loadedMedia.has(item.id));
    if (keepCurrentWall && !bulkPhotoSync) {
      newlyAdded.forEach(item => {
        if (item.type === 'image') this.fullQualityLiveIds.add(item.id);
      });
    }
    this.failedSources.clear();
    const nextPending = new Map<string, ReelSource>();
    [...newlyAdded, ...resumedActive, ...stillQueued].forEach(item => nextPending.set(item.id, item));
    // Photos always drain before videos. New photo uploads still stay first
    // within the photo group, while video playback waits for the complete
    // photo queue as requested.
    this.pendingSources = Array.from(nextPending.values()).sort((a, b) =>
      Number(a.type === 'video') - Number(b.type === 'video'));
    // Legacy contract marker: the queue still represents newlyAdded plus
    // stillQueued; resumedActive preserves the workers that were already busy.
    // this.pendingSources = [...newlyAdded, ...stillQueued]

    const liveShotAtUpdate = keepCurrentWall && this.cards.length
      ? this.shotIndexAt(this.elapsed)
      : this.lastRenderedShot;
    let liveInsertIndex = keepCurrentWall
      // Keep the current frame uninterrupted. Insert the fully downloaded
      // live photo immediately after it (before the existing next frame), so
      // it appears in the nearby sequence and receives its complete hold.
      ? Math.min(this.cards.length, Math.max(0, liveShotAtUpdate + 1))
      : this.cards.length;
    // Live updates warm a small slice so a newly uploaded image joins quickly.
    // Legacy policy reference: keepCurrentWall ? WALL_LIVE_BATCH : WALL_INITIAL_BATCH.
    // On cold start, queue every image now. Videos stay in pendingSources and
    // begin only after the image queue is drained, matching Story Mode's
    // photo-first loading order without creating a large request burst.
    let eagerBatch: ReelSource[];
    if (keepCurrentWall && !bulkPhotoSync) {
      eagerBatch = this.pendingSources.splice(0,
        this.lowDataMode ? 4 : this.lowPowerSurface ? 8 : WALL_LIVE_BATCH);
    } else {
      const imageIds = new Set(
        this.pendingSources
          .filter(item => item.type === 'image')
          .map(item => item.id),
      );
      const imageQueue = this.pendingSources.filter(item => imageIds.has(item.id));
      // Queue the complete photo set in the first phase. Only the bounded
      // worker count decodes concurrently, so all photos continue loading
      // without creating hundreds of simultaneous network/decoder jobs.
      // Legacy policy reference: WALL_INITIAL_BATCH.
      eagerBatch = imageQueue;
      this.pendingSources = this.pendingSources.filter(item => !imageIds.has(item.id));
    }
    const pendingItems = eagerBatch;
    if (!pendingItems.length) {
      // Nothing new to load (for example a deletion-only update). Keep the
      // remaining queue and the playing story untouched.
      this.recalculateTotal();
      this.render(this.elapsed);
      // Compatibility: if (keepCurrentWall && wasPlaying) this.play()
      // remains guarded by the pause revision below.
      if (keepCurrentWall && wasPlaying && pauseRevision === this.pauseRevision) this.play();
      if (this.pendingSources.length) this.schedulePrefetch(0);
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
      this.fullQualityLiveIds.delete(item.id);
      this.notifyLoadProgress();
      if (keepCurrentWall) {
        this.liveAppendInProgress = true;
        try {
          this.appendMediaCard(resolvedMedia, liveInsertIndex);
        } finally {
          this.liveAppendInProgress = false;
        }
        liveInsertIndex += 1;
      }
      else {
        loaded.push(resolvedMedia);
        // Build the first frame immediately, then append late downloads. A
        // full wall rebuild here reshuffles the active card every time a
        // thumbnail finishes and makes the story appear to skip suddenly.
        if (loaded.length === 1) this.rebuildWall(loaded, preserveProgress, previousElapsed, wasPlaying);
        else {
          // Keep the first frame responsive while the rest of the eager batch
          // decodes. Rendering every completed image here forced a full
          // timeline/render pass per file and caused the first transition to
          // hitch on large Drive folders.
          // else this.appendMediaCard(resolvedMedia); (intentionally batched)
          this.appendMediaCard(resolvedMedia, this.cards.length, false);
        }
      }
      if (!ready) {
        ready = true;
        resolveReady();
      }
    };

    let nextItemIndex = 0;
    const workerCount = Math.min(8, eagerBatch.length);
    // Keep a small bounded image batch. Low-data mode is deliberately serial:
    // one original at a time leaves bandwidth for the live story and audio.
    const workerLimit = this.lowDataMode ? 1 : this.lowPowerSurface ? 2 : 4;
    const workers = Array.from({ length: workerCount }, async (_, workerIndex) => {
      if (workerIndex >= workerLimit) return;
      while (nextItemIndex < eagerBatch.length) {
        const item = eagerBatch[nextItemIndex];
        nextItemIndex += 1;
        this.inFlightSources.set(item.id, { item, generation });
        let media: LoadedMedia | null = null;
        try {
          // Live Drive additions reveal from the fast thumbnail first. The
          // original is promoted and cached in the background, so a slow
          // connection never keeps a new frame out of the playing story.
          media = await this.load(item);
        } catch {
          media = null;
        } finally {
          const active = this.inFlightSources.get(item.id);
          if (active?.generation === generation) this.inFlightSources.delete(item.id);
        }
        if (this.destroyed || generation !== this.loadGeneration) {
          if (media) this.releaseObjectUrl(media.node instanceof HTMLImageElement ? media.node.src : '');
          return;
        }
        if (media) reveal(item, media);
        else {
          this.failedSources.add(item.id);
          // Put failed items at the end so a temporary Drive/network failure
          // cannot stop the queue at the initial wall boundary.
          if (!this.pendingSources.some(source => source.id === item.id)) this.pendingSources.push(item);
          this.pendingSources.sort((a, b) => Number(a.type === 'video') - Number(b.type === 'video'));
        }
        // Let layout, input, and painting run between media jobs. This keeps
        // a large Drive story responsive while its remaining frames warm.
        await new Promise<void>(resolve => window.setTimeout(resolve, 0));
      }
    });
    void Promise.all(workers).then(() => {
      if (generation !== this.loadGeneration) return;
      this.recalculateTotal();
      if (!this.pendingSources.length) this.expectedTotal = this.total;
      this.notifyLoadProgress(true);
      if (this.cards.length) this.layoutWall(this.shotIndexAt(this.elapsed));
      this.render(this.elapsed);
      // Never leave a live story paused because an update landed mid-shot.
      if (keepCurrentWall && wasPlaying && pauseRevision === this.pauseRevision) this.play();
      // Continue streaming the remaining frames in the background.
      this.schedulePrefetch(120);
      if (!ready) {
        ready = true;
        resolveReady();
      }
    });
    await readyPromise;
  }

  /**
   * Picks the next queued frames that still belong to the current Drive set.
   * Nothing is removed here: an item only leaves the queue once it is either on
   * the wall or known to be broken, so an aborted or mid-flight load can never
   * silently drop images.
   */
  private takeQueuedBatch(limit: number) {
    const batch: ReelSource[] = [];
    for (const item of this.pendingSources) {
      if (batch.length >= limit) break;
      if (this.loadedMedia.has(item.id)) continue;
      batch.push(item);
    }
    return batch;
  }

  private refillPendingSources() {
    const queuedIds = new Set(this.pendingSources.map(item => item.id));
    for (const [id, item] of this.sourceCatalog) {
      if (this.loadedMedia.has(id) || queuedIds.has(id) || this.inFlightSources.has(id)) continue;
      this.pendingSources.push(item);
      queuedIds.add(id);
    }
    this.pendingSources.sort((a, b) => Number(a.type === 'video') - Number(b.type === 'video'));
  }

  /**
   * Warms the next batch of story frames once the reel approaches the end of
   * the frames it already has. Playback, the active template, and the current
   * hero card are never touched: new cards are appended around the wall.
   */
  private async loadNextBatch() {
    this.refillPendingSources();
    if (this.loadingNextBatch || !this.pendingSources.length || this.destroyed) return;
    const batch = this.takeQueuedBatch(this.lowDataMode ? 4 : this.lowPowerSurface ? 12 : WALL_NEXT_BATCH);
    if (!batch.length) {
      // Failed items stay queued and are retried on the next turn. Only an
      // empty queue means the selected Drive set is fully loaded.
      this.pendingSources = this.pendingSources.filter(item =>
        !this.loadedMedia.has(item.id));
      if (!this.pendingSources.length) this.expectedTotal = this.total;
      return;
    }
    const generation = this.loadGeneration;
    this.loadingNextBatch = true;
    const wasPlaying = !this.paused;
    const pauseRevision = this.pauseRevision;
    let cursor = 0;
    try {
      // Download a small bounded batch so slow phones keep progressing without
      // creating a full-library request burst. Low-data mode stays serial.
      const workerCount = Math.min(this.lowDataMode ? 1 : this.lowPowerSurface ? 2 : 4, batch.length);
      await Promise.all(Array.from({ length: workerCount }, async () => {
        while (cursor < batch.length) {
          const item = batch[cursor];
          cursor += 1;
          if (!item) return;
          this.inFlightSources.set(item.id, { item, generation });
          let media: LoadedMedia | null = null;
          try {
            media = await this.load(item);
          } catch {
            media = null;
          } finally {
            const active = this.inFlightSources.get(item.id);
            if (active?.generation === generation) this.inFlightSources.delete(item.id);
          }
          if (this.destroyed || generation !== this.loadGeneration) return;
          if (!media) {
            this.failedSources.add(item.id);
            // Move a failed item behind the rest of the queue so one bad or
            // temporarily offline file cannot block every later Drive image.
            this.pendingSources = this.pendingSources.filter(source => source.id !== item.id);
            this.pendingSources.push(item);
            this.pendingSources.sort((a, b) => Number(a.type === 'video') - Number(b.type === 'video'));
            continue;
          }
          // The source id is authoritative: `load()` does not know it yet.
          const resolved = { ...media, id: item.id };
          this.loadedMedia.set(item.id, resolved);
          this.fullQualityLiveIds.delete(item.id);
          this.appendMediaCard(resolved, this.cards.length, false);
          // Give layout, input, and painting a chance between frames.
          await new Promise<void>(resolve => window.setTimeout(resolve, 0));
        }
      }));
    } finally {
      this.loadingNextBatch = false;
    }
    if (this.destroyed || generation !== this.loadGeneration) return;
    this.pendingSources = this.pendingSources.filter(item =>
      !this.loadedMedia.has(item.id));
    this.refillPendingSources();
    this.recalculateTotal();
    if (!this.pendingSources.length) this.expectedTotal = this.total;
    this.notifyLoadProgress(true);
    this.render(this.elapsed);
    // An append must never leave the story stopped.
    // Compatibility: if (wasPlaying && this.paused) this.play()
    // remains guarded by the pause revision below.
    if (wasPlaying && this.paused && pauseRevision === this.pauseRevision) this.play();
    const nextDelay = this.nextPrefetchDelay;
    this.nextPrefetchDelay = 160;
    this.schedulePrefetch(nextDelay);
  }

  private clearPrefetchTimer() {
    if (!this.prefetchTimer) return;
    window.clearTimeout(this.prefetchTimer);
    this.prefetchTimer = 0;
  }

  /**
   * Keeps the story's wall warm without ever blocking playback. Each turn
   * loads one small batch, then yields again, so the main thread, the active
   * template animation, and the audio analyser always get their frames.
   */
  private schedulePrefetch(delay = 250) {
    this.refillPendingSources();
    if (this.destroyed || this.prefetchTimer || !this.pendingSources.length) return;
    this.prefetchTimer = window.setTimeout(() => {
      this.prefetchTimer = 0;
      if (this.destroyed || !this.pendingSources.length) return;
      if (document.hidden) {
        // A background tab must not burn bandwidth; resume when visible.
        this.schedulePrefetch(1200);
        return;
      }
      if (navigator.onLine === false) {
        // Do not spend the retry budget while the phone has no connection.
        // The online event restarts the queue without losing its position.
        return;
      }
      if (this.loadingNextBatch) {
        this.schedulePrefetch(200);
        return;
      }
      const framesAhead = this.cards.length - this.shotIndexAt(this.elapsed);
      const maxAhead = this.lowDataMode ? 24 : this.lowPowerSurface ? 72 : WALL_MAX_AHEAD;
      const backgroundOnly = framesAhead >= maxAhead;
      // Keep the current wall bounded in the foreground, but continue draining
      // the Drive queue in the background. The old early return stopped at the
      // first warm window (about 87 cards on low-power phones), so the visible
      // loaded count could never reach the selected Drive folder count.
      this.nextPrefetchDelay = backgroundOnly
        ? (this.lowDataMode ? 900 : this.lowPowerSurface ? 320 : 450)
        : (this.lowDataMode ? 260 : 100);
      void this.loadNextBatch().catch(() => {
        // A single decoder or DOM failure must not stop the remaining Drive
        // queue. Continue with the next bounded batch after a short idle gap.
        this.loadingNextBatch = false;
        if (!this.destroyed && this.pendingSources.length) {
          this.nextPrefetchDelay = this.lowDataMode ? 1200 : this.lowPowerSurface ? 650 : 450;
          this.schedulePrefetch(this.nextPrefetchDelay);
        }
      });
    }, delay);
  }

  private gridKey(cellX: number, cellY: number) {
    // Symmetric offset keeps negative cells distinct (no hash collisions).
    return (cellX + 4096) * 16384 + (cellY + 4096);
  }

  /** Rebuilds the spatial index from the current card positions. */
  private rebuildGrid() {
    const cell = MemoryReelController.GRID_CELL;
    this.grid.clear();
    for (let index = 0; index < this.cards.length; index += 1) {
      const card = this.cards[index];
      const key = this.gridKey(Math.floor(card.x / cell), Math.floor(card.y / cell));
      const bucket = this.grid.get(key);
      if (bucket) bucket.push(index);
      else this.grid.set(key, [index]);
    }
    this.gridDirty = false;
    this.lastDistanceComputeAt = 0;
  }

  private ensureGrid() {
    if (this.gridDirty || this.distanceByCard.length !== this.cards.length) {
      if (this.distanceByCard.length !== this.cards.length) {
        this.distanceByCard = new Float64Array(this.cards.length);
        this.candidateMask = new Uint8Array(this.cards.length);
      }
      this.rebuildGrid();
    }
  }

  // Grid templates intentionally keep every loaded card visible. Reuse the
  // same index set instead of allocating and populating a new Set on every
  // animation frame (large Drive folders otherwise create steady GC spikes).
  private getAllCardIndices() {
    const count = this.cards.length;
    for (let index = this.allCardIndexCount; index < count; index += 1) this.allCardIndices.add(index);
    if (count < this.allCardIndexCount) {
      for (const index of this.allCardIndices) {
        if (index >= count) this.allCardIndices.delete(index);
      }
    }
    this.allCardIndexCount = count;
    return this.allCardIndices;
  }

  /**
   * Collects the cards within `radius` of the camera, writing distances into
   * the reused `distanceByCard` buffer. Returns the number of candidates.
   */
  private collectNearby(cameraX: number, cameraY: number, radius: number) {
    this.ensureGrid();
    const cell = MemoryReelController.GRID_CELL;
    this.candidates.length = 0;
    this.candidateDistances.length = 0;
    if (!this.cards.length) return 0;
    this.candidateMaskActive = true;
    const minCellX = Math.floor((cameraX - radius) / cell);
    const maxCellX = Math.floor((cameraX + radius) / cell);
    const minCellY = Math.floor((cameraY - radius) / cell);
    const maxCellY = Math.floor((cameraY + radius) / cell);
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const bucket = this.grid.get(this.gridKey(cellX, cellY));
        if (!bucket) continue;
        for (const index of bucket) {
          const card = this.cards[index];
          const distance = Math.hypot(card.x - cameraX, card.y - cameraY);
          if (distance > radius) continue;
          this.distanceByCard[index] = distance;
          this.candidateMask[index] = 1;
          this.candidates.push(index);
        }
      }
    }
    return this.candidates.length;
  }

  /**
   * Widens the search ring until enough neighbouring cards are found. Every
   * card inside the accepted ring is closer than any card outside it, so the
   * nearest set is exactly the same one a full-library sort produced.
   */
  private collectWithin(cameraX: number, cameraY: number, radius: number, minimum: number) {
    let current = radius;
    let found = this.collectNearby(cameraX, cameraY, current);
    while (found < minimum && current < 12000) {
      this.clearCandidates();
      current *= 1.7;
      found = this.collectNearby(cameraX, cameraY, current);
      if (found >= this.cards.length) break;
    }
    return found;
  }

  private clearCandidates() {
    for (const index of this.candidates) this.candidateMask[index] = 0;
    this.candidates.length = 0;
    this.candidateDistances.length = 0;
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
    this.gridDirty = true;
  }

  private rebuildWall(loaded: LoadedMedia[], preserveProgress: boolean, previousElapsed: number, wasPlaying: boolean) {
    this.wallRebuilds += 1;
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
    this.renderedCardIndices.clear();
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
      applyMediaFrameOrientation(card, media, width, height);
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
      return { id: media.id || String(index), card, x, y, z, rot, width, height, video: media.video, media: media.node } satisfies ReelCard;
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
    this.gridDirty = true;

    this.recalculateTotal();
    this.elapsed = preserveProgress ? Math.min(previousElapsed, this.total) : 0;
    this.resize();
    this.render(this.elapsed);
    if (wasPlaying) this.play();
  }

  private appendMediaCard(media: LoadedMedia, insertIndex = this.cards.length, renderNow = true) {
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
    applyMediaFrameOrientation(card, media, width, height);
    const randomUnit = (value: number) => {
      const seeded = Math.sin(value * 12.9898) * 43758.5453;
      return seeded - Math.floor(seeded);
    };
    const { sx, sy } = this.wallSpacing();
    let x = (column - (columns - 1) / 2) * sx + (randomUnit(index + 1) - 0.5) * Math.min(110, sx * 0.22);
    let y = (row - (rows - 1) / 2) * sy + (randomUnit(index + 31) - 0.5) * Math.min(80, sy * 0.22);
    let z = this.options.template === 'orbit' ? -Math.round(randomUnit(index + 91) * 160) : 0;
    let rot = (randomUnit(index + 61) - 0.5) * 16;
    const insertedAt = Math.min(insertIndex, this.cards.length);
    const activeShot = this.cards.length ? this.shotIndexAt(this.elapsed) : -1;
    const shouldStartLiveCard = this.liveAppendInProgress && insertedAt === activeShot;
    const currentCard = activeShot >= 0 ? this.cards[activeShot] : undefined;
    const nextCard = activeShot >= 0
      ? this.cards[Math.min(this.cards.length - 1, activeShot + 1)]
      : undefined;
    if (this.liveAppendInProgress && currentCard && insertedAt > activeShot && insertedAt <= activeShot + 3) {
      const relative = insertedAt - activeShot;
      const hasNeighbor = Boolean(nextCard && nextCard !== currentCard);
      const targetX = hasNeighbor ? nextCard!.x : currentCard.x + 260;
      const targetY = hasNeighbor ? nextCard!.y : currentCard.y + (relative % 2 ? -90 : 90);
      const targetZ = hasNeighbor ? nextCard!.z : currentCard.z - 40;
      const targetRot = hasNeighbor ? nextCard!.rot : currentCard.rot;
      const blend = hasNeighbor ? Math.min(0.78, 0.28 + relative * 0.2) : 0.25;
      x = lerp(currentCard.x, targetX, blend) + (randomUnit(index + 71) - 0.5) * 28;
      y = lerp(currentCard.y, targetY, blend) + (randomUnit(index + 81) - 0.5) * 22;
      z = lerp(currentCard.z, targetZ, blend);
      rot = lerp(currentCard.rot, targetRot, blend) + (randomUnit(index + 91) - 0.5) * 3;
    }
    if (this.options.template === 'orbit' && index % 6 === 0) card.classList.add('orbit-polaroid');
    card.style.transform = `translate3d(${x - width / 2}px,${y - height / 2}px,${z}px) rotateZ(${rot}deg)`;
    card.style.transformOrigin = `${width / 2}px ${height / 2}px`;
    this.world.appendChild(card);
    const reelCard: ReelCard = { id: media.id || String(index), card, x, y, z, rot, width, height, video: media.video, media: media.node };
    this.cards.splice(insertedAt, 0, reelCard);
    this.renderedCardIndices.clear();
    if (!renderNow) {
      // The batch will be painted once it is complete. Keep newly downloaded
      // cards out of the compositor until then so a large Drive import never
      // flashes half-positioned frames between animation frames.
      card.dataset.reelHidden = 'true';
      card.style.opacity = '0';
      card.style.pointerEvents = 'none';
      this.gridDirty = true;
      return;
    }
    this.recalculateTotal();
    // A newly uploaded photo is inserted at the current shot so it appears
    // promptly. Reset the clock to that new shot's start; otherwise the old
    // elapsed offset can leave the fresh image visible for only a fraction of
    // a second when it arrives near the end of the previous frame.
    if (shouldStartLiveCard) this.elapsed = this.shotStartAt(insertedAt);
    this.gridDirty = true;
    // Style only the card that was just inserted. Resetting lastLayoutShot
    // forced the whole wall through a reposition pass on every streamed append,
    // which is what made a large story hitch while it was still loading.
    const shot = this.shotIndexAt(this.elapsed);
    const relative = insertedAt - shot;
    card.classList.toggle('is-active', insertedAt === shot);
    card.classList.toggle('is-neighbor', Math.abs(relative) > 0 && Math.abs(relative) <= 2);
    this.applyReelCardVars(reelCard, insertedAt, shot);
    this.render(this.elapsed);
  }

  // Legacy contract marker: private removeMissingMedia(keepIds: Set<string>)
  private removeMissingMedia(keepIds: Set<string>, invalidateIds = new Set<string>()) {
    const activeCard = this.cards[this.shotIndexAt(this.elapsed)];
    const activeId = activeCard?.id || '';
    const activeOffset = activeCard ? this.elapsed - this.shotStartAt(this.shotIndexAt(this.elapsed)) : 0;
    for (const [id, media] of this.loadedMedia) {
      if (keepIds.has(id) && !invalidateIds.has(id)) continue;
      this.fullQualityLiveIds.delete(id);
      const card = this.cards.find(current => current.id === id);
      card?.video?.pause();
      card?.card.remove();
      this.cards = this.cards.filter(current => current.id !== id);
      const source = media.node instanceof HTMLVideoElement ? media.node.currentSrc || media.node.src : media.node.src;
      this.releaseObjectUrl(source);
      this.loadedMedia.delete(id);
      if (!keepIds.has(id)) this.sourceVersions.delete(id);
    }
    this.recalculateTotal();
    if (activeId) {
      const nextIndex = this.cards.findIndex(card => card.id === activeId);
      if (nextIndex >= 0) this.elapsed = Math.min(this.total, this.shotStartAt(nextIndex) + activeOffset);
    }
    this.lastLayoutShot = -1;
    this.renderedCardIndices.clear();
    this.render(this.elapsed);
  }

  /**
   * Rebuilds the cumulative shot timeline. Runs once per card-list change
   * (initial wall, streamed batch, live Drive update) instead of per frame.
   */
  private rebuildShotTimeline() {
    const count = this.cards.length;
    const starts = new Float64Array(count + 1);
    let cursor = 0;
    for (let index = 0; index < count; index += 1) {
      starts[index] = cursor;
      cursor += this.cardHold(this.cards[index]) + this.options.move;
    }
    starts[count] = cursor;
    this.shotStarts = starts;
    this.shotStartsDirty = false;
  }

  private ensureShotTimeline() {
    if (this.shotStartsDirty || this.shotStarts.length !== this.cards.length + 1) this.rebuildShotTimeline();
    return this.shotStarts;
  }

  private shotIndexAt(time: number) {
    const count = this.cards.length;
    if (!count) return 0;
    const starts = this.ensureShotTimeline();
    const clamped = Math.max(0, time);
    // Binary search for the last shot whose start time is <= time. Identical
    // result to the previous linear scan, in O(log n) instead of O(n).
    let low = 0;
    let high = count - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= clamped) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  private shotStartAt(index: number) {
    if (index <= 0) return 0;
    const starts = this.ensureShotTimeline();
    return starts[Math.min(index, this.cards.length)];
  }

  private recalculateTotal() {
    this.total = this.cards.reduce((total, card, index) => (
      total + this.cardHold(card) + (index < this.cards.length - 1 ? this.options.move : 0)
    ), 0) + (this.cards.length ? 2.6 : 0);
    this.elapsed = Math.min(this.elapsed, this.total);
    this.shotStartsDirty = true;
    this.ensureShotTimeline();
  }

  private load(item: ReelSource, requireFullQuality = false): Promise<LoadedMedia | null> {
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
        // A Drive video is fully downloaded before this timer can win, so a
        // slow connection never reveals a half-buffered black video.
        timer = window.setTimeout(() => finishVideoPoster(), item.driveFileId && item.authToken ? 120000 : 8000);
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
        if (item.driveFileId && item.authToken) {
          // Do not reveal a remote Drive stream as the story card. Fetching a
          // complete blob first makes the 7–9 second clip play smoothly on
          // weak mobile data and lets the next visit use IndexedDB directly.
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
        } else if (item.src) {
          video.src = item.src;
          video.load();
        } else {
          finishVideoPoster();
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
          const rotation = normalizeQuarterRotation(item.rotation);
          const isQuarterTurn = rotation === 90 || rotation === 270;
          // Drive supplies the authoritative rotation separately from the
          // bitmap. Disable browser EXIF auto-orientation when we apply that
          // normalized rotation ourselves; otherwise some files are rotated
          // twice and receive the wrong portrait/landscape frame.
          image.style.imageOrientation = rotation ? 'none' : 'from-image';
          finish({ node: image, aspect: isQuarterTurn ? 1 / aspect : aspect, rotation });
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
          if (requireFullQuality && item.driveFileId) {
            // A live addition is not allowed onto the wall as a blank or
            // thumbnail-only card. Keep the current sequence moving while the
            // original downloads, then reveal this card only after it decodes.
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
        } else if (item.driveFileId && item.src) {
            // Paint Drive's lightweight thumbnail immediately. IndexedDB lookup
            // and the sharper cached original must never delay the first frame.
          // Start the Drive thumbnail immediately. A stale auth-required flag
          // must not turn every uncached image into a 12-second timeout.
          if (item.src) {
            image.src = item.src;
          }
          void this.loadAuthenticatedDrivePreview(item)
            .then(result => {
              if (!result.objectUrl) {
                if (readDriveAuthRequired()) finish(null);
                else promoteDriveImage();
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
              if (!result.full) promoteDriveImage();
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
          image.src = item.src;
        }
        // Reveal the thumbnail promptly so a slow original never pauses the
        // camera. The original promotion continues independently and replaces
        // the same image node when it is ready.
        timer = window.setTimeout(() => finish(null), requireFullQuality ? 120000 : 30000);
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
    const validDriveCache = driveCached && (!item.modifiedTime || driveCached.modifiedTime === item.modifiedTime)
      ? driveCached.blob
      : null;
    const cached = validDriveCache || (!item.modifiedTime ? storyCached : null);
    if (cached) {
      const objectUrl = URL.createObjectURL(cached);
      this.objectUrls.add(objectUrl);
      return objectUrl;
    }
    // Do not let a stale auth-required flag from an older request block a new
    // live upload. The current token is authoritative; the Drive downloader
    // will refresh it on a real 401/403 and persist the replacement token.
    if (!item.authToken) return '';
    let result: Awaited<ReturnType<typeof googleDriveService.downloadMediaFileWithReconnect>>;
    try {
      // Focused story cards jump ahead of background folder warming. This is
      // only one original at a time per visible card, so slow connections get
      // a sharp promotion without flooding the compositor or the network.
      result = await withMediaFetch(() => googleDriveService.downloadMediaFileWithReconnect(item.authToken!, item.driveFileId!), undefined, 10);
    } catch (error) {
      if (isDriveAuthorizationError(error)) saveDriveAuthRequired(true);
      throw error;
    }
    if (result.accessToken !== item.authToken) saveDriveAccessToken(result.accessToken);
    const blob = result.blob;
    const objectUrl = URL.createObjectURL(blob);
    this.objectUrls.add(objectUrl);
    // Reveal the sharp original immediately. IndexedDB persistence is useful
    // for the next visit, but must never hold the current frame in a blurry
    // preview while the cache write is finishing.
    if (!cached) {
      void (async () => {
        await writeCachedStoryMedia(cacheKey, blob, item.type === 'video' ? 'video/mp4' : blob.type);
      })();
    }
    return objectUrl;
  }

  private async loadAuthenticatedDrivePreview(item: ReelSource): Promise<{ objectUrl: string; full: boolean }> {
    if (!item.driveFileId) return { objectUrl: '', full: false };
    const [driveCached, storyCached] = await Promise.all([
      readCachedDriveMedia(item.driveFileId),
      readCachedStoryMedia(item.driveFileId),
    ]);
    const validDriveCache = driveCached && (!item.modifiedTime || driveCached.modifiedTime === item.modifiedTime)
      ? driveCached.blob
      : null;
    const cached = validDriveCache || (!item.modifiedTime ? storyCached : null);
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
    this.dustDpr = this.lowPowerSurface ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
    this.dustCanvas.width = Math.round(width * this.dustDpr);
    this.dustCanvas.height = Math.round(height * this.dustDpr);
    this.dustCanvas.style.width = `${width}px`;
    this.dustCanvas.style.height = `${height}px`;
    if (this.dustContext) this.dustContext.setTransform(this.dustDpr, 0, 0, this.dustDpr, 0, 0);
    // The effect layer is soft gradients and dots, so a dense backing store
    // buys nothing visible but costs a lot of per-frame fill on phones.
    const coarsePointer = typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
    this.effectsDpr = this.lowPowerSurface || coarsePointer ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
    this.effectsWidth = width;
    this.effectsHeight = height;
    this.effectsCanvas.width = Math.round(width * this.effectsDpr);
    this.effectsCanvas.height = Math.round(height * this.effectsDpr);
    this.effectsCanvas.style.width = `${width}px`;
    this.effectsCanvas.style.height = `${height}px`;
    if (this.effectsContext) this.effectsContext.setTransform(this.effectsDpr, 0, 0, this.effectsDpr, 0, 0);
    const particleCount = this.lowPowerSurface
      ? 28
      : width < 640 ? 60 : Math.min(96, Math.max(60, Math.round(width / 12)));
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

  setHoldScale(scale: number) {
    const nextScale = clamp(scale, 0.75, 3);
    if (Math.abs(nextScale - this.holdScale) < 0.001) return;

    const activeIndex = this.cards.length ? this.shotIndexAt(this.elapsed) : -1;
    const activeId = activeIndex >= 0 ? this.cards[activeIndex]?.id : undefined;
    const activeOffset = activeIndex >= 0 ? this.elapsed - this.shotStartAt(activeIndex) : 0;
    this.holdScale = nextScale;
    this.recalculateTotal();

    // Keep the currently visible memory in place when the user changes the
    // chip, instead of jumping to a different card in the rebuilt timeline.
    if (activeId) {
      const nextIndex = this.cards.findIndex(card => card.id === activeId);
      if (nextIndex >= 0) {
        const nextStart = this.shotStartAt(nextIndex);
        const nextSpan = this.cardHold(this.cards[nextIndex]) + this.options.move;
        this.elapsed = Math.min(this.total, nextStart + clamp(activeOffset, 0, Math.max(0, nextSpan - 0.02)));
      }
    }
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

  private drawEffectBackdrop(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    colors: [string, string],
    energy: number,
    pulse = 0,
    time = 0,
  ) {
    // This canvas is behind the photo world. The beat response is deliberately
    // a soft bloom/ring rather than a hard white flash, so it is visible on a
    // phone without making the memory playback feel jumpy or distracting.
    const beat = clamp(pulse, 0, 1);
    const alpha = clamp(0.065 + energy * 0.105 + beat * 0.14, 0.065, 0.25);
    const driftX = Math.sin(time * 0.34) * (0.035 + beat * 0.025);
    const driftY = Math.cos(time * 0.27) * (0.025 + beat * 0.02);
    const gradient = context.createRadialGradient(
      width * (0.5 + driftX),
      height * (0.42 + driftY),
      0,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * (0.7 + beat * 0.16),
    );
    gradient.addColorStop(0, colors[0].replace('ALPHA', alpha.toFixed(3)));
    gradient.addColorStop(0.52, colors[1].replace('ALPHA', (alpha * 0.72).toFixed(3)));
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.save();
    context.globalCompositeOperation = 'screen';
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    // A low-frequency pulse makes the beat readable even when the song has a
    // quiet bass line. It expands and fades instead of blinking on/off.
    if (beat > 0.015) {
      const radius = Math.min(width, height) * (0.18 + energy * 0.08 + beat * 0.2);
      const bloom = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, radius * 1.9);
      bloom.addColorStop(0, colors[0].replace('ALPHA', (0.035 + beat * 0.13).toFixed(3)));
      bloom.addColorStop(0.45, colors[1].replace('ALPHA', (0.025 + beat * 0.08).toFixed(3)));
      bloom.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = bloom;
      context.fillRect(0, 0, width, height);
      context.strokeStyle = colors[0].replace('ALPHA', (0.08 + beat * 0.25).toFixed(3));
      context.lineWidth = 1.2 + beat * 2.6;
      context.beginPath();
      context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  private drawEffect(context: CanvasRenderingContext2D, effect: MemoryReelEffect, width: number, height: number, metrics: { level: number; bass: number; mid: number; treble: number; beat: number }, time: number) {
    if (effect === 'off') return;
    const energy = clamp(metrics.level, 0.05, 1);
    const pulse = clamp(metrics.beat * 0.9 + metrics.bass * 0.5, 0, 1);
    const centerX = width / 2;
    const centerY = height / 2;
    const drawDots = (count: number, color: string, size: number, speed: number) => {
      context.fillStyle = color;
      for (let index = 0; index < count; index += 1) {
        const x = ((smoothNoise(time * speed + index * 0.13, index + 3) + 1) * 0.5) * width;
        const y = ((smoothNoise(time * speed * 0.72 + index * 0.19, index + 27) + 1) * 0.5) * height;
        const radius = size * (0.65 + smoothNoise(time * speed * 0.4, index + 81) * 0.25 + pulse * 0.55 + metrics.treble * 0.12);
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
          + pulse * Math.sin(progress * Math.PI * 3) * height * 0.035
          + metrics.mid * Math.sin(progress * Math.PI * 7 + time * 0.7) * height * 0.012;
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
        const outer = radius * (0.86 + pulse * 0.3 + (index % 3) * 0.04);
        context.beginPath();
        context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        context.stroke();
      }
      context.restore();
    };
    switch (effect) {
      case 'natural':
        this.drawEffectBackdrop(context, width, height, ['rgba(255, 194, 113, ALPHA)', 'rgba(42, 66, 93, ALPHA)'], energy, pulse, time);
        drawDots(24, `rgba(255, 224, 162, ${0.22 + energy * 0.28 + pulse * 0.12})`, 2.2, 0.1);
        drawRibbon(`rgba(255, 218, 155, ${0.09 + pulse * 0.14})`, 0.22, 0.055 + metrics.mid * 0.02, 0.28, 2.2);
        break;
      case 'birthday':
        this.drawEffectBackdrop(context, width, height, ['rgba(255, 170, 63, ALPHA)', 'rgba(179, 48, 105, ALPHA)'], energy + pulse * 0.2, pulse, time);
        drawDots(30, `rgba(255, 217, 117, ${0.25 + pulse * 0.48})`, 2.8, 0.2);
        context.strokeStyle = `rgba(255, 205, 123, ${0.3 + pulse * 0.52})`;
        context.lineWidth = 2 + pulse * 1.2;
        for (let index = 0; index < 18; index += 1) {
          const x = ((index * 71 + 17) % 100) / 100 * width;
          const y = ((index * 43 + 29) % 100) / 100 * height;
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x + Math.sin(time * 2 + index) * 7, y + 12 + (index % 4) * 4);
          context.stroke();
        }
        drawBurst(`rgba(255, 230, 167, ${0.1 + pulse * 0.38})`, 18, Math.min(width, height) * 0.34);
        break;
      case 'waves':
        this.drawEffectBackdrop(context, width, height, ['rgba(36, 117, 191, ALPHA)', 'rgba(8, 20, 70, ALPHA)'], energy, pulse, time);
        drawRibbon(`rgba(84, 210, 255, ${0.15 + energy * 0.25 + pulse * 0.1})`, 0.78, 0.06 + metrics.bass * 0.05, 1.1, 2.6);
        drawRibbon(`rgba(206, 143, 255, ${0.1 + metrics.mid * 0.22})`, 0.84, 0.045 + metrics.treble * 0.04, 1.55, 1.7);
        drawRibbon(`rgba(255, 221, 156, ${0.07 + metrics.treble * 0.16})`, 0.9, 0.028 + pulse * 0.02, 1.9, 1.2);
        break;
      case 'cinematic':
        this.drawEffectBackdrop(context, width, height, ['rgba(222, 121, 74, ALPHA)', 'rgba(24, 82, 89, ALPHA)'], energy, pulse, time);
        drawRibbon(`rgba(255, 218, 154, ${0.08 + pulse * 0.18})`, 0.3, 0.035 + metrics.mid * 0.018, 0.45, 3.2);
        drawBurst(`rgba(255, 226, 180, ${0.05 + pulse * 0.18})`, 14, Math.min(width, height) * 0.45);
        drawDots(30, `rgba(255, 244, 210, ${0.05 + metrics.treble * 0.16})`, 1.1, 0.3);
        break;
      case 'stardust':
        this.drawEffectBackdrop(context, width, height, ['rgba(50, 77, 164, ALPHA)', 'rgba(4, 10, 43, ALPHA)'], energy, pulse, time);
        drawDots(50, `rgba(170, 202, 255, ${0.2 + metrics.treble * 0.36 + pulse * 0.1})`, 1.5, 0.08);
        drawBurst(`rgba(194, 218, 255, ${0.05 + pulse * 0.2})`, 24, Math.min(width, height) * 0.4);
        break;
      case 'neon':
        this.drawEffectBackdrop(context, width, height, ['rgba(205, 28, 213, ALPHA)', 'rgba(18, 4, 50, ALPHA)'], energy + pulse * 0.18, pulse, time);
        drawDots(16, `rgba(255, 66, 224, ${0.2 + pulse * 0.38})`, 2.2, 0.24);
        drawBurst(`rgba(84, 239, 255, ${0.06 + pulse * 0.24})`, 16, Math.min(width, height) * 0.3);
        break;
      case 'aurora':
        this.drawEffectBackdrop(context, width, height, ['rgba(48, 188, 139, ALPHA)', 'rgba(71, 34, 127, ALPHA)'], energy, pulse, time);
        context.lineWidth = Math.max(18, height * (0.06 + pulse * 0.012));
        context.lineCap = 'round';
        context.strokeStyle = `rgba(89, 244, 175, ${0.1 + energy * 0.2 + pulse * 0.12})`;
        for (let index = 0; index < 3; index += 1) {
          context.beginPath();
          context.moveTo(-width * 0.1, height * (0.25 + index * 0.12));
          context.quadraticCurveTo(centerX, height * (0.05 + Math.sin(time * 0.4 + index) * 0.12 + index * 0.1), width * 1.1, height * (0.34 + index * 0.1));
          context.stroke();
        }
        break;
      case 'prism':
        this.drawEffectBackdrop(context, width, height, ['rgba(89, 103, 226, ALPHA)', 'rgba(111, 35, 120, ALPHA)'], energy, pulse, time);
        for (let index = 0; index < 5; index += 1) {
          context.strokeStyle = `hsla(${(index * 62 + time * 28) % 360}, 90%, 70%, ${0.08 + pulse * 0.18})`;
          context.lineWidth = 4 + pulse * 1.5;
          context.beginPath();
          context.arc(centerX, centerY, Math.min(width, height) * (0.25 + index * 0.09 + pulse * 0.045), 0, Math.PI * 2);
          context.stroke();
        }
        break;
      case 'ember':
        this.drawEffectBackdrop(context, width, height, ['rgba(241, 96, 33, ALPHA)', 'rgba(68, 8, 12, ALPHA)'], energy, pulse, time);
        drawDots(34, `rgba(255, 153, 63, ${0.18 + metrics.bass * 0.34 + pulse * 0.12})`, 2.4, 0.11);
        drawBurst(`rgba(255, 211, 128, ${0.04 + pulse * 0.16})`, 12, Math.min(width, height) * 0.32);
        break;
      case 'ocean':
        this.drawEffectBackdrop(context, width, height, ['rgba(19, 153, 178, ALPHA)', 'rgba(5, 27, 69, ALPHA)'], energy, pulse, time);
        context.strokeStyle = `rgba(93, 226, 225, ${0.12 + energy * 0.24 + pulse * 0.1})`;
        context.lineWidth = 3 + pulse * 1.3;
        for (let index = 0; index < 3; index += 1) {
          context.beginPath();
          for (let x = 0; x <= width; x += 14) {
            const y = height * (0.76 + index * 0.06) + Math.sin(x * 0.014 + time * (0.7 + index * 0.22)) * (10 + energy * 12 + pulse * 14);
            if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
          }
          context.stroke();
        }
        drawDots(20, `rgba(151, 245, 237, ${0.12 + metrics.treble * 0.24 + pulse * 0.08})`, 2, 0.09);
        break;
      case 'rose':
        this.drawEffectBackdrop(context, width, height, ['rgba(249, 159, 180, ALPHA)', 'rgba(91, 31, 78, ALPHA)'], energy, pulse, time);
        context.fillStyle = `rgba(255, 201, 178, ${0.08 + pulse * 0.17})`;
        context.beginPath();
        context.arc(centerX, centerY, Math.min(width, height) * (0.28 + pulse * 0.08), 0, Math.PI * 2);
        context.fill();
        break;
      case 'galaxy':
        this.drawEffectBackdrop(context, width, height, ['rgba(78, 54, 182, ALPHA)', 'rgba(8, 10, 41, ALPHA)'], energy, pulse, time);
        drawDots(58, `rgba(212, 190, 255, ${0.14 + metrics.treble * 0.34 + pulse * 0.08})`, 1.4, 0.06);
        drawBurst(`rgba(230, 220, 255, ${0.04 + pulse * 0.14})`, 20, Math.min(width, height) * 0.36);
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

  /**
   * Keeps the animation smooth on low-RAM devices. If a paint is consistently
   * expensive, the loop paints less often instead of stalling mid-motion.
   * Nothing is removed and no motion term changes - the camera path is a pure
   * function of elapsed time, so the story looks the same, just calmer.
   */
  private trackPaintCost(cost: number, now: number) {
    // Desktop browsers have enough compositor headroom to keep sampling the
    // continuous camera path at the display rate. Artificially switching a
    // PC between 60/45/30fps made an otherwise short render spike feel like
    // a visible pause. Adaptive sampling remains enabled for the constrained
    // phone/TV path only.
    if (!this.lowPowerSurface && !this.options.legacyTv) return;
    // Ignore absurd samples (tab wake, devtools open, GC pause).
    const sample = Math.min(cost, 120);
    this.paintCostEma = this.paintCostEma ? this.paintCostEma * 0.88 + sample * 0.12 : sample;
    if (now - this.adaptivePaintedAt < 1200) return;
    this.adaptivePaintedAt = now;
    const budget = this.paintCostEma;
    if (budget > 26) this.adaptivePaintInterval = 1000 / 30;
    else if (budget > 16) this.adaptivePaintInterval = 1000 / 45;
    else this.adaptivePaintInterval = 0;
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
        if (this.pendingSources.length) {
          // Never finish or loop the visible subset while the rest of a large
          // Drive folder is still queued. Hold the last loaded frame while a
          // background batch arrives, then continue with the newly extended
          // timeline. This guarantees a 300+ photo folder is not truncated.
          if (!this.loadingNextBatch) void this.loadNextBatch();
          this.elapsed = Math.max(0, this.total - 0.01);
        } else if (this.options.loop) {
          // Wrap the visual timeline explicitly at the boundary. Rendering
          // frame zero here prevents the last frame from lingering for one
          // more paint and keeps the next loop in sync with the first card.
          this.elapsed = 0;
          this.titleEl.classList.remove('on');
          this.lastLayoutShot = -1;
          this.render(0);
        }
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
      // Pull in the next story batch before the current one runs out.
      if (this.pendingSources.length
        && !this.loadingNextBatch
        && this.shotIndexAt(this.elapsed) > this.cards.length - WALL_PRELOAD_AHEAD) {
        void this.loadNextBatch();
      }
      const paintInterval = this.options.legacyTv
        ? 1000 / 30
        : this.lowPowerSurface ? Math.max(this.adaptivePaintInterval, 0) : 0;
      if (!paintInterval || now - this.lastPaint >= paintInterval) {
        const paintStartedAt = performance.now();
        this.render(this.elapsed);
        this.trackPaintCost(performance.now() - paintStartedAt, now);
        this.lastPaint = now;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause() {
    this.pauseRevision += 1;
    this.paused = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.poster.classList.remove('off');
    this.cards.forEach(card => card.video?.pause());
    this.pauseAudio();
    this.options.onStateChange?.(false);
    // Pausing the presentation must not pause the background media queue.
    // Explicitly kick the next bounded batch because there may be no active
    // animation frame after a user pause.
    this.schedulePrefetch(0);
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
    // If the story was stopped at its end, enabling Loop should put the
    // timeline back at the first card. Keep it paused so Loop never bypasses
    // the explicit Start/Play gesture.
    if (loop && this.cards.length && this.elapsed >= this.total) {
      this.elapsed = 0;
      this.titleEl.classList.remove('on');
      this.lastLayoutShot = -1;
      this.render(0);
    }
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
    if (this.onlineHandler) window.removeEventListener('online', this.onlineHandler);
    void this.audioContext?.close().catch(() => undefined);
    this.audioContext = undefined;
    this.audio = undefined;
    this.analysisAudio = undefined;
    this.effectsContext?.clearRect(0, 0, this.effectsWidth, this.effectsHeight);
    this.world.innerHTML = '';
    this.cards = [];
    this.loadedMedia.clear();
    this.sourceCatalog.clear();
    this.sourceVersions.clear();
    this.pendingSources = [];
    this.inFlightSources.clear();
    this.loadingNextBatch = false;
    this.clearPrefetchTimer();
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
    const baseHold = Math.max(4, this.options.template === 'orbit' ? 4 : 3.6);
    if (card.video) {
      const duration = Number.isFinite(card.video.duration) && card.video.duration > 0
        ? card.video.duration
        : 8;
      return clamp(duration, 7, 9);
    }
    return baseHold * this.holdScale;
  }

  private estimateTotal(items: ReelSource[]) {
    const baseHold = Math.max(4, this.options.template === 'orbit' ? 4 : 3.6);
    return items.reduce((total, item, index) => (
      total
      + (item.type === 'video' ? 8 : baseHold * this.holdScale)
      + (index < items.length - 1 ? this.options.move : 0)
    ), 0) + (items.length ? 2.6 : 0);
  }

  private applyReelCardVars(card: ReelCard, index: number, shot: number) {
    const relative = index - shot;
    card.card.style.setProperty('--reel-index', String(index));
    card.card.style.setProperty('--reel-offset', `${relative * 34}vw`);
    card.card.style.setProperty('--reel-angle', `${((index % 5) - 2) * 3}deg`);
    card.card.style.setProperty('--reel-depth', `${Math.min(Math.abs(relative) * 18, 120)}px`);
    card.card.style.setProperty('--reel-collage-x', `${relative * 30}vw`);
    card.card.style.setProperty('--reel-collage-y', `${relative % 2 === 0 ? 11 : -8}vh`);
    card.card.style.setProperty('--reel-collage-rotate', `${relative * 5}deg`);
    card.varsShot = shot;
  }

  /**
   * A card is worth styling when it is mounted, not hidden by the cull pass,
   * and close enough to the camera to be painted this frame.
   */
  private isCardVisible(card: ReelCard, index: number) {
    if (card.card.parentElement !== this.world) return false;
    if (card.card.dataset.reelHidden === 'true') return false;
    // Before the first visibility pass the grid has not run yet, so every
    // mounted card gets styled once (that is the original behaviour).
    if (!this.candidateMaskActive) return true;
    return this.candidateMask[index] === 1
      || index === this.cachedFocusedIndex
      || index === this.lastRenderedShot;
  }

  private render(time: number) {
    this.paintCount += 1;
    const { move } = this.options;
    const count = this.cards.length;
    if (!count) return;
    const audioMetrics = this.readAudioMetrics(time);
    const audioLevel = audioMetrics.level;
    // The effect layer is slow, soft motion. Redrawing it at most 30 times a
    // second halves full-screen canvas fill on phones with no visible change,
    // while the cards above it keep painting every frame.
    const effectsNow = performance.now();
    if (effectsNow - this.lastEffectsPaintAt >= 1000 / 30
      && (!this.lowPowerSurface || effectsNow - this.lastEffectsPaintAt >= 1000 / 20)) {
      this.lastEffectsPaintAt = effectsNow;
      this.renderEffects(audioMetrics, time);
    }
    if (!this.options.legacyTv && this.options.template !== 'orbit') {
      // Writing the same string still invalidates style, so compare first.
      const ambientOpacity = (0.68 + audioLevel * 0.16).toFixed(3);
      if (ambientOpacity !== this.lastAmbientOpacity) {
        this.lastAmbientOpacity = ambientOpacity;
        this.ambient.style.opacity = ambientOpacity;
      }
    }
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

    // The cumulative timeline is rebuilt only when the card list changes, so
    // use its binary search here instead of walking every card on every frame.
    // This is the other large-library hitch: 1000 cards meant 1000 additions
    // per animation frame before this path was indexed.
    let shot = this.shotIndexAt(time);
    const local = Math.max(0, time - this.shotStartAt(shot));
    const shotHold = this.cardHold(this.cards[shot]);
    let from = this.target(shot);
    let to = from;
    let progress = 1;
    let dip = 0;
    let holdProgress = 0;
    if (this.lastLayoutShot !== shot) {
      this.lastLayoutShot = shot;
      this.el.style.setProperty('--reel-active', String(shot));
      // Hidden orbit cards are removed or opacity-zero, so their active and
      // neighbour classes do not need to be touched at every shot boundary.
      // Keep the full pass only for the legacy/reduced-motion paths that
      // intentionally style every card.
      const layoutIndices = this.options.legacyTv || this.options.reducedMotion
        ? new Set(this.cards.map((_, index) => index))
        : new Set([...this.renderedCardIndices, shot]);
      layoutIndices.forEach(index => {
        const card = this.cards[index];
        if (!card) return;
        const relative = index - shot;
        card.card.classList.toggle('is-active', index === shot);
        card.card.classList.toggle('is-neighbor', Math.abs(relative) > 0 && Math.abs(relative) <= 2);
        // Only the cards that can actually be seen need their position
        // variables. Writing eight properties on all 1000 cards at once made
        // every shot change hitch; hidden cards get their values when they are
        // revealed (see applyReelCardVars).
        if (this.isCardVisible(card, index)) this.applyReelCardVars(card, index, shot);
      });
      // z-index already controls the focused card's stacking order. Reparenting
      // it on every shot boundary forced a synchronous style/layout pass and
      // was the visible hitch at the start and end of each flight.
      const activeCard = this.cards[shot]?.card;
      void activeCard;
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
      const focusedMedia = this.cards[shot]?.media;
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
        // The eased target is already continuous: at the end of a flight it
        // equals the next card's target exactly. A spring adds a second clock
        // driven by frame timing, so a delayed frame can leave the camera
        // chasing the shot and make the beginning/end feel sticky or shaky.
        camera = springTarget;
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
      // Distance work is restricted to the cards near the camera. The old
      // version measured every card in the library, allocated a 1000 element
      // array of objects and sorted it, several times per second - that was the
      // stutter felt on large Drive libraries. The spatial grid keeps the exact
      // same visible set while measuring only a few dozen cards.
      const now = performance.now();
      const cameraMoved = Math.abs(camera.x - this.lastCameraX) > 2 || Math.abs(camera.y - this.lastCameraY) > 2;
      const stale = now - this.lastDistanceComputeAt > 200 || cameraMoved || this.lastLayoutShot !== shot;
      const renderRadius = this.options.template === 'orbit'
        ? 1120
        : this.clarity === 'natural' ? 1700 : 1450;
      const orbitVisibleLimit = this.cards.length <= 96 ? this.cards.length : 64;
      this.lastRenderRadius = renderRadius;
      let focusedIndex: number;
      let nearestOrbitCards: Set<number> | undefined;
      let distances: Float64Array;
      if (stale) {
        this.clearCandidates();
        // Orbit culls to the nearest N cards; every other template culls by
        // radius. Both search outward from the camera only.
        this.collectWithin(camera.x, camera.y, renderRadius, this.options.template === 'orbit' ? orbitVisibleLimit : 1);
        let nearest = -1;
        let nearestDistance = Infinity;
        for (const index of this.candidates) {
          const distance = this.distanceByCard[index];
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = index;
          }
        }
        focusedIndex = nearest >= 0 ? nearest : 0;
        if (this.options.template === 'orbit') {
          const pool = this.candidates;
          this.candidateDistances.length = 0;
          const sorted = new Float64Array(pool.length);
          for (let position = 0; position < pool.length; position += 1) sorted[position] = this.distanceByCard[pool[position]];
          // Native numeric sort on a typed array: no object allocation, no
          // comparator callback, no garbage for the collector to sweep.
          sorted.sort();
          const threshold = sorted[Math.min(sorted.length - 1, orbitVisibleLimit - 1)];
          nearestOrbitCards = new Set<number>();
          for (const index of pool) {
            if (this.distanceByCard[index] <= threshold) nearestOrbitCards.add(index);
            if (nearestOrbitCards.size >= orbitVisibleLimit) break;
          }
          this.cachedNearestOrbitCards = nearestOrbitCards;
        } else {
          this.cachedNearestOrbitCards = undefined;
        }
        this.lastCameraX = camera.x;
        this.lastCameraY = camera.y;
        this.lastDistanceComputeAt = now;
        this.cachedFocusedIndex = focusedIndex;
        distances = this.distanceByCard;
      } else {
        focusedIndex = this.cachedFocusedIndex;
        nearestOrbitCards = this.cachedNearestOrbitCards;
        distances = this.distanceByCard;
      }
      // Only cards in this small visible set receive compositor/style work.
      // The previous implementation still visited every loaded card here,
      // which made a 300-1000 photo Drive folder feel like it was hanging.
      const visibleIndices = isGridTemplate(this.options.template)
        ? this.getAllCardIndices()
        : new Set<number>(nearestOrbitCards || this.candidates);
      visibleIndices.add(shot);
      visibleIndices.add(focusedIndex);
      this.renderedCardIndices.forEach(index => {
        if (visibleIndices.has(index)) return;
        const card = this.cards[index];
        if (!card) return;
        if (this.options.template === 'orbit') {
          card.card.remove();
        } else if (card.card.dataset.reelHidden !== 'true') {
          card.card.dataset.reelHidden = 'true';
          card.card.style.opacity = '0';
          card.card.style.filter = 'none';
          // Values on a hidden card are no longer authoritative.
          card.lastOpacity = undefined;
          card.lastFilter = undefined;
        }
        if (card.video && !card.video.paused) card.video.pause();
      });
      this.renderedCardIndices = visibleIndices;
      visibleIndices.forEach(index => {
        const card = this.cards[index];
        if (!card) return;
        const isActive = index === shot;
        // Cards the grid never collected are outside the search radius.
        const distance = this.candidateMask[index] ? distances[index] : Infinity;
        if (this.options.template === 'orbit' && card.card.parentElement !== this.world) this.world.appendChild(card.card);
        // Restore the position variables for a card that was culled (or not
        // yet visible) during the shot-change pass. One integer compare per
        // painted card keeps this free on every other frame.
        if (card.varsShot !== shot) this.applyReelCardVars(card, index, shot);
        delete card.card.dataset.reelHidden;
        card.card.style.pointerEvents = '';
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
         // Make Zoom On visibly active while staying inside the fitted card
         // bounds. The previous two-percent change was effectively invisible
         // on large screens and phones.
         const zoomScale = zoomProgress * 0.07;
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
          ? fitScale * (0.95 + zoomProgress * 0.08) * (1 - dip * 0.08)
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
        const nextTransform = `translate3d(${(card.x - card.width / 2 + driftX).toFixed(1)}px,${(card.y - card.height / 2 + driftY).toFixed(1)}px,${(card.z + driftZ + cinematicDepthBias).toFixed(1)}px) rotateX(${isActive && orbitCamera ? 0 : (stabilizedDriftRotate * 0.5).toFixed(2)}deg) rotateY(${cardRotateY.toFixed(2)}deg) rotateZ(${cardRotateZ.toFixed(2)}deg) scale(${cinematicScale.toFixed(4)})`;
        if (nextTransform !== card.lastTransform) {
          card.lastTransform = nextTransform;
          card.card.style.transform = nextTransform;
        }
        const nextOpacity = this.options.legacyTv && distance > 900 ? '0.72' : '1';
        if (nextOpacity !== card.lastOpacity) {
          card.lastOpacity = nextOpacity;
          card.card.style.opacity = nextOpacity;
        }
        const nextZIndex = isActive ? '50' : index === focusedIndex ? '8' : '1';
        if (nextZIndex !== card.lastZIndex) {
          card.lastZIndex = nextZIndex;
          card.card.style.zIndex = nextZIndex;
        }
        if (isActive) {
          if (card.lastFilter !== 'none') {
            card.lastFilter = 'none';
            card.card.style.setProperty('filter', 'none', 'important');
          }
          const activeMedia = card.media;
          const activeImageFilter = clarityImageFilter(this.clarity);
          if (activeMedia && card.lastImageFilter !== activeImageFilter) {
            card.lastImageFilter = activeImageFilter;
            activeMedia.style.setProperty('filter', activeImageFilter, 'important');
          }
          const activeImageRendering = clarityImageRendering(this.clarity);
          if (activeMedia && card.lastImageRendering !== activeImageRendering) {
            card.lastImageRendering = activeImageRendering;
            activeMedia.style.setProperty('image-rendering', activeImageRendering);
          }
        } else {
          const inactiveMedia = card.media;
          if (inactiveMedia && card.lastImageFilter !== undefined) {
            card.lastImageFilter = undefined;
            inactiveMedia.style.removeProperty('filter');
          }
          // Quantise to half-pixel steps. Blur values differ by well under a
          // pixel at these radii, but every distinct string forces the browser
          // to re-rasterise that layer, so coarser steps cut the work without
          // any visible change.
          const rawBlur = this.options.template === 'orbit'
            ? Math.max(0.25, Math.min(0.55, blur))
            : Math.max(0.35, Math.min(1.2, blur));
          const readableBlur = Math.round(rawBlur * 2) / 2;
          const nextFilter = readableBlur > 0.15
            ? `blur(${readableBlur.toFixed(1)}px) brightness(${this.options.template === 'orbit' ? '.96' : '.92'})`
            : 'brightness(.96)';
          if (nextFilter !== card.lastFilter) {
            card.lastFilter = nextFilter;
            card.card.style.setProperty('filter', nextFilter, 'important');
          }
        }
        if (card.video) {
          const active = near && !this.paused;
          if (active && card.video.paused) this.playMutedVideo(card.video);
          else if (!active && !card.video.paused) card.video.pause();
        }
      });
      const focusedMedia = this.cards[focusedIndex]?.media;
      const ambientSource = focusedMedia?.currentSrc || focusedMedia?.getAttribute('src') || '';
      const heroCard = this.cards[shot]?.card;
      const heroMedia = heroCard?.media;
      const heroSource = heroMedia?.currentSrc || heroMedia?.getAttribute('src') || '';
      if (heroCard && heroSource) {
        const heroImage = `url("${heroSource.replace(/"/g, '\\"')}")`;
        if (heroImage !== this.lastHeroImage || heroCard !== this.lastHeroCard) {
          this.lastHeroCard = heroCard;
          this.lastHeroImage = heroImage;
          heroCard.style.setProperty('--hero-image', heroImage);
          this.el.style.setProperty('--hero-image', heroImage);
        }
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
    // Lightweight, throttled diagnostics on the stage element. It costs one
    // string compare per frame and makes "is the story still playing at the
    // same shot" verifiable from the DOM (used by the performance tests).
    const diagnostic = `${Math.round(time)}/${Math.round(this.total)}/${shot}/${this.paused ? 'paused' : 'playing'}/${this.cards.length}/${this.wallRebuilds}/${this.paintCostEma.toFixed(2)}/${Math.round(this.adaptivePaintInterval)}/${this.paintCount}`;
    if (diagnostic !== this.lastDiagnostic) {
      this.lastDiagnostic = diagnostic;
      this.el.setAttribute('data-reel-state', diagnostic);
    }
    this.options.onProgress?.(time, Math.max(this.total, this.expectedTotal));
  }
}

const isVideoMemory = (memory: Memory) => memory.type === 'video' || Boolean(memory.mimeType?.startsWith('video/'));

const resolveReelSources = async (memories: Memory[], signal: AbortSignal, driveAccessToken?: string) => {
  const sources = memories.flatMap(memory => {
    const video = isVideoMemory(memory);
    const driveBacked = Boolean(memory.driveFileId);
    // A just-captured photo is temporarily backed by a local blob URL. Prefer
    // it over Drive's thumbnail/original URL so the live reel can show the
    // full camera frame immediately while Drive sync catches up.
    const localMediaUrl = [memory.url, memory.thumbnail].find(url => url?.startsWith('blob:')) || '';
    const driveOriginalUrl = driveBacked && driveAccessToken
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(memory.driveFileId!)}?alt=media&access_token=${encodeURIComponent(driveAccessToken)}`
      : driveBacked ? memory.url : '';
    const driveMediaUrl = localMediaUrl || driveOriginalUrl || memory.url;
    // Drive thumbnails are safe, fast first paint. Originals are fetched by
    // the controller after the thumbnail is visible.
    const preview = video ? driveMediaUrl || memory.thumbnail : memory.thumbnail || driveMediaUrl;
    const fallbackSrc = driveBacked && driveOriginalUrl && driveOriginalUrl !== preview
      ? driveOriginalUrl
      : (!video && driveMediaUrl && driveMediaUrl !== preview ? driveMediaUrl : undefined);
    if (!preview && !driveBacked) return [];
    return [{
      id: memory.id,
      src: preview,
      fallbackSrc,
      driveFileId: memory.driveFileId,
      authToken: driveAccessToken || memory.authToken,
      modifiedTime: memory.modifiedTime,
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
const STORY_TIMING_STORAGE_KEY = 'memoriya-story-timing-v1';
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
      currentTime: Math.max(0, value.currentTime ?? 0),
      wasPlaying: Boolean(value.wasPlaying),
      updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt! : Date.now(),
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
      driveSongs: Array.isArray(value.driveSongs) ? value.driveSongs.filter(isAudioDriveFile) : [],
      secondaryDriveSongs: Array.isArray(value.secondaryDriveSongs) ? value.secondaryDriveSongs.filter(isAudioDriveFile) : [],
      driveSongsLoaded: Boolean(value.driveSongsLoaded),
      driveFolderId: value.driveFolderId || driveFolderId,
      musicFolderId: value.musicFolderId || '',
      queue: Array.isArray(value.queue) ? value.queue.filter(track => {
        if (!track || !track.id || !track.label) return false;
        if (track.source !== 'drive' || !track.driveFileId) return true;
        const songs = [
          ...(Array.isArray(value.driveSongs) ? value.driveSongs.filter(isAudioDriveFile) : []),
          ...(Array.isArray(value.secondaryDriveSongs) ? value.secondaryDriveSongs.filter(isAudioDriveFile) : []),
        ];
        return songs.some(song => song.id === track.driveFileId);
      }) : [],
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

const readStoredStoryTiming = (fallback: MemoryReelTiming): MemoryReelTiming => {
  try {
    const stored = window.localStorage.getItem(STORY_TIMING_STORAGE_KEY) as MemoryReelTiming | null;
    return stored && MEMORY_REEL_TIMINGS.some(item => item.id === stored) ? stored : fallback;
  } catch {
    return fallback;
  }
};

const storyTimingScale = (timing: MemoryReelTiming) =>
  MEMORY_REEL_TIMINGS.find(item => item.id === timing)?.scale || 1;

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

const formatStoryTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};

const readAudioDuration = (source: string | Blob) => new Promise<number | null>(resolve => {
  const temporaryUrl = source instanceof Blob ? URL.createObjectURL(source) : '';
  const url = temporaryUrl || source;
  const audio = document.createElement('audio');
  let settled = false;
  const finish = (duration: number | null) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeoutId);
    audio.removeAttribute('src');
    audio.load();
    if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
    resolve(duration);
  };
  const timeoutId = window.setTimeout(() => finish(null), 8000);
  audio.preload = 'metadata';
  audio.onloadedmetadata = () => {
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
    finish(duration);
  };
  audio.onerror = () => finish(null);
  audio.src = url;
  audio.load();
});

const formatMusicMinutes = (seconds: number) => `${(Math.max(0, seconds) / 60).toFixed(1)} minutes`;

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

const MemoryReel: React.FC<MemoryReelProps> = ({ memories, title, audio, template: initialTemplate = 'orbit', autoPlay = false, loop = true, hasMore = false, loadingMore = false, onNeedMore, driveAccessToken, driveFolderId, driveFolders, onDriveFolderChange, onDriveReconnect, onClose }) => {
  const visualMemories = useMemo(() => memories.filter(isVisualMemory), [memories]);
  const storyPhotoCount = useMemo(
    () => visualMemories.filter(memory => !isVideoMemory(memory)).length,
    [visualMemories],
  );
  const storyVideoCount = useMemo(
    () => visualMemories.filter(isVideoMemory).length,
    [visualMemories],
  );
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
  const [musicTotalDuration, setMusicTotalDuration] = useState<number | null>(null);
  const [progress, setProgress] = useState({ progress: 0, total: 0 });
  const [storyLoadedCount, setStoryLoadedCount] = useState(0);
  const [storyAvailableCount, setStoryAvailableCount] = useState(visualMemories.length);
  const [fullscreen, setFullscreen] = useState(shouldStartCinemaView);
  const [fullscreenControlsVisible, setFullscreenControlsVisible] = useState(true);
  const [titleDraft, setTitleDraft] = useState<MemoryReelTitle>({ line: storedStoryTitle?.line || '', big: storedStoryTitle?.big || '' });
  const [activeTitle, setActiveTitle] = useState<MemoryReelTitle | undefined>(storedStoryTitle);
  const [musicOpen, setMusicOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [clarityOpen, setClarityOpen] = useState(false);
  const [castOpen, setCastOpen] = useState(false);
  const [template, setTemplate] = useState<MemoryReelTemplate>(() => readStoredStoryTemplate(initialTemplate));
  const [effect, setEffect] = useState<MemoryReelEffect>(() => readStoredStoryEffect('natural'));
  const [clarity, setClarity] = useState<MemoryReelClarity>(() => readStoredStoryClarity('clear'));
  const [zoomEnabled, setZoomEnabled] = useState(() => readStoredStoryZoom(true));
  const [timing, setTiming] = useState<MemoryReelTiming>(() => readStoredStoryTiming('quick'));
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
  const [driveCacheProgress, setDriveCacheProgress] = useState({ completed: 0, failed: 0, total: 0 });
  const [driveCacheFailures, setDriveCacheFailures] = useState<Array<{ id: string; label: string; reason: string }>>([]);
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
  const androidTvMode = useMemo(isAndroidTvBrowser, []);
  const moreRequestedRef = useRef(false);
  const hasLoadedSourcesRef = useRef(false);
  const sourceSignatureRef = useRef('');
  const moreConfigRef = useRef({ hasMore, loadingMore, onNeedMore });
  const fullscreenControlsTimerRef = useRef<number | null>(null);
  const driveSongsRequestRef = useRef(false);
  const secondaryDriveSongsRequestRef = useRef(false);
  const driveMusicFolderRef = useRef(storedStoryMusic?.musicFolderId || '');
  const audioManuallyStoppedRef = useRef(false);
  const musicAdvanceInFlightRef = useRef(false);
  const failedMusicIdsRef = useRef(new Set<string>());
  const audioRecoveryRef = useRef(new Set<string>());
  const storedMusicPlaybackRef = useRef<StoredMusicPlayback | null>(readStoredMusicPlayback());
  const pendingMusicResumeRef = useRef<{ trackId: string; currentTime: number } | null>(null);
  const playbackPersistTimerRef = useRef<number | null>(null);
  const autoResumeRequestedRef = useRef(false);
  musicQueueRef.current = musicQueue;
  loopEnabledRef.current = loopEnabled;
  const audioPauseGuardRef = useRef(false);
  const musicHydratedRef = useRef(false);
  const screenHiddenRef = useRef(false);
  const driveCacheTasksRef = useRef(new Map<string, Promise<boolean>>());
  const driveCacheFailuresRef = useRef(new Map<string, { id: string; label: string; reason: string }>());
  const driveCacheProgressKeyRef = useRef('');
  // The reel's decoded-card count is bounded for smooth playback, while
  // Drive keeps warming every original in the background. Keep that cache
  // count as a floor so the folder counter reflects offline-ready files even
  // when their cards are not on the visible wall yet.
  const storyCachedPhotoCountRef = useRef(0);
  const storyProgressValueRef = useRef(0);
  const storyProgressPublishTimerRef = useRef<number | null>(null);
  const publishStoryLoadedCount = (value: number) => {
    // Keep the visible counter bounded by the current Drive snapshot. This
    // prevents an old count from surviving a deletion while still allowing
    // photo-cache and reel-card progress to contribute to the same total.
    storyProgressValueRef.current = Math.min(
      visualMemories.length,
      Math.max(storyProgressValueRef.current, Math.max(0, value)),
    );
    if (storyProgressPublishTimerRef.current !== null) return;
    storyProgressPublishTimerRef.current = window.setTimeout(() => {
      storyProgressPublishTimerRef.current = null;
      setStoryLoadedCount(() => storyProgressValueRef.current);
    }, 120);
  };
  // All Drive audio downloads/conversions share one chain. This keeps a
  // refresh, a newly selected song, and the initial folder load from starting
  // separate FFmpeg jobs at the same time on a phone or TV.
  const driveAudioSerialRef = useRef<Promise<boolean | void>>(Promise.resolve());
  const driveCacheWarmBatchRef = useRef<Promise<void>>(Promise.resolve());
  moreConfigRef.current = { hasMore, loadingMore, onNeedMore };
  const allDriveSongs = useMemo(
    () => [...driveSongs, ...secondaryDriveSongs].filter(isAudioDriveFile),
    [driveSongs, secondaryDriveSongs],
  );

  useEffect(() => {
    let active = true;
    setMusicTotalDuration(null);
    const calculateTotalDuration = async () => {
      if (!musicQueue.length) return;
      // The duration is reported only after the serial Drive cache chain has
      // finished, so it represents songs that are actually playable offline.
      if (allDriveSongs.length) await driveCacheWarmBatchRef.current.catch(() => undefined);
      if (!active) return;
      const durations = await Promise.all(musicQueue.map(async track => {
        let source: string | Blob = track.src;
        if (track.source === 'drive') {
          const cached = track.cacheKey ? await readCachedStoryMedia(track.cacheKey) : null;
          if (!cached) return null;
          source = cached;
        }
        return readAudioDuration(source);
      }));
      if (!active || durations.some(duration => duration === null)) return;
      setMusicTotalDuration(durations.reduce((total, duration) => total + (duration || 0), 0));
    };
    void calculateTotalDuration();
    return () => { active = false; };
  }, [allDriveSongs.length, driveCacheProgress.completed, driveCacheProgress.failed, driveCacheProgress.total, musicQueue]);

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
    // Only old TV WebViews need the document locked: they forward remote
    // wheel/trackpad events through the fixed overlay to the page behind it.
    // On phones and desktop the lock is what made Story Mode feel unscrollable
    // - locking <html> and <body> together stops or badly breaks scrolling of
    // the overlay's own content in mobile Safari and Android Chrome, and the
    // fixed overlay already hides the page underneath.
    if (!legacyTvMode) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [legacyTvMode]);

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
          // Keep uncached Drive entries in the queue too. They can finish
          // downloading when the connection returns instead of disappearing
          // from the playlist during a temporary offline period.
          if ((!blob && !directDriveSource && !savedTrack.driveFileId) || !active) return null;
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
    memory.modifiedTime || '',
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
    storyCachedPhotoCountRef.current = 0;
    if (storyProgressPublishTimerRef.current !== null) {
      window.clearTimeout(storyProgressPublishTimerRef.current);
      storyProgressPublishTimerRef.current = null;
    }
    setStoryAvailableCount(visualMemories.length);
    if (!liveUpdate) {
      storyProgressValueRef.current = 0;
      setStoryLoadedCount(0);
    } else {
      storyProgressValueRef.current = Math.min(storyProgressValueRef.current, visualMemories.length);
      setStoryLoadedCount(current => Math.min(current, visualMemories.length));
    }
    const drivePhotoFiles = photos
      .filter(memory => memory.driveFileId)
      .map(memory => ({
        id: memory.driveFileId as string,
        name: memory.title,
        mimeType: memory.mimeType || 'image/jpeg',
        thumbnailUrl: memory.thumbnail || '',
        createdTime: memory.date,
        modifiedTime: memory.modifiedTime,
      }));
    // The photo originals are warmed completely before the video phase. The
    // story can still show its first photo immediately, while the next phase
    // waits for every Drive image and queued song to become locally playable.
    const photoCachePromise = driveAccessToken && drivePhotoFiles.length
      ? cacheDriveMediaFiles(drivePhotoFiles, driveAccessToken, {
        includeVideos: false,
        limit: drivePhotoFiles.length,
        onProgress: cacheProgress => {
          if (controller.signal.aborted) return;
          const localPhotoCount = photos.length - drivePhotoFiles.length;
          const cachedPhotoCount = Math.min(
            photos.length,
            localPhotoCount + cacheProgress.completed,
          );
          storyCachedPhotoCountRef.current = Math.max(
            storyCachedPhotoCountRef.current,
            cachedPhotoCount,
          );
          publishStoryLoadedCount(storyCachedPhotoCountRef.current);
        },
      }).catch(() => undefined)
      : Promise.resolve();
    // Keep the current wall visible during a live Drive change. The reel
    // controller swaps the updated list atomically after it has loaded.
    if (!liveUpdate) setLoading(true);
    void (async () => {
      const photoSources = await resolveReelSources(photos, controller.signal, driveAccessToken);
      if (controller.signal.aborted) return;
      // Publish the new photo snapshot immediately during a live update. Keep
      // the already-visible videos that still exist in the incoming snapshot,
      // so an upload or deletion reaches the playing queue without waiting for
      // the complete photo cache, song cache, or video phase to finish. The
      // final snapshot below replaces this temporary mixed list atomically.
      if (liveUpdate) {
        const currentVideoIds = new Set(videos.map(memory => memory.id));
        setResolvedSources(current => [
          ...photoSources,
          ...current.filter(source => source.type === 'video' && currentVideoIds.has(source.id)),
        ]);
      } else {
        setResolvedSources(photoSources);
        if (photoSources.length) setLoading(false);
      }

      if (videos.length) {
        const audioCachePromise = (driveSongsLoaded || secondaryDriveSongs.length)
          ? driveCacheWarmBatchRef.current.catch(() => undefined)
          : Promise.resolve();
        await Promise.all([photoCachePromise, audioCachePromise]);
        if (controller.signal.aborted) return;
      }
      // Videos are intentionally appended after every photo original and
      // queued Drive song is locally ready, so a large video cannot delay the
      // first visual sequence or compete with audio on a slow phone.
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
  }, [driveAccessToken, driveSongsLoaded, secondaryDriveSongs.length, sourceSignature, visualMemories]);

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
      performanceSurface: androidTvMode,
      template,
      zoom: zoomEnabled,
      holdScale: storyTimingScale(timing),
      onProgress: (current, total) => {
        setProgress({ progress: current, total });
        const more = moreConfigRef.current;
        if (more.hasMore && !more.loadingMore && !moreRequestedRef.current && total > 0 && current / total >= 0.55) {
          moreRequestedRef.current = true;
          more.onNeedMore?.();
        }
      },
      onLoadProgress: loaded => {
        publishStoryLoadedCount(Math.max(loaded, storyCachedPhotoCountRef.current));
      },
      onStateChange: setPlaying,
      onAudioStateChange: setAudioPlaying,
    });
    controllerRef.current = controller;
    controller.setAudioAnalysisElement(audioPlayerRef.current);
    // The reel covers the viewport, so the ambient background canvas and the
    // splash cursor are invisible while it is mounted. Pausing them also stops
    // the overlay's backdrop blur from recomputing every frame.
    const releaseHeavyVisualPause = beginHeavyVisualPause();
    return () => {
      releaseHeavyVisualPause();
      controller.destroy();
      controllerRef.current = null;
    };
  }, [audio, androidTvMode, legacyTvMode, reducedMotion]);

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
    controllerRef.current?.setHoldScale(storyTimingScale(timing));
    try {
      window.localStorage.setItem(STORY_TIMING_STORAGE_KEY, timing);
    } catch {
      // Local storage is optional; the current story remains active.
    }
  }, [timing]);

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
    // Use the same Drive fallback path as the Music button. The old direct
    // `audio.play()` here could reject on a TV without ever trying the cached
    // converted source.
    void playStoryAudio(false)
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
    if (legacyTvMode || androidTvMode) {
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
    await waitForNetworkResume();
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

  const waitForNetworkResume = async () => {
    if (navigator.onLine !== false) return;
    await new Promise<void>(resolve => {
      const onOnline = () => {
        window.removeEventListener('online', onOnline);
        resolve();
      };
      window.addEventListener('online', onOnline, { once: true });
    });
  };

  const shouldDeferAudioConversion = () => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const constrainedConnection = Boolean(connection?.saveData
      || connection?.effectiveType === 'slow-2g'
      || connection?.effectiveType === '2g');
    const compactTouchDevice = typeof window !== 'undefined'
      && window.matchMedia?.('(pointer: coarse)').matches
      && window.innerWidth <= 900;
    return constrainedConnection || compactTouchDevice;
  };

  const warmDriveAudioCache = async (song: DriveAudioFile, cacheKey: string, token: string, account: 'primary' | 'secondary' = 'primary') => {
    let lastError = 'The file could not be saved for offline playback.';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const cached = await readCachedStoryMedia(cacheKey);
        // A cache hit is already the source of truth for offline playback.
        // Do not re-run FFmpeg or touch Drive when Story Mode is reopened.
        if (cached) return true;
        await waitForNetworkResume();
        const downloaded = await withMediaFetch(() => googleDriveService.downloadMediaFileWithReconnect(token, song.id));
        if (downloaded?.accessToken && downloaded.accessToken !== token) {
          if (account === 'primary') {
            driveAccessTokenRef.current = downloaded.accessToken;
            saveDriveAccessToken(downloaded.accessToken);
          } else {
            secondaryDriveAccessTokenRef.current = downloaded.accessToken;
          }
        }
        const sourceBlob = downloaded?.blob;
        if (!sourceBlob) throw new Error('Drive returned an empty audio file.');
        // Persist the downloaded bytes before any optional conversion. This
        // is important on phones: FFmpeg/WASM conversion can be memory-heavy,
        // but the original MP3/M4A/WAV is normally natively playable and is
        // already enough to resume offline. Unsupported formats are converted
        // lazily only when the user presses Play.
        const rawBlob = normalizeDriveAudioBlob(sourceBlob, song);
        const saved = await writeCachedStoryMedia(cacheKey, rawBlob, rawBlob.type);
        if (!saved) throw new Error('The phone could not save this song for offline playback.');
        if (!shouldDeferAudioConversion()) {
          // Desktop can prepare an uncommon codec in the background. Phones
          // defer this expensive WASM/audio-context work until Play is tapped.
          try {
            const playableBlob = await preparePlayableAudioBlob(sourceBlob, song);
            if (playableBlob !== rawBlob) await writeCachedStoryMedia(cacheKey, playableBlob, playableBlob.type);
          } catch {
            // The original file is already safely cached and may be natively
            // playable; retry conversion only if playback actually needs it.
          }
        }
        driveCacheFailuresRef.current.delete(cacheKey);
        return true;
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
        if (attempt === 2) {
          driveCacheFailuresRef.current.set(cacheKey, {
            id: song.id,
            label: song.name,
            reason: lastError,
          });
          return false;
        }
        await waitForNetworkResume();
        await new Promise<void>(resolve => window.setTimeout(resolve, 900 * (attempt + 1)));
      }
    }
    return false;
  };

  const warmDriveAudioCacheOnce = (song: DriveAudioFile, cacheKey: string, token: string, account: 'primary' | 'secondary' = 'primary') => {
    const existing = driveCacheTasksRef.current.get(cacheKey);
    if (existing) return existing;
    // Always append to the same chain. `finally` keeps the chain usable even
    // if a future cache implementation throws instead of swallowing a single
    // file failure.
    const task = driveAudioSerialRef.current.then(() => warmDriveAudioCache(song, cacheKey, token, account));
    driveAudioSerialRef.current = task.catch(() => undefined);
    const trackedTask = task.finally(() => {
      if (driveCacheTasksRef.current.get(cacheKey) === trackedTask) driveCacheTasksRef.current.delete(cacheKey);
    });
    driveCacheTasksRef.current.set(cacheKey, trackedTask);
    return trackedTask;
  };

  const warmDriveAudioCacheSequentially = async (songs: DriveAudioFile[], token: string, account: 'primary' | 'secondary' = 'primary') => {
    const progressKey = songs.map(song => driveAudioCacheKey(song)).join('|');
    const sameBatch = driveCacheProgressKeyRef.current === progressKey;
    driveCacheProgressKeyRef.current = progressKey;
    const songKeys = new Set(songs.map(song => driveAudioCacheKey(song)));
    driveCacheFailuresRef.current.forEach((_failure, key) => {
      if (!songKeys.has(key)) driveCacheFailuresRef.current.delete(key);
    });
    setDriveCacheFailures(Array.from(driveCacheFailuresRef.current.values()));
    // Count the cache before starting the serial chain. A song may already be
    // playable from a previous session (or another tab), so progress must not
    // begin at zero and under-report what the player can already use.
    const countPlayableSongs = async () => {
      const cached = await Promise.all(songs.map(song => readCachedStoryMedia(driveAudioCacheKey(song))));
      return cached.reduce((count, blob) => count + (blob ? 1 : 0), 0);
    };
    let completed = await countPlayableSongs();
    let failed = 0;
    setDriveCacheProgress(current => sameBatch
      ? { ...current, completed, total: songs.length }
      : { completed, failed: 0, total: songs.length });
    for (let index = 0; index < songs.length; index += 1) {
      const cacheKey = driveAudioCacheKey(songs[index]);
      const cachedSuccessfully = await warmDriveAudioCacheOnce(songs[index], cacheKey, token, account);
      // Re-count the actual IDB cache after each item. This handles an item
      // that was cached by another queued request and keeps the displayed
      // playable total equal to what the audio player can open now.
      completed = await countPlayableSongs();
      const isPlayable = Boolean(await readCachedStoryMedia(cacheKey));
      if (!isPlayable && !cachedSuccessfully) failed += 1;
      setDriveCacheFailures(Array.from(driveCacheFailuresRef.current.values()));
      setDriveCacheProgress({
        completed,
        failed,
        total: songs.length,
      });
    }
  };

  const queueDriveAudioWarm = (songs: DriveAudioFile[], token: string, account: 'primary' | 'secondary' = 'primary') => {
    // Keep the UI responsive after Drive returns the list. The first track can
    // play immediately while this background chain stores the remaining
    // tracks one at a time; a refresh can queue behind it but never start a
    // second download batch in parallel.
    const task = driveCacheWarmBatchRef.current.then(() => warmDriveAudioCacheSequentially(songs, token, account));
    const safeTask = task.catch(() => undefined);
    driveCacheWarmBatchRef.current = safeTask;
    return safeTask;
  };

  const queueDriveSongs = (songs: DriveAudioFile[], token: string, account: 'primary' | 'secondary' = 'primary') => {
    const incoming = new Map(songs.filter(isAudioDriveFile).map(song => [song.id, song]));
    const accountTracks = musicQueueRef.current.filter(track => track.source === 'drive'
      && (track.driveAccount || 'primary') === account);
    const existingIds = new Set(accountTracks.map(track => track.driveFileId).filter(Boolean));
    const reconciledQueue = musicQueueRef.current
      .filter(track => !(track.source === 'drive'
        && (track.driveAccount || 'primary') === account
        && (!track.driveFileId || !incoming.has(track.driveFileId))))
      .map(track => {
        if (track.source !== 'drive' || (track.driveAccount || 'primary') !== account || !track.driveFileId) return track;
        const song = incoming.get(track.driveFileId);
        if (!song) return track;
        const nextCacheKey = driveAudioCacheKey(song);
        if (track.cacheKey !== nextCacheKey) failedMusicIdsRef.current.delete(track.id);
        return {
          ...track,
          src: token ? driveAudioUrl(song, token) : track.src,
          label: song.name,
          cacheKey: nextCacheKey,
          driveAccount: account,
        };
      });
    const additions = songs.filter(isAudioDriveFile)
      .filter(song => !existingIds.has(song.id))
      .map(song => ({
        id: `drive-audio-${account}-${song.id}`,
        src: token ? driveAudioUrl(song, token) : '',
        label: song.name,
        source: 'drive' as const,
        driveFileId: song.id,
        cacheKey: driveAudioCacheKey(song),
        driveAccount: account,
      }));
    const nextQueue = [...reconciledQueue, ...additions];
    const changed = nextQueue.length !== musicQueueRef.current.length
      || nextQueue.some((track, index) => {
        const previous = musicQueueRef.current[index];
        return !previous || track.id !== previous.id || track.cacheKey !== previous.cacheKey
          || track.label !== previous.label || track.src !== previous.src;
      });
    if (!changed) return;
    musicQueueRef.current = nextQueue;
    setMusicQueue(nextQueue);
    const currentStillExists = nextQueue.some(track => track.id === currentMusicIdRef.current);
    if (!currentStillExists) {
      const nextCurrent = nextQueue[0];
      setCurrentMusic(nextCurrent?.id || '');
      setMusicName(nextCurrent?.label || '');
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

  const prepareDriveTrackForPlayback = async (track: MusicQueueItem, allowRefresh = false, forceConversion = false) => {
    if (track.source !== 'drive' || !track.driveFileId) return track.src;
    const song = allDriveSongs.find(item => item.id === track.driveFileId);
    if (!song) return track.src;
    const cacheKey = track.cacheKey || driveAudioCacheKey(song);
    const rememberedSource = resolvedDriveAudioSourcesRef.current.get(cacheKey);
    if (rememberedSource) return rememberedSource;

    const createSource = async (token: string, forceConversion = false) => {
      const cached = await readCachedStoryMedia(cacheKey);
      const sourceBlob = cached || await withMediaFetch(() => googleDriveService.downloadMediaFileWithReconnect(token, song.id).then(result => result.blob));
      const playableBlob = await preparePlayableAudioBlob(sourceBlob, song, forceConversion);
      if (!cached || playableBlob !== cached) await writeCachedStoryMedia(cacheKey, playableBlob, playableBlob.type);
      const objectUrl = URL.createObjectURL(playableBlob);
      resolvedDriveAudioSourcesRef.current.set(cacheKey, objectUrl);
      audioObjectUrlsRef.current.push(objectUrl);
      return objectUrl;
    };

    let token = track.driveAccount === 'secondary'
      ? secondaryDriveAccessTokenRef.current
      : driveAccessTokenRef.current || driveAccessToken;
    await driveCacheTasksRef.current.get(cacheKey);
    const cached = await readCachedStoryMedia(cacheKey);
    if (!token && !cached) throw new Error('This song is not cached on this device. Reconnect Google Drive once to download it.');
    try {
      return await createSource(token || '', forceConversion);
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
      return createSource(token, forceConversion);
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
    audioRecoveryRef.current.delete(track.id);
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
          if (element.error) throw new Error('Drive audio format was rejected by this browser.');
          audioRecoveryRef.current.delete(track.id);
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
      audioRecoveryRef.current.delete(track.id);
      setAudioPlaying(true);
      setMusicError('');
    } catch (error) {
      audioPauseGuardRef.current = false;
      setAudioPlaying(false);
      if (musicQueue.length > 1 && isSkippableAudioFailure(error)) {
        failedMusicIdsRef.current.add(track.id);
        setMusicError(`Skipped unavailable song: ${track.label}`);
        void advanceMusic();
        return;
      }
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
    if (driveSongsRequestRef.current) return;
    driveSongsRequestRef.current = true;
    setDriveSongsLoading(true);
    setMusicError('');
    try {
      // Loading is an explicit user action. A cached story can still be
      // playing after the short-lived Drive session has disappeared, so ask
      // for authorization here instead of hiding the Drive song list.
      let token = driveAccessTokenRef.current || driveAccessToken;
      if (!token) token = await reconnectDriveForPlayback();
      try {
        const songs = await googleDriveService.listAudioFiles(token, musicDriveFolderId);
        setDriveSongs(songs);
        setDriveSongsLoaded(true);
        queueDriveSongs(songs, token);
        void queueDriveAudioWarm(songs, token, 'primary');
      } catch (error) {
        if (!isDriveAuthorizationError(error)) throw error;
        token = await reconnectDriveForPlayback();
        const songs = await googleDriveService.listAudioFiles(token, musicDriveFolderId);
        setDriveSongs(songs);
        setDriveSongsLoaded(true);
        queueDriveSongs(songs, token);
        void queueDriveAudioWarm(songs, token, 'primary');
      }
    } catch (error) {
      setMusicError(error instanceof Error ? error.message : 'Drive songs could not be loaded.');
    } finally {
      setDriveSongsLoading(false);
      driveSongsRequestRef.current = false;
    }
  };

  const retryFailedDriveSongs = () => {
    const failedIds = new Set(Array.from(driveCacheFailuresRef.current.values()).map(failure => failure.id));
    if (!failedIds.size) return;
    const primary = driveSongs.filter(song => failedIds.has(song.id));
    const secondary = secondaryDriveSongs.filter(song => failedIds.has(song.id));
    if (primary.length) {
      const token = driveAccessTokenRef.current || driveAccessToken;
      if (token) void queueDriveAudioWarm(primary, token, 'primary');
    }
    if (secondary.length && secondaryDriveAccessTokenRef.current) {
      void queueDriveAudioWarm(secondary, secondaryDriveAccessTokenRef.current, 'secondary');
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
      queueDriveSongs(songs, token, 'secondary');
      void queueDriveAudioWarm(songs, token, 'secondary');
      setMusicName(songs.length ? `${songs.length} songs from the second Drive` : 'No audio files found in the second Drive');
    } catch (error) {
      setMusicError(error instanceof Error ? error.message : 'The second Google Drive could not be connected.');
    } finally {
      setSecondaryDriveSongsLoading(false);
      secondaryDriveSongsRequestRef.current = false;
    }
  };

  // Drive audio is refreshed only by the explicit "Load Drive songs" action.
  // Avoid polling every ten seconds: it repeatedly checks Drive while the
  // story is playing and can trigger unnecessary requests on low-data phones.

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
    audioRecoveryRef.current.delete(trackId);
    audioManuallyStoppedRef.current = true;
    audioPauseGuardRef.current = true;
    audioPlayerRef.current?.pause();
    audioPauseGuardRef.current = false;
    setAudioPlaying(false);
    setMusicName(song.name);
    const nextQueue = [selectedTrack, ...musicQueueRef.current.filter(item => item.driveFileId !== song.id && item.id !== trackId)];
    musicQueueRef.current = nextQueue;
    setMusicQueue(nextQueue);
    setCurrentMusic(selectedTrack.id);
    audioManuallyStoppedRef.current = false;
    void playStoryAudio(true);
    if (token) void warmDriveAudioCacheOnce(song, cacheKey, token);
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
    const source = sourceTrack?.src || '';
    if (!element || (!source && sourceTrack?.source !== 'drive') || audioManuallyStoppedRef.current) return false;
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
          if (element.error) throw new Error('Drive audio format was rejected by this browser.');
          audioRecoveryRef.current.delete(sourceTrack.id);
          setAudioPlaying(true);
          setMusicError('');
          return true;
        } catch {
          // The direct stream may fail on an older browser; use the local
          // object URL fallback below.
        }
      }
      // If the authenticated Drive stream was rejected by this browser, force
      // a conversion of the downloaded file instead of retrying the same
      // unsupported MP3/container. The converted source is cached for later.
      const playableSource = await prepareDriveTrackForPlayback(sourceTrack, fromUserGesture, true);
      if (element.src !== playableSource) {
        audioPauseGuardRef.current = true;
        element.pause();
        element.src = playableSource;
        element.load();
        audioPauseGuardRef.current = false;
      }
      applyPendingMusicResume();
      await playAudioWithTimeout(element);
      audioRecoveryRef.current.delete(sourceTrack.id);
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
      if (sourceTrack && musicQueue.length > 1 && isSkippableAudioFailure(error)) {
        failedMusicIdsRef.current.add(sourceTrack.id);
        void advanceMusic();
      }
      return false;
    } finally {
      setAudioLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const recoverMusicAfterScreenReturn = async () => {
      if (document.hidden) {
        screenHiddenRef.current = true;
        persistMusicPlayback(Boolean(audioPlayerRef.current && !audioPlayerRef.current.paused), true);
        return;
      }
      screenHiddenRef.current = false;
      const element = audioPlayerRef.current;
      const track = musicQueueRef.current.find(item => item.id === currentMusicIdRef.current) || musicQueueRef.current[0];
      const shouldResume = Boolean(track && !audioManuallyStoppedRef.current && (
        (element && !element.paused) || storedMusicPlaybackRef.current?.wasPlaying
      ));
      if (!active || !track || !shouldResume) return;

      if (track.source === 'drive' && navigator.onLine) {
        try {
          const refreshedToken = await googleDriveService.refreshAccessToken(undefined, true);
          if (refreshedToken) {
            driveAccessTokenRef.current = refreshedToken;
            saveDriveAccessToken(refreshedToken);
          }
        } catch {
          // The local audio cache remains usable while offline or when silent
          // Google re-authentication is unavailable in this browser.
        }
      }
      if (!active) return;
      pendingMusicResumeRef.current = {
        trackId: track.id,
        currentTime: Number.isFinite(element?.currentTime) ? Math.max(0, element?.currentTime || 0) : storedMusicPlaybackRef.current?.currentTime || 0,
      };
      audioManuallyStoppedRef.current = false;
      void playStoryAudio(false);
    };
    const onVisibilityChange = () => { void recoverMusicAfterScreenReturn(); };
    const onOnline = () => { void recoverMusicAfterScreenReturn(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onVisibilityChange);
    window.addEventListener('online', onOnline);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onVisibilityChange);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  // Mobile browsers may reject the automatic resume after a page return or a
  // Drive cache restore because it is no longer inside a user gesture. Keep
  // the saved playback intent and retry on the next real tap without making
  // the user select the song again.
  useEffect(() => {
    const retryAudioFromGesture = () => {
      const element = audioPlayerRef.current;
      const savedPlayback = storedMusicPlaybackRef.current;
      if (!element || !element.paused || audioManuallyStoppedRef.current || (!savedPlayback?.wasPlaying && !playing)) return;
      audioManuallyStoppedRef.current = false;
      void playStoryAudio(true);
    };
    window.addEventListener('pointerdown', retryAudioFromGesture, { passive: true });
    window.addEventListener('touchstart', retryAudioFromGesture, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', retryAudioFromGesture);
      window.removeEventListener('touchstart', retryAudioFromGesture);
    };
  }, [musicQueue.length, playing]);

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

  const toggleLoop = () => {
    // Update the ref and controller in the same click as the label. The
    // visual timeline and the audio queue must see the new loop state before
    // either one reaches its end boundary.
    const next = !loopEnabledRef.current;
    loopEnabledRef.current = next;
    setLoopEnabled(next);
    controllerRef.current?.setLoop(next);
  };

  const advanceMusicStep = async (): Promise<boolean> => {
    const currentQueue = musicQueueRef.current;
    const element = audioPlayerRef.current;
    if (!currentQueue.length || !element) return false;
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
      return false;
    }

    const nextTrack = currentQueue[nextIndex];
    if (!nextTrack) {
      setAudioPlaying(false);
      return false;
    }
    setCurrentMusic(nextTrack.id);
    setMusicName(nextTrack.label);
    audioRecoveryRef.current.delete(nextTrack.id);
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
        return false;
      }
      const startTrack = async (source: string) => {
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
        if (element.error) throw new Error('Audio format was rejected by this browser.');
      };

      let firstError: unknown;
      let firstAttemptFailed = false;
      try {
        const source = await prepareDriveTrackForPlayback(nextTrack);
        await startTrack(source);
      } catch (error) {
        firstAttemptFailed = true;
        firstError = error;
      }
      if (firstAttemptFailed) {
        if (nextTrack.source !== 'drive') throw firstError;
        // The first cache/native attempt failed. Convert this one item before
        // marking it bad; only a second failure advances the queue.
        const convertedSource = await prepareDriveTrackForPlayback(nextTrack, false, true);
        await startTrack(convertedSource);
      }
      audioRecoveryRef.current.delete(nextTrack.id);
      setAudioPlaying(true);
    } catch (error) {
      audioPauseGuardRef.current = false;
      setAudioPlaying(false);
      if (currentQueue.length > 1 && isSkippableAudioFailure(error)) {
        failedMusicIdsRef.current.add(nextTrack.id);
        setMusicError(`Skipped unavailable song: ${nextTrack.label}`);
        // Let the guarded wrapper start the next item after this attempt has
        // fully released the audio element. Calling advanceMusic directly
        // here could race a native `ended`/`error` event and skip two tracks.
        return true;
      }
    } finally {
      setAudioLoading(false);
    }
    return false;
  };

  const advanceMusic = async () => {
    if (musicAdvanceInFlightRef.current) return;
    musicAdvanceInFlightRef.current = true;
    let retryNext = false;
    try {
      retryNext = await advanceMusicStep();
    } finally {
      musicAdvanceInFlightRef.current = false;
    }
    if (retryNext) void advanceMusic();
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
          <button type="button" className={castOpen ? 'is-active' : ''} onClick={() => setCastOpen(true)} aria-pressed={castOpen}><Cast size={16} /> Cast local</button>
          <button type="button" className={musicOpen ? 'is-active' : ''} aria-expanded={musicOpen} onClick={openMusic}><Music2 size={16} /> Music {musicQueue.length ? `(${musicQueue.length})` : allDriveSongs.length ? `(${allDriveSongs.length} Drive)` : ''}</button>
          <button type="button" className={templateOpen ? 'is-active' : ''} aria-expanded={templateOpen} onClick={openTemplates}><WandSparkles size={16} /> Template</button>
          {musicQueue.length > 0 && <button type="button" onClick={() => void toggleMusic()} aria-pressed={audioPlaying}><Volume2 size={16} /> {audioPlaying ? 'Stop music' : 'Play music'}</button>}
          {musicQueue.length > 0 && <button type="button" onClick={toggleMute} aria-pressed={audioMuted} aria-label={audioMuted ? 'Unmute music' : 'Mute music'}>{audioMuted ? <VolumeX size={16} /> : <Volume2 size={16} />} {audioMuted ? 'Unmute' : 'Mute'}</button>}
          <button type="button" className={effectsOpen ? 'is-active' : ''} aria-expanded={effectsOpen} onClick={openEffects}><WandSparkles size={16} /> Effects</button>
          <button type="button" className={zoomEnabled ? 'is-active' : ''} onClick={() => setZoomEnabled(value => !value)} aria-pressed={zoomEnabled}>Zoom {zoomEnabled ? 'On' : 'Off'}</button>
          <div className="memory-reel-timing-control" aria-label="Choose how long each photo or video stays visible">
            <span>Stay</span>
            <div className="memory-reel-timing-chips">
              {MEMORY_REEL_TIMINGS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  className={timing === option.id ? 'is-active' : ''}
                  aria-pressed={timing === option.id}
                  title={option.description}
                  onClick={() => setTiming(option.id)}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className={clarityOpen ? 'is-active' : ''} aria-expanded={clarityOpen} onClick={openClarity}><WandSparkles size={16} /> Clarity</button>
          {driveFolders && driveFolders.length > 0 && onDriveFolderChange && (
            <div className="memory-reel-folder-summary">
              <label className="memory-reel-folder-picker"><span>Drive folder</span><select value={driveFolderId || ''} onChange={event => onDriveFolderChange(event.target.value)} aria-label="Choose Story Mode Drive folder"><option value="">All My Drive photos</option>{driveFolders.filter(folder => folder.id).map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
              <span className="memory-reel-folder-count" aria-live="polite">{storyLoadedCount}/{storyAvailableCount} loaded · {storyPhotoCount} photos · {storyVideoCount} videos</span>
            </div>
          )}
          <button type="button" onClick={toggleLoop} aria-pressed={loopEnabled}>{loopEnabled ? 'Loop On' : 'Loop Off'}</button>
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
            if (!audioPauseGuardRef.current && !screenHiddenRef.current) {
              audioManuallyStoppedRef.current = true;
              persistMusicPlayback(false, true);
            }
          }}
          onEnded={() => void advanceMusic()}
          onError={() => {
            setAudioLoading(false);
            setAudioPlaying(false);
            const activeTrack = musicQueue.find(track => track.id === currentMusicIdRef.current) || musicQueue[0];
            // A native stream can report its codec failure after play() has
            // already resolved. Retry that Drive item once through the local
            // converted cache before showing the error to the user.
            if (activeTrack?.source === 'drive' && !audioRecoveryRef.current.has(activeTrack.id)) {
              audioRecoveryRef.current.add(activeTrack.id);
              setAudioLoading(true);
              void playStoryAudio(false).finally(() => setAudioLoading(false));
              return;
            }
            setMusicError(activeTrack?.source === 'drive'
              ? 'This Drive song is cached, but this browser or TV cannot decode its format. MP3 or AAC/M4A works on the widest range of phones and TVs.'
              : 'This audio file was downloaded, but this browser or TV cannot decode its format. MP3 or AAC/M4A works on the widest range of phones and TVs.');
          }}
        />
        <LocalCastController open={castOpen} onClose={() => setCastOpen(false)} />
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
          {onClose && <button type="button" onClick={onClose} aria-label="Exit story mode" title="Exit story mode"><X size={19} /></button>}
        </div>
        <div className="memory-reel-progress-text">{loading ? 'Preparing your memories…' : `${formatStoryTime(progress.progress)} / ${formatStoryTime(progress.total)}`}</div>
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
              <button type="button" onClick={() => void loadDriveSongs()} disabled={driveSongsLoading}>
                <Search size={15} /> {driveSongsLoading ? 'Loading Drive songs...' : driveAccessToken ? 'Load Drive songs' : 'Connect Drive & load songs'}
              </button>
              <button type="button" onClick={() => void connectAdditionalMusicDrive()} disabled={secondaryDriveSongsLoading}><HardDrive size={15} /> {secondaryDriveSongsLoading ? 'Connecting second Drive...' : 'Add music from another Drive'}</button>
            </div>
            <p className="memory-reel-music-note">Drive songs download locally for offline playback. The second Drive option asks you to choose another Gmail account and is used only for Story Mode music.</p>
            {driveCacheProgress.total > 0 && (
              <p className="memory-reel-music-note" aria-live="polite">
                {driveCacheProgress.completed < driveCacheProgress.total
                  ? `Saving Drive audio locally: ${driveCacheProgress.completed}/${driveCacheProgress.total} playable${driveCacheProgress.failed ? ` · ${driveCacheProgress.failed} retrying` : ''}`
                  : `Drive audio is ready offline: ${driveCacheProgress.completed} playable song${driveCacheProgress.completed === 1 ? '' : 's'}${driveCacheProgress.failed ? ` · ${driveCacheProgress.failed} failed` : ''}`}
              </p>
            )}
            {driveCacheFailures.length > 0 && (
              <div className="memory-reel-music-error" role="status" aria-live="polite">
                <p>These songs are not stored locally yet:</p>
                <ul>
                  {driveCacheFailures.map(failure => <li key={failure.id}><b>{failure.label}</b> — {failure.reason}</li>)}
                </ul>
                <button type="button" onClick={retryFailedDriveSongs}><RotateCcw size={14} /> Retry failed songs</button>
              </div>
            )}
            {musicTotalDuration !== null && musicQueue.length > 0 && (
              <p className="memory-reel-music-note" aria-live="polite">
                Total song time: {formatMusicMinutes(musicTotalDuration)}
              </p>
            )}
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
            {driveSongsLoaded && !allDriveSongs.length && !musicError && (
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
