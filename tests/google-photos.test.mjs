import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const root = process.cwd();
const readProjectFile = fileName => readFile(path.join(root, fileName), 'utf8');

const createMockStorage = () => {
  const store = new Map();
  return {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
    clear: () => store.clear(),
  };
};

const setupBrowserMocks = () => {
  const localStorage = createMockStorage();
  const sessionStorage = createMockStorage();
  const dispatched = [];
  const listeners = new Map();

  const mockWindow = {
    localStorage,
    sessionStorage,
    indexedDB: undefined,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: id => clearTimeout(id),
    addEventListener: (name, fn) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    removeEventListener: (name, fn) => {
      listeners.get(name)?.delete(fn);
    },
    dispatchEvent: event => {
      dispatched.push(event.type);
      listeners.get(event.type)?.forEach(fn => fn(event));
      return true;
    },
  };

  globalThis.window = mockWindow;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  let blobCounter = 0;
  globalThis.URL.createObjectURL = () => `blob:test-gphoto-${++blobCounter}`;
  globalThis.URL.revokeObjectURL = () => {};

  return { localStorage, sessionStorage, dispatched };
};

const loadGooglePhotosService = async () => {
  const source = await readProjectFile('src/services/googlePhotosService.ts');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2018,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
};

test('Google Photos mobile vs PC detection and Picker URI formatting', async () => {
  setupBrowserMocks();
  const svc = await loadGooglePhotosService();

  assert.equal(
    svc.isMobileGooglePhotosDevice(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
    ),
    true,
  );
  assert.equal(
    svc.isMobileGooglePhotosDevice(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    ),
    true,
  );
  assert.equal(
    svc.isMobileGooglePhotosDevice(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
    ),
    false,
  );
  assert.equal(
    svc.isMobileGooglePhotosDevice(
      'Mozilla/5.0 (Linux; Android 12; GoogleTV) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    ),
    false,
  );

  const rawUri = 'https://photos.google.com/photospicker/abc-123/';
  assert.equal(svc.formatGooglePhotosPickerUrl(rawUri, false), rawUri);
  assert.equal(
    svc.formatGooglePhotosPickerUrl(rawUri, true),
    'https://photos.google.com/photospicker/abc-123/autoclose',
  );
});

test('Google Photos collections selection controls which memories appear on the site', async () => {
  const { dispatched } = setupBrowserMocks();
  const svc = await loadGooglePhotosService();

  const makeMockFile = (name, type, lastModified) => {
    const file = new Blob(['photo-bytes'], { type });
    Object.defineProperty(file, 'name', { value: name });
    Object.defineProperty(file, 'lastModified', { value: lastModified });
    return file;
  };

  // Import 2 photos into "Goa Trip" collection and 1 photo into "Work Notes" collection
  await svc.importFilesIntoGooglePhotosCollection(
    [
      makeMockFile('beach_sunset.jpg', 'image/jpeg', Date.UTC(2025, 1, 14)),
      makeMockFile('waves.mp4', 'video/mp4', Date.UTC(2025, 1, 15)),
    ],
    { mode: 'custom', name: 'Goa Trip' },
  );

  await svc.importFilesIntoGooglePhotosCollection(
    [makeMockFile('receipt.jpg', 'image/jpeg', Date.UTC(2025, 2, 10))],
    { mode: 'custom', name: 'Work Notes' },
  );

  const summaryInitial = svc.readGooglePhotosCollectionsSummary();
  assert.equal(summaryInitial.length, 2);
  assert.equal(svc.readSelectedGooglePhotosMemories().length, 3);

  const workCol = summaryInitial.find(c => c.name === 'Work Notes');
  const goaCol = summaryInitial.find(c => c.name === 'Goa Trip');
  assert.ok(workCol && goaCol);
  assert.equal(goaCol.photoCount, 1);
  assert.equal(goaCol.videoCount, 1);

  // Unselect "Work Notes" -> only "Goa Trip" (2 items) appears on the site
  svc.setGooglePhotosCollectionSelected(workCol.id, false);
  const visibleAfterUncheck = svc.readSelectedGooglePhotosMemories();
  assert.equal(visibleAfterUncheck.length, 2);
  assert.ok(visibleAfterUncheck.every(m => m.collectionName === 'Goa Trip'));
  assert.ok(dispatched.includes(svc.GOOGLE_PHOTOS_UPDATED_EVENT));
  assert.ok(dispatched.includes('memoriya-drive-memories-updated'));

  // Rename "Goa Trip" -> "Goa Friends 2025"
  svc.renameGooglePhotosCollection(goaCol.id, 'Goa Friends 2025');
  assert.equal(svc.readSelectedGooglePhotosMemories()[0].collectionName, 'Goa Friends 2025');
  assert.equal(svc.readSelectedGooglePhotosMemories()[0].event, 'Goa Friends 2025');

  // Hide all -> 0 visible; Show all -> 3 visible
  svc.setAllGooglePhotosCollectionsSelected(false);
  assert.equal(svc.readSelectedGooglePhotosMemories().length, 0);

  svc.setAllGooglePhotosCollectionsSelected(true);
  assert.equal(svc.readSelectedGooglePhotosMemories().length, 3);

  // Delete "Work Notes" -> 1 collection and 2 items remain
  await svc.deleteGooglePhotosCollection(workCol.id);
  assert.equal(svc.readGooglePhotosCollectionsSummary().length, 1);
  assert.equal(svc.readSelectedGooglePhotosMemories().length, 2);
});

test('Google Photos UI and archive wiring is present across all pages', async () => {
  const memoriya = await readProjectFile('src/pages/Memoriya.tsx');
  const dashboard = await readProjectFile('src/pages/Dashboard.tsx');
  const settings = await readProjectFile('src/pages/Settings.tsx');
  const timeline = await readProjectFile('src/pages/Timeline.tsx');
  const tree = await readProjectFile('src/pages/MemoryTree.tsx');
  const events = await readProjectFile('src/pages/EventExplorer.tsx');
  const story = await readProjectFile('src/pages/StoryMode.tsx');
  const modal = await readProjectFile('src/components/GooglePhotosModal.tsx');

  assert.match(memoriya, /GooglePhotosModal/);
  assert.match(memoriya, /Link Google Photos/);
  assert.match(dashboard, /GooglePhotosConnectPanel/);
  assert.match(dashboard, /readArchiveMemories/);
  assert.match(settings, /GooglePhotosConnectPanel/);
  assert.match(timeline, /readArchiveMemories/);
  assert.match(tree, /readArchiveMemories/);
  assert.match(events, /readArchiveMemories/);
  assert.match(story, /readSelectedGooglePhotosMemories/);
  assert.match(modal, /photospicker|createGooglePhotosPickerSession/);
  assert.match(modal, /Appears on Site/);
});
