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
    location: { origin: 'https://memory-site.vercel.app' },
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

test('Google Photos handles 400 and empty libraries gracefully with friendly no-photos state', async () => {
  setupBrowserMocks();
  const svc = await loadGooglePhotosService();

  // Simulate Google Photos API returning HTTP 400 FAILED_PRECONDITION on an empty/new account
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { code: 400, status: 'FAILED_PRECONDITION' } }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });

  try {
    const syncRes = await svc.syncGooglePhotosLibrary('mock-access-token');
    assert.equal(syncRes.connected, true);
    assert.equal(syncRes.empty, true);
    assert.match(syncRes.message, /no photos found/i);
    assert.doesNotMatch(syncRes.message, /\b400\b/);
    // Ensures default collection is automatically ready for uploads & camera
    assert.ok(syncRes.collections.length >= 1);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Friendly error translator never leaks raw 400 error codes
  assert.match(svc.formatFriendlyGooglePhotosError(new Error('Request failed with 400')), /no photos were found/i);
  assert.match(svc.formatFriendlyGooglePhotosError(new Error('origin_mismatch')), /Authorized JavaScript origins/i);
});

test('Google Photos collection dropdown, upload, and camera capture sync to collections', async () => {
  const { dispatched } = setupBrowserMocks();
  const svc = await loadGooglePhotosService();

  const makeMockFile = (name, type, lastModified) => {
    const file = new Blob(['photo-bytes'], { type });
    Object.defineProperty(file, 'name', { value: name });
    Object.defineProperty(file, 'lastModified', { value: lastModified });
    return file;
  };

  // Mock Google Photos cloud endpoints (albums create, raw byte uploads, mediaItems:batchCreate)
  const originalFetch = globalThis.fetch;
  const cloudCalls = [];
  globalThis.fetch = async (url, init) => {
    cloudCalls.push(String(url));
    if (String(url).endsWith('/v1/albums')) {
      return new Response(JSON.stringify({ id: 'remote-album-camera-1' }), { status: 200 });
    }
    if (String(url).endsWith('/v1/uploads')) {
      return new Response('upload-token-xyz', { status: 200 });
    }
    if (String(url).includes('mediaItems:batchCreate')) {
      return new Response(
        JSON.stringify({ newMediaItemResults: [{ mediaItem: { id: 'remote-media-1' } }] }),
        { status: 200 },
      );
    }
    return new Response('{}', { status: 200 });
  };

  try {
    // 1. Upload a camera capture into "Camera Memories" collection with cloud token
    const camUpload = await svc.uploadFilesToGooglePhotosCollection(
      [makeMockFile('camera-shot.jpg', 'image/jpeg', Date.UTC(2026, 2, 10))],
      {
        collectionName: 'Camera Memories',
        accessToken: 'valid-token',
        source: 'camera',
      },
    );
    assert.equal(camUpload.importedCount, 1);
    assert.equal(camUpload.syncedToCloud, true);
    assert.equal(camUpload.collection?.name, 'Camera Memories');
    assert.ok(cloudCalls.some(u => u.endsWith('/v1/uploads')));
    assert.ok(cloudCalls.some(u => u.includes('mediaItems:batchCreate')));

    // 2. Upload 2 photos into "Goa Trip" collection
    const tripUpload = await svc.uploadFilesToGooglePhotosCollection(
      [
        makeMockFile('beach.jpg', 'image/jpeg', Date.UTC(2026, 1, 14)),
        makeMockFile('sunset.mp4', 'video/mp4', Date.UTC(2026, 1, 15)),
      ],
      { collectionName: 'Goa Trip', accessToken: 'valid-token' },
    );
    assert.equal(tripUpload.importedCount, 2);

    // All collections selected -> 3 total memories visible
    assert.equal(svc.readSelectedGooglePhotosMemories().length, 3);

    // Choose "Camera Memories" in the Collection dropdown -> only that 1 camera photo appears on site
    svc.setActiveGooglePhotosCollectionId(camUpload.collection.id);
    assert.equal(svc.readSelectedGooglePhotosMemories().length, 1);
    assert.equal(svc.readSelectedGooglePhotosMemories()[0].collectionName, 'Camera Memories');

    // Switch back to "All collections" -> all 3 appear again
    svc.setActiveGooglePhotosCollectionId('');
    assert.equal(svc.readSelectedGooglePhotosMemories().length, 3);
    assert.ok(dispatched.includes(svc.GOOGLE_PHOTOS_UPDATED_EVENT));

    // Delete single camera item -> 2 remain
    await svc.deleteGooglePhotoItem(camUpload.memories[0].googlePhotoId);
    assert.equal(svc.readSelectedGooglePhotosMemories().length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Simple 1-button Google Photos UI and Camera destination options are wired across pages', async () => {
  const memoriya = await readProjectFile('src/pages/Memoriya.tsx');
  const camera = await readProjectFile('src/components/DriveCameraCapture.tsx');
  const modal = await readProjectFile('src/components/GooglePhotosModal.tsx');
  const css = await readProjectFile('src/index.css');
  const dashboard = await readProjectFile('src/pages/Dashboard.tsx');
  const settings = await readProjectFile('src/pages/Settings.tsx');

  // No unscrollable popup modal or Client ID paste box anywhere
  assert.doesNotMatch(modal, /OAuth Client ID Setup/);
  assert.doesNotMatch(memoriya, /OAuth Client ID Setup/);

  // Simple 1-button connect + inline Collection dropdown + Add to Google Photos
  assert.match(memoriya, /Connect Google Photos/);
  assert.match(memoriya, /Choose Google Photos collection/);
  assert.match(memoriya, /Add to Google Photos/);
  assert.match(memoriya, /No photos found/);
  assert.match(memoriya, /Collection · \$\{memory\.collectionName\}/);
  assert.match(memoriya, /Folder · \$\{memory\.collectionName\}/);

  // Camera inside gives Drive / Google Photos / Both destination options + folder & collection selectors
  assert.match(camera, /memoriya-camera-destination-stack/);
  assert.match(camera, /Store: Drive/);
  assert.match(camera, /Store: Google Photos/);
  assert.match(camera, /Store: Both/);
  assert.match(camera, /Save to Drive folder/);
  assert.match(camera, /Save to Google Photos collection/);
  assert.match(css, /\.memoriya-drive-folder-select select option/);

  assert.match(dashboard, /GooglePhotosConnectPanel/);
  assert.match(settings, /GooglePhotosConnectPanel/);
});
