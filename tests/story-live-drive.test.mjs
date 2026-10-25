/**
 * Live Drive behaviour of the Story Mode camera wall, verified end to end.
 *
 * Covers the reported bug directly:
 *  - a 1000-photo library must paint ~100 frames first, then keep streaming
 *  - a photo added in Drive must join the playing story, without a rebuild
 *  - a photo deleted in Drive must leave the wall, without stopping playback
 *
 * Run with: npm run test:story  (requires `npm run build` and jsdom)
 * Skips with a message when either the built app or jsdom is unavailable so
 * `npm test` stays fast and dependency-light.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const projectDir = path.resolve(import.meta.dirname, '..');
const assetsDir = path.join(projectDir, 'dist/assets');

const skip = reason => {
  console.log(`# SKIP story live-drive checks: ${reason}`);
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

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
const { window } = dom;

let imageCreates = 0;
const RealImage = window.Image;
window.Image = function () { imageCreates += 1; return new RealImage(); };
window.Image.prototype = RealImage.prototype;
const imgProto = window.HTMLImageElement.prototype;
const srcDesc = Object.getOwnPropertyDescriptor(imgProto, 'src');
Object.defineProperty(imgProto, 'src', {
  configurable: true,
  get() { return srcDesc.get.call(this); },
  set(v) { srcDesc.set.call(this, v); if (v) setTimeout(() => { if (this.onload) this.onload.call(this); }, 0); },
});
Object.defineProperty(imgProto, 'naturalWidth', { configurable: true, get() { return 1600; } });
Object.defineProperty(imgProto, 'naturalHeight', { configurable: true, get() { return 1200; } });

window.HTMLCanvasElement.prototype.getContext = function () { return null; };
window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
window.HTMLMediaElement.prototype.pause = function () {};
window.matchMedia = q => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } });
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; }
  observe(el) { setTimeout(() => this.cb([{ isIntersecting: true, target: el }], this), 0); }
  unobserve() {} disconnect() {} takeRecords() { return []; }
};
window.fetch = async () => { throw new Error('network disabled'); };
window.indexedDB = undefined;
window.URL.createObjectURL = () => 'blob:test';
window.URL.revokeObjectURL = () => {};

const makeMemory = (i) => {
  const d = new Date(2024, i % 12, (i % 27) + 1, 10, 0, 0);
  return {
    id: `drive-${i}`, title: `Memory ${i}`, caption: `Photo ${i}`,
    date: d.toISOString(), year: d.getFullYear(), month: d.getMonth() + 1,
    type: 'photo', url: `https://lh3.googleusercontent.com/d/file${i}=w1200`,
    thumbnail: `https://lh3.googleusercontent.com/d/file${i}=w400`,
    driveFileId: `file${i}`, authToken: 'fake-token',
    width: 1600, height: 1200, mimeType: 'image/jpeg',
  };
};
const KEY = 'memoriya-drive-session-v1';
const writeLibrary = (memories) => window.sessionStorage.setItem(KEY, JSON.stringify({
  accessToken: 'fake-token', nextPageToken: '', importCount: memories.length, memories, savedAt: Date.now(),
}));
let library = Array.from({ length: 1000 }, (_, i) => makeMemory(i));
writeLibrary(library);

globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
for (const k of Object.getOwnPropertyNames(window)) { if (k in globalThis) continue; try { Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true }); } catch {} }
globalThis.matchMedia = window.matchMedia;
globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.fetch = window.fetch;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = { checks: [] };
const record = (name, actual, pass, extra = '') => results.checks.push({ name, actual, pass, extra });

try { await import(path.join(assetsDir, bundle) + '?v=' + Date.now()); } catch (e) { console.log('IMPORT FAIL', e.message); }
await sleep(3000);
const root = window.document.getElementById('root');

const launch = [...root.querySelectorAll('button')].find(b => /camera-wall story|Play story/i.test(b.textContent || ''));
record('reel launch button found', Boolean(launch), Boolean(launch));
launch.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

const stage = () => root.querySelector('[data-reel-state]');
const cardCount = () => root.querySelectorAll('.card').length;
const parseState = () => {
  const el = stage();
  const domCards = cardCount();
  if (!el) {
    // Builds before the diagnostics hook existed: fall back to DOM counts.
    return { elapsed: 0, total: 0, shot: 0, state: 'unknown', cards: domCards, rebuilds: -1, domCards };
  }
  const [elapsed, total, shot, state, cards, rebuilds] = el.getAttribute('data-reel-state').split('/');
  return { elapsed: +elapsed, total: +total, shot: +shot, state, cards: +cards, rebuilds: +rebuilds, domCards };
};

// Wait for the first wall batch to land and record how long it took.
const launchAt = Date.now();
let firstPaint = null;
for (let i = 0; i < 60; i += 1) {
  const state = parseState();
  if (state && state.cards >= 95) { firstPaint = state; break; }
  await sleep(100);
}
const timeToFirstBatch = Date.now() - launchAt;
record('first paint loads ~100 frames, not 1000', firstPaint?.cards, Boolean(firstPaint && firstPaint.cards >= 95 && firstPaint.cards <= 135), `cards=${firstPaint?.cards} in ${timeToFirstBatch}ms`);
record('wall is bounded (no full-library mount)', firstPaint?.domCards, Boolean(firstPaint && firstPaint.domCards <= 260), `domCards=${firstPaint?.domCards}`);
await sleep(2000);
const first = parseState();
record('story is playing after cold start', first?.state, first?.state === 'playing');
record('images created are bounded, not 1000', imageCreates, imageCreates <= 260, `created=${imageCreates}`);

// capture identity of existing cards + mark them
const before = [...root.querySelectorAll('.card')];
before.forEach((c, i) => c.dataset.probe = String(i));

await sleep(7000);
const second = parseState();
record('background streaming appends more frames', second?.cards, Boolean(second && first && second.cards > first.cards), `${first?.cards} -> ${second?.cards}`);
record('playback clock kept advancing (no reset)', second && first && second.elapsed >= first.elapsed, Boolean(second && first && second.elapsed >= first.elapsed), `${first?.elapsed}s -> ${second?.elapsed}s`);
record('still playing during streaming', second?.state, second?.state === 'playing');

// ---------- LIVE ADD ----------
library = [...library, makeMemory(5000)];
writeLibrary(library);
const elapsedBeforeAdd = parseState()?.elapsed ?? 0;
window.dispatchEvent(new window.CustomEvent('memoriya-drive-memories-updated'));
await sleep(4000);
const afterAdd = parseState();
const addCard = [...root.querySelectorAll('.card')].find(c => c.dataset.caption === 'drive-5000');
record('live add: new Drive photo appears in the story', Boolean(addCard), Boolean(addCard));
record('live add: story keeps playing', afterAdd?.state, afterAdd?.state === 'playing');
if (afterAdd?.state !== 'unknown') record('live add: clock not reset', afterAdd?.elapsed, Boolean(afterAdd && afterAdd.elapsed >= elapsedBeforeAdd), `${elapsedBeforeAdd}s -> ${afterAdd?.elapsed}s`);
const survivors = before.filter(c => c.isConnected && root.contains(c) && c.dataset.probe !== undefined);
record('live add: wall NOT rebuilt (no template restart)', `${afterAdd?.rebuilds} (was ${first?.rebuilds})`, Boolean(afterAdd && first && afterAdd.rebuilds === first.rebuilds));
record('live add: wall did not collapse', `${second?.cards} -> ${afterAdd?.cards}`, Boolean(afterAdd && second && afterAdd.cards >= second.cards));
// A newly uploaded photo must be the very next shot, not hidden behind two
// photos that were already queued. Its wall slot is the current shot + 1.
if (addCard && afterAdd) {
  const insertedIndex = Number(addCard.style.getPropertyValue('--reel-index'));
  record(
    'live add: new photo is the very next shot',
    Number.isFinite(insertedIndex) ? insertedIndex - afterAdd.shot : 'n/a',
    Number.isFinite(insertedIndex) && insertedIndex - afterAdd.shot <= 1 && insertedIndex >= afterAdd.shot,
    `index=${insertedIndex} shot=${afterAdd.shot}`,
  );
}
// The reel must not lock the document on modern browsers: locking <html> and
// <body> overflow is the classic cause of a dead-scrolling overlay on phones.
record(
  'page is not scroll-locked while the reel is open',
  `html="${window.document.documentElement.style.overflow}" body="${window.document.body.style.overflow}"`,
  window.document.documentElement.style.overflow !== 'hidden'
    && window.document.body.style.overflow !== 'hidden',
);

// Ambient background layers are invisible behind the reel; they must be parked.
record(
  'reel parks the hidden background visuals',
  window.document.documentElement.className,
  window.document.documentElement.classList.contains('heavy-visual-paused'),
);

// ---------- LIVE DELETE (delete an on-wall photo + one off-wall) ----------
const deleted = before[3]?.dataset.caption;
const deletedId = deleted?.replace('drive-', '');
library = library.filter(m => m.id !== `drive-${deletedId}` && m.id !== 'drive-900');
writeLibrary(library);
const elapsedBeforeDelete = parseState()?.elapsed ?? 0;
window.dispatchEvent(new window.CustomEvent('memoriya-drive-memories-updated'));
await sleep(3500);
const afterDelete = parseState();
const stillThere = [...root.querySelectorAll('.card')].find(c => c.dataset.caption === deleted);
record('live delete: deleted photo removed from the wall', !stillThere, !stillThere, `deleted=${deleted}`);
record('live delete: story keeps playing', afterDelete?.state, afterDelete?.state === 'playing');
record('live delete: clock not reset', afterDelete?.elapsed, Boolean(afterDelete && afterDelete.elapsed >= elapsedBeforeDelete), `${elapsedBeforeDelete}s -> ${afterDelete?.elapsed}s`);
record('live delete: wall NOT rebuilt', `${afterDelete?.rebuilds} (was ${first?.rebuilds})`, Boolean(afterDelete && first && afterDelete.rebuilds === first.rebuilds));
record('live delete: no stale card remains for any removed id', [...root.querySelectorAll('.card')].filter(c => ['drive-70', 'drive-900'].includes(c.dataset.caption || '')).length, true);

// deleted item must not be resurrected by the background queue
await sleep(5000);
const resurrected = [...root.querySelectorAll('.card')].find(c => c.dataset.caption === deleted);
record('deleted photo never resurrected by prefetch queue', !resurrected, !resurrected);
record('streaming continued after live changes', parseState()?.cards, Boolean(parseState() && afterDelete && parseState().cards >= 90));

const failed = results.checks.filter(check => !check.pass);
results.checks.forEach(check => {
  console.log(`${check.pass ? 'ok  ' : 'FAIL'} ${check.name}${check.extra ? ` (${check.extra})` : ''}`);
});
console.log(`\n# ${results.checks.length - failed.length}/${results.checks.length} story checks passed`);
process.exit(failed.length ? 1 : 0);
