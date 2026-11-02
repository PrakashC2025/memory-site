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
    // Zero predefined collections when the Google account has none
    assert.equal(syncRes.collections.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Friendly error translator never leaks raw 400 error codes
  assert.match(svc.formatFriendlyGooglePhotosError(new Error('Request failed with 400')), /no photos were found/i);
  assert.match(svc.formatFriendlyGooglePhotosError(new Error('origin_mismatch')), /Authorized JavaScript origins/i);
});

test('Google Photos reads all collections and their photos directly from the connected Google account', async () => {
  setupBrowserMocks();
  const svc = await loadGooglePhotosService();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/v1/albums?')) {
      return new Response(
        JSON.stringify({
          albums: [
            { id: 'alb-trip', title: 'Family Trip', mediaItemsCount: '2' },
            { id: 'alb-wedding', title: 'Wedding', mediaItemsCount: '1' },
          ],
        }),
        { status: 200 },
      );
    }
    if (u.includes('/v1/mediaItems:search')) {
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.albumId === 'alb-trip') {
        return new Response(
          JSON.stringify({
            mediaItems: [
              {
                id: 'gp-1',
                filename: 'beach.jpg',
                mimeType: 'image/jpeg',
                baseUrl: 'https://lh3.googleusercontent.com/mock-gp-1',
                mediaMetadata: { creationTime: '2026-05-01T10:00:00Z', width: '1600', height: '1200' },
              },
              {
                id: 'gp-2',
                filename: 'hills.jpg',
                mimeType: 'image/jpeg',
                baseUrl: 'https://lh3.googleusercontent.com/mock-gp-2',
                mediaMetadata: { creationTime: '2026-05-02T10:00:00Z', width: '1600', height: '1200' },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (body.albumId === 'alb-wedding') {
        return new Response(
          JSON.stringify({
            mediaItems: [
              {
                id: 'gp-3',
                filename: 'ceremony.jpg',
                mimeType: 'image/jpeg',
                baseUrl: 'https://lh3.googleusercontent.com/mock-gp-3',
                mediaMetadata: { creationTime: '2026-06-10T15:00:00Z', width: '1200', height: '1600' },
              },
            ],
          }),
          { status: 200 },
        );
      }
    }
    if (u.includes('/v1/mediaItems?')) {
      return new Response(JSON.stringify({ mediaItems: [] }), { status: 200 });
    }
    if (u.includes('lh3.googleusercontent.com')) {
      return new Response(new Blob(['img-bytes'], { type: 'image/jpeg' }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };

  try {
    const res = await svc.syncGooglePhotosLibrary('account-token');
    assert.equal(res.collections.length, 2);
    const names = res.collections.map(c => `${c.name}:${c.count}`).sort();
    assert.deepEqual(names, ['Family Trip:2', 'Wedding:1']);
    assert.equal(res.memories.length, 3);

    // Selecting "Wedding" from the Google account collection dropdown filters to Wedding's photo
    const weddingCol = res.collections.find(c => c.name === 'Wedding');
    svc.setActiveGooglePhotosCollectionId(weddingCol.id);
    const weddingOnly = svc.readSelectedGooglePhotosMemories();
    assert.equal(weddingOnly.length, 1);
    assert.equal(weddingOnly[0].collectionName, 'Wedding');
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test('liveSyncGooglePhotos reconciles newly added and deleted Google Photos instantly like Drive', async () => {
  const { dispatched } = setupBrowserMocks();
  const svc = await loadGooglePhotosService();

  svc.saveGooglePhotosAccessToken('live-token', 3600);

  let remoteMedia = [
    {
      id: 'live-1',
      filename: 'first.jpg',
      mimeType: 'image/jpeg',
      baseUrl: 'https://lh3.googleusercontent.com/live-1',
      mediaMetadata: { creationTime: '2026-07-01T10:00:00Z', width: '1600', height: '1200' },
    },
  ];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const u = String(url);
    if (u.includes('/v1/albums?')) {
      return new Response(JSON.stringify({ albums: [{ id: 'alb-live', title: 'Live Album' }] }), { status: 200 });
    }
    if (u.includes('/v1/mediaItems:search')) {
      return new Response(JSON.stringify({ mediaItems: remoteMedia }), { status: 200 });
    }
    if (u.includes('/v1/mediaItems?')) {
      return new Response(JSON.stringify({ mediaItems: remoteMedia }), { status: 200 });
    }
    if (u.includes('lh3.googleusercontent.com')) {
      return new Response(new Blob(['img-bytes'], { type: 'image/jpeg' }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };

  try {
    // 1. Initial background live sync picks up the first photo
    const first = await svc.liveSyncGooglePhotos();
    assert.equal(first.memories.length, 1);
    assert.equal(svc.readSelectedGooglePhotosMemories()[0].title, 'first');

    // 2. Unchanged background poll does NOT spam redundant update events
    dispatched.length = 0;
    await svc.liveSyncGooglePhotos();
    assert.equal(dispatched.filter(e => e === svc.GOOGLE_PHOTOS_UPDATED_EVENT).length, 0);

    // 3. New photo added to Google Photos -> next live poll picks it up immediately & notifies UI
    remoteMedia = [
      ...remoteMedia,
      {
        id: 'live-2',
        filename: 'second-instant.jpg',
        mimeType: 'image/jpeg',
        baseUrl: 'https://lh3.googleusercontent.com/live-2',
        mediaMetadata: { creationTime: '2026-07-02T10:00:00Z', width: '1600', height: '1200' },
      },
    ];
    await svc.liveSyncGooglePhotos();
    assert.equal(svc.readSelectedGooglePhotosMemories().length, 2);
    assert.ok(dispatched.includes(svc.GOOGLE_PHOTOS_UPDATED_EVENT));

    // 4. First photo deleted in Google Photos -> next live poll removes it cleanly
    remoteMedia = [remoteMedia[1]];
    await svc.liveSyncGooglePhotos();
    assert.equal(svc.readSelectedGooglePhotosMemories().length, 1);
    assert.equal(svc.readSelectedGooglePhotosMemories()[0].title, 'second-instant');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('pickFromGooglePhotosCloud imports photos added directly in photos.google.com and syncs them', async () => {
  setupBrowserMocks();
  const svc = await loadGooglePhotosService();
  svc.saveGooglePhotosAccessToken('picker-token', 3600);

  let popupHref = '';
  let popupClosed = false;
  const mockPopup = {
    get closed() {
      return popupClosed;
    },
    location: {
      set href(v) {
        popupHref = v;
      },
      get href() {
        return popupHref;
      },
    },
    focus: () => undefined,
    close: () => {
      popupClosed = true;
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const u = String(url);
    if (u.endsWith('photospicker.googleapis.com/v1/sessions')) {
      return new Response(
        JSON.stringify({
          id: 'sess-123',
          pickerUri: 'https://photos.google.com/photospicker/sess-123',
          pollingConfig: { pollInterval: '1.5s' },
        }),
        { status: 200 },
      );
    }
    if (u.includes('photospicker.googleapis.com/v1/sessions/sess-123')) {
      return new Response(JSON.stringify({ mediaItemsSet: true }), { status: 200 });
    }
    if (u.includes('photospicker.googleapis.com/v1/mediaItems')) {
      return new Response(
        JSON.stringify({
          mediaItems: [
            {
              id: 'ext-1',
              createTime: '2026-08-01T12:00:00Z',
              type: 'PHOTO',
              mediaFile: {
                baseUrl: 'https://lh3.googleusercontent.com/ext-1',
                mimeType: 'image/jpeg',
                filename: 'direct-google-photo.jpg',
              },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (u.includes('lh3.googleusercontent.com')) {
      return new Response(new Blob(['direct-photo'], { type: 'image/jpeg' }), { status: 200 });
    }
    if (u.endsWith('/v1/albums')) {
      return new Response(JSON.stringify({ id: 'cloud-alb-1' }), { status: 200 });
    }
    if (u.endsWith('/v1/uploads')) {
      return new Response('upload-tok-1', { status: 200 });
    }
    if (u.includes('mediaItems:batchCreate')) {
      return new Response(
        JSON.stringify({ newMediaItemResults: [{ mediaItem: { id: 'cloud-item-1' } }] }),
        { status: 200 },
      );
    }
    return new Response('{}', { status: 200 });
  };

  try {
    const picked = await svc.pickFromGooglePhotosCloud({ popupWindow: mockPopup });
    assert.equal(picked.importedCount, 1);
    assert.equal(picked.syncedToCloud, true);
    assert.match(popupHref, /photos\.google\.com\/photospicker\/sess-123\/autoclose/);
    assert.equal(svc.readSelectedGooglePhotosMemories().length, 1);
    assert.equal(svc.readSelectedGooglePhotosMemories()[0].title, 'direct-google-photo');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('403 on photoslibrary.googleapis.com never wipes OAuth token, never opens background popups, and never repeats 403 polls', async () => {
  setupBrowserMocks();
  const svc = await loadGooglePhotosService();
  svc.saveGooglePhotosAccessToken('tok-403-safe', 3600);

  // Mark Google Photos account connected
  globalThis.window.localStorage.setItem(
    'memoriya-google-photos-library-v1',
    JSON.stringify({
      version: 1,
      account: { email: 'test@gmail.com', connectedAt: new Date().toISOString() },
      collections: [],
      items: [],
      activeCollectionId: '',
    }),
  );

  let photosLibraryHits = 0;
  let popupAttempted = false;
  globalThis.window.google = {
    accounts: {
      oauth2: {
        initTokenClient: () => ({
          requestAccessToken: () => {
            popupAttempted = true;
          },
        }),
      },
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const u = String(url);
    if (u.includes('photoslibrary.googleapis.com')) {
      photosLibraryHits += 1;
      return new Response(
        JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED' } }),
        { status: 403 },
      );
    }
    return new Response('{}', { status: 200 });
  };

  try {
    const res = await svc.syncGooglePhotosLibrary('tok-403-safe');
    assert.equal(res.connected, true);
    // Token MUST stay intact for Pick from Google Photos (never wiped on 403!)
    assert.equal(svc.readGooglePhotosAccessToken(), 'tok-403-safe');
    // Only 1 request (/v1/albums) should hit 403; /v1/mediaItems must be skipped immediately
    assert.equal(photosLibraryHits, 1);
    // Zero background OAuth popup attempts!
    assert.equal(popupAttempted, false);

    // Subsequent background live syncs must skip photoslibrary.googleapis.com completely (zero 403 spam)
    await svc.liveSyncGooglePhotos();
    await svc.liveSyncGooglePhotos();
    assert.equal(photosLibraryHits, 1);
    assert.equal(popupAttempted, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Both Google Drive and Google Photos OAuth linking work cleanly without GIS script deadlock or retired scopes', async () => {
  setupBrowserMocks();

  // 1. Verify Google Photos never requests retired `photoslibrary.readonly` scope (only active post-2025 scopes)
  const gphotosSource = await readProjectFile('src/services/googlePhotosService.ts');
  assert.doesNotMatch(
    gphotosSource,
    /['"]https:\/\/www\.googleapis\.com\/auth\/photoslibrary\.readonly['"]/,
  );
  assert.match(
    gphotosSource,
    /https:\/\/www\.googleapis\.com\/auth\/photospicker\.mediaitems\.readonly/,
  );

  // 2. Verify Google Drive never deadlocks when gsi/client script tag already exists without dataset.loaded
  const driveSource = (await readProjectFile('src/services/googleDriveService.ts')).replace(
    /import\.meta\.env\.VITE_GOOGLE_CLIENT_ID/g,
    '"test-client-id.apps.googleusercontent.com"',
  );
  const compiledDrive = ts.transpileModule(driveSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2018,
    },
  }).outputText;
  const driveModule = await import(
    `data:text/javascript;base64,${Buffer.from(compiledDrive).toString('base64')}`
  );

  let driveRequestedScopes = '';
  globalThis.window.google = {
    accounts: {
      oauth2: {
        initTokenClient: cfg => {
          driveRequestedScopes = cfg.scope;
          return {
            requestAccessToken: () => {
              cfg.callback({ access_token: 'drive-token-ok', expires_in: 3600 });
            },
          };
        },
      },
    },
  };

  const driveConnected = await driveModule.googleDriveService.connect();
  assert.equal(driveConnected.connected, true);
  assert.equal(driveConnected.accessToken, 'drive-token-ok');
  assert.match(driveRequestedScopes, /drive\.readonly/);

  // 3. Verify `drive-root` is normalized away in listMediaPage so Drive root files always load
  let capturedDriveUrl = '';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    capturedDriveUrl = String(url);
    return new Response(
      JSON.stringify({
        files: [{ id: 'f1', name: 'sunset.jpg', mimeType: 'image/jpeg', thumbnailLink: 'https://lh3.googleusercontent.com/t1=s220' }],
      }),
      { status: 200 },
    );
  };
  try {
    const page = await driveModule.googleDriveService.listMediaPage('drive-token-ok', '', 'drive-root');
    assert.equal(page.files.length, 1);
    assert.doesNotMatch(capturedDriveUrl, /drive-root/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 4. Verify Google Photos connectGooglePhotosGmail succeeds cleanly in 1 synchronous popup
  const photosSvc = await loadGooglePhotosService();
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ email: 'user@gmail.com', name: 'Test User' }), { status: 200 });
  try {
    const linked = await photosSvc.connectGooglePhotosGmail({ clientId: 'test-client-id.apps.googleusercontent.com' });
    assert.equal(linked.accessToken, 'drive-token-ok');
    assert.equal(linked.account?.email, 'user@gmail.com');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Disconnecting Google Photos or Google Drive removes its photos immediately and disconnecting both leaves archive empty', async () => {
  setupBrowserMocks();
  const photosSvc = await loadGooglePhotosService();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Forbidden', { status: 403 });

  try {
    const mockFile = new File([new Uint8Array([1, 2, 3, 4])], 'beach-day.jpg', {
      type: 'image/jpeg',
      lastModified: Date.UTC(2026, 5, 10),
    });
    await photosSvc.uploadFilesToGooglePhotosCollection([mockFile], {
      collectionName: 'Summer',
      accessToken: 'valid-token',
    });

    assert.equal(photosSvc.isGooglePhotosConnected(), true);
    assert.equal(photosSvc.readSelectedGooglePhotosMemories().length, 1);

    // Calling disconnectGooglePhotos() with default args must clear all Google Photos memories
    await photosSvc.disconnectGooglePhotos();
    assert.equal(photosSvc.isGooglePhotosConnected(), false);
    assert.equal(photosSvc.readSelectedGooglePhotosMemories().length, 0);
    assert.equal(photosSvc.readGooglePhotosCollectionsSummary().length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Separate red Disconnect Google Drive & Disconnect Google Photos buttons and Story Mode loaded/pics/video counts are wired cleanly', async () => {
  const [drivePanel, photosPanel, memoriya, storyMode, memoryReel, css] = await Promise.all([
    readProjectFile('src/components/DriveConnectPanel.tsx'),
    readProjectFile('src/components/GooglePhotosConnectPanel.tsx'),
    readProjectFile('src/pages/Memoriya.tsx'),
    readProjectFile('src/pages/StoryMode.tsx'),
    readProjectFile('src/components/MemoryReel.tsx'),
    readProjectFile('src/index.css'),
  ]);

  // Separate explicit red disconnect buttons across all views
  assert.match(drivePanel, /memoriya-disconnect-btn[\s\S]*Disconnect Google Drive/);
  assert.match(photosPanel, /memoriya-disconnect-btn[\s\S]*Disconnect Google Photos/);
  assert.match(memoriya, /Disconnect Google Drive/);
  assert.match(memoriya, /Disconnect Google Photos/);
  assert.doesNotMatch(memoriya, /disconnectAll/);
  assert.match(css, /\.memoriya-disconnect-btn\s*\{[\s\S]*rgba\(244,\s*63,\s*94/);

  // StoryMode clears Drive memories when Drive session disconnects
  assert.match(storyMode, /setDriveMemories\(\[\]\)/);

  // Story Mode stats HUD shows loaded/total, Pics count, and Videos count for all media sources and mobile
  assert.match(memoryReel, /className=\{`memory-reel-stats-hud/);
  assert.match(memoryReel, /\{storyLoadedCount\}\/\{storyAvailableCount\}/);
  assert.match(memoryReel, /storyPhotoCount === 1 \? 'Pic' : 'Pics'/);
  assert.match(memoryReel, /storyVideoCount === 1 \? 'Video' : 'Videos'/);
  assert.match(css, /\.memory-reel-stats-hud\s*\{/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.memory-reel-stats-hud\s*\{/);
});



