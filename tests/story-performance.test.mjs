/**
 * Story Mode performance regression checks (1000-photo library).
 *
 * These guard the work that keeps large Drive libraries smooth. They measure
 * the real built bundle in jsdom, so the numbers are absolute DOM/style work
 * rather than GPU timings:
 *
 *  - the culling pass must select exactly the cards a brute-force scan would
 *  - the renderer must not restyle the whole library every frame
 *  - the paint loop must keep running at a usable rate
 *
 * Run with: npm run test:perf   (requires `npm run build`)
 * Skips with a message when the built app or jsdom is unavailable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const projectDir = path.resolve(import.meta.dirname, '..');
const assetsDir = path.join(projectDir, 'dist/assets');

const skip = reason => {
  console.log(`# SKIP story performance checks: ${reason}`);
  process.exit(0);
};

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch {
  skip('jsdom is not installed (npm i -D jsdom)');
}
if (!fs.existsSync(assetsDir)) skip('dist/assets is missing (run npm run build)');
const bundle = fs.readdirSync(assetsDir).filter(f => /^index-.*\.js$/.test(f) && !f.startsWith('index.esm'))[0];
if (!bundle) skip('no built bundle found');

const LIBRARY_SIZE = 1000;
const MEASURE_MS = 8000;

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost:5173/',
});
const { window } = dom;

// --- instrument real DOM style writes (hardware independent) ---
let setPropertyCalls = 0;
let transformWrites = 0;
const declProto = window.CSSStyleDeclaration.prototype;
const realSetProperty = declProto.setProperty;
declProto.setProperty = function (...args) {
  setPropertyCalls += 1;
  return realSetProperty.apply(this, args);
};
const transformDescriptor = Object.getOwnPropertyDescriptor(declProto, 'transform');
if (transformDescriptor?.set) {
  Object.defineProperty(declProto, 'transform', {
    configurable: true,
    get: transformDescriptor.get,
    set(value) {
      transformWrites += 1;
      transformDescriptor.set.call(this, value);
    },
  });
}

// --- media stubs: no network, instant decode ---
const RealImage = window.Image;
window.Image = function () { return new RealImage(); };
window.Image.prototype = RealImage.prototype;
const imgProto = window.HTMLImageElement.prototype;
const srcDescriptor = Object.getOwnPropertyDescriptor(imgProto, 'src');
Object.defineProperty(imgProto, 'src', {
  configurable: true,
  get() { return srcDescriptor.get.call(this); },
  set(value) {
    srcDescriptor.set.call(this, value);
    if (!value) return;
    setTimeout(() => { if (this.onload) this.onload.call(this); }, 0);
  },
});
Object.defineProperty(imgProto, 'naturalWidth', { configurable: true, get() { return 1600; } });
Object.defineProperty(imgProto, 'naturalHeight', { configurable: true, get() { return 1200; } });

window.HTMLCanvasElement.prototype.getContext = function () { return null; };
window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
window.HTMLMediaElement.prototype.pause = function () {};
window.matchMedia = query => ({
  matches: false, media: query, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  dispatchEvent() { return false; },
});
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver = class {
  constructor(callback) { this.callback = callback; }
  observe(element) { setTimeout(() => this.callback([{ isIntersecting: true, target: element }], this), 0); }
  unobserve() {} disconnect() {} takeRecords() { return []; }
};
window.fetch = async () => { throw new Error('network disabled'); };
window.indexedDB = undefined;

const makeMemory = index => {
  const date = new Date(2024, index % 12, (index % 27) + 1, 10, 0, 0);
  return {
    id: `drive-${index}`,
    title: `Memory ${index}`,
    caption: `Photo ${index}`,
    date: date.toISOString(),
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    type: 'photo',
    url: `https://lh3.googleusercontent.com/d/file${index}=w1200`,
    thumbnail: `https://lh3.googleusercontent.com/d/file${index}=w400`,
    driveFileId: `file${index}`,
    authToken: 'fake-token',
    width: 1600,
    height: 1200,
    mimeType: 'image/jpeg',
  };
};

window.sessionStorage.setItem('memoriya-drive-session-v1', JSON.stringify({
  accessToken: 'fake-token',
  nextPageToken: '',
  importCount: LIBRARY_SIZE,
  memories: Array.from({ length: LIBRARY_SIZE }, (_, index) => makeMemory(index)),
  savedAt: Date.now(),
}));

globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
for (const key of Object.getOwnPropertyNames(window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true }); } catch { /* getter-only */ }
}
globalThis.matchMedia = window.matchMedia;
globalThis.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 16);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.fetch = window.fetch;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const failures = [];
const record = (name, pass, detail) => {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!pass) failures.push(name);
};

await import(path.join(assetsDir, bundle) + `?v=${Date.now()}`);
await sleep(3000);
const root = window.document.getElementById('root');

const launch = [...root.querySelectorAll('button')].find(button => /camera-wall story|Play story/i.test(button.textContent || ''));
record('story launches', Boolean(launch));
launch.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// Let the first wall batch settle, then measure a steady-state window.
await sleep(2500);
setPropertyCalls = 0;
transformWrites = 0;
const samples = [];
const startedAt = Date.now();
const sampler = setInterval(() => {
  const stage = root.querySelector('[data-reel-state]');
  if (stage) samples.push(stage.getAttribute('data-reel-state'));
}, 100);
await sleep(MEASURE_MS);
clearInterval(sampler);
const elapsedMs = Date.now() - startedAt;

const parse = value => {
  const [elapsed, total, shot, state, cards, rebuilds, paintCost, paintInterval, paints] = (value || '').split('/');
  return {
    elapsed: Number(elapsed), total: Number(total), shot: Number(shot), state,
    cards: Number(cards), rebuilds: Number(rebuilds),
    paintCostMs: Number(paintCost), paintIntervalMs: Number(paintInterval), paints: Number(paints),
  };
};
const first = parse(samples[0]);
const last = parse(samples[samples.length - 1]);

// --- paint loop health ---
const paintsPerSec = (last.paints - first.paints) / (elapsedMs / 1000);
record('story keeps playing while streaming', last.state === 'playing', `state=${last.state}`);
record('paint loop sustains a usable rate', paintsPerSec >= 15 && paintsPerSec <= 75, `${paintsPerSec.toFixed(1)} paints/s`);
record('average paint cost stays low', Number.isFinite(last.paintCostMs) && last.paintCostMs < 12, `${last.paintCostMs}ms`);
record('streamed frames keep arriving', last.cards > first.cards, `${first.cards} -> ${last.cards}`);

// --- renderer work must not scale with library size ---
const styleWritesPerSec = setPropertyCalls / (elapsedMs / 1000);
const transformWritesPerSec = transformWrites / (elapsedMs / 1000);
record('style writes stay bounded on a 1000-photo library', styleWritesPerSec < 2500, `${Math.round(styleWritesPerSec)}/s`);
record('transform writes stay bounded', transformWritesPerSec < 4000, `${Math.round(transformWritesPerSec)}/s`);

// --- culling must equal a brute-force scan ---
const stage = root.querySelector('[data-reel-state]');
const debug = stage?.__reelDebug;
record('culling decision is inspectable', Boolean(debug));
if (debug) {
  let mismatched = 0;
  let checked = 0;
  let maxCandidates = 0;
  for (let sample = 0; sample < 8; sample += 1) {
    const snapshot = debug.snapshot();
    if (!snapshot.candidates.length) continue;
    checked += 1;
    maxCandidates = Math.max(maxCandidates, snapshot.candidates.length);
    const { camera, radius, cards, nearest } = snapshot;
    const distances = cards.map(card => Math.hypot(card.x - camera.x, card.y - camera.y));
    if (nearest) {
      const limit = Math.min(cards.length <= 96 ? cards.length : 64, distances.length);
      const expected = new Set(distances.map((distance, index) => ({ distance, index }))
        .sort((left, right) => left.distance - right.distance)
        .slice(0, limit)
        .map(item => item.index));
      if ([...expected].some(index => !nearest.includes(index))) mismatched += 1;
    } else {
      const expected = distances.map((distance, index) => distance <= radius ? index : -1).filter(index => index >= 0);
      if (expected.some(index => !snapshot.candidates.includes(index))) mismatched += 1;
    }
    await sleep(900);
  }
  record('culled set matches a brute-force scan', checked > 0 && mismatched === 0, `${checked} samples, ${mismatched} mismatched`);
  record('culling does not scale with the library', maxCandidates > 0 && maxCandidates < last.cards, `${maxCandidates} measured of ${last.cards} loaded`);
}

console.log(`\n# ${failures.length ? `${failures.length} failed` : 'all'} story performance checks`);
process.exit(failures.length ? 1 : 0);
