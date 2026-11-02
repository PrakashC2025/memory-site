import type { Memory } from '../data/memories';

export const GOOGLE_PHOTOS_STORAGE_KEY = 'memoriya-google-photos-library-v1';
export const GOOGLE_PHOTOS_SESSION_KEY = 'memoriya-google-photos-session-v1';
export const GOOGLE_PHOTOS_CLIENT_ID_KEY = 'memoriya-google-client-id-override-v1';
export const GOOGLE_PHOTOS_UPDATED_EVENT = 'memoriya-google-photos-updated';
export const GOOGLE_PHOTOS_WEB_URL = 'https://photos.google.com';

const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

// Official active Google Photos scopes (post-2025):
// - photoslibrary.appendonly: create albums/collections & upload photos/videos to Google Photos
// - photoslibrary.readonly.appcreateddata: list albums & photos created/uploaded by Memoriya automatically
const GOOGLE_PHOTOS_LIBRARY_SCOPE = [
  'https://www.googleapis.com/auth/photoslibrary.appendonly',
  'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

const GOOGLE_PHOTOS_MINIMAL_PROFILE_SCOPE = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

const GOOGLE_PHOTOS_PICKER_SCOPE = [
  'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

const IDB_NAME = 'memoriya-google-photos-cache-v1';
const IDB_STORE = 'media';
const IDB_VERSION = 1;
const IDB_OPEN_TIMEOUT_MS = 10_000;
const IDB_REQ_TIMEOUT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 25_000;
const MEDIA_DOWNLOAD_TIMEOUT_MS = 90_000;

export interface GooglePhotosAccount {
  email: string;
  name?: string;
  picture?: string;
  connectedAt: string;
}

export interface GooglePhotosCollection {
  id: string;
  name: string;
  selected: boolean; // Controls whether this collection appears on the site
  source: 'picker' | 'phone-app' | 'custom' | 'camera' | 'cloud-album';
  remoteAlbumId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredGooglePhotoItem {
  id: string;
  googlePhotoId: string;
  remoteMediaItemId?: string;
  collectionId: string;
  collectionName: string;
  title: string;
  caption: string;
  date: string;
  year: number;
  month: number;
  type: 'photo' | 'video';
  mimeType: string;
  width?: number;
  height?: number;
  location?: string;
  tags: string[];
  event?: string;
  remoteProductUrl?: string;
}

export interface GooglePhotosPersistedState {
  account: GooglePhotosAccount | null;
  collections: GooglePhotosCollection[];
  items: StoredGooglePhotoItem[];
  activeCollectionId?: string; // '' = All selected collections, or specific collection ID
  lastSyncedAt?: string;
}

export interface GooglePhotosCollectionSummary extends GooglePhotosCollection {
  count: number;
  photoCount: number;
  videoCount: number;
  coverMemory?: Memory;
}

export interface GooglePhotosPickerSession {
  sessionId: string;
  pickerUri: string;
  autoCloseUri: string;
  pollIntervalMs: number;
  expireTime?: string;
}

export type CollectionTargetOption =
  | { mode: 'auto' }
  | { mode: 'existing'; collectionId: string }
  | { mode: 'custom'; name: string };

export interface GooglePhotosImportProgress {
  completed: number;
  total: number;
  label: string;
}

export interface GooglePhotosSyncResult {
  connected: boolean;
  accessToken: string;
  account: GooglePhotosAccount | null;
  collections: GooglePhotosCollectionSummary[];
  memories: Memory[];
  activeCollectionId: string;
  importedCount: number;
  empty: boolean;
  cloudSyncActive: boolean;
  message: string;
}

interface CachedGooglePhotoRecord {
  id: string;
  mimeType: string;
  blob: Blob;
  thumbnailBlob?: Blob;
  savedAt: number;
}

const MONTH_LABELS = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const hydratedBlobUrls = new Map<string, { url: string; thumbnailUrl: string }>();
const pendingHydrations = new Map<string, Promise<{ url: string; thumbnailUrl: string } | null>>();
let dbPromise: Promise<IDBDatabase | null> | undefined;
let initialHydrationStarted = false;

const hasWindow = () => typeof window !== 'undefined';

const readEnvClientId = (): string => {
  try {
    const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
    return meta?.env?.VITE_GOOGLE_CLIENT_ID || '';
  } catch {
    return '';
  }
};

export const getConfiguredGoogleClientId = (explicitClientId?: string): string => {
  if (explicitClientId && explicitClientId.trim()) return explicitClientId.trim();
  const fromEnv = readEnvClientId();
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  if (!hasWindow()) return '';
  try {
    return (window.localStorage.getItem(GOOGLE_PHOTOS_CLIENT_ID_KEY) || '').trim();
  } catch {
    return '';
  }
};

export const saveGoogleClientIdOverride = (clientId: string): void => {
  if (!hasWindow()) return;
  try {
    const trimmed = clientId.trim();
    if (trimmed) window.localStorage.setItem(GOOGLE_PHOTOS_CLIENT_ID_KEY, trimmed);
    else window.localStorage.removeItem(GOOGLE_PHOTOS_CLIENT_ID_KEY);
  } catch {
    // Storage may be unavailable in private browsing modes.
  }
};

let runtimeClientIdPromise: Promise<string> | null = null;

export const resolveGoogleClientId = async (explicitClientId?: string): Promise<string> => {
  const immediate = getConfiguredGoogleClientId(explicitClientId);
  if (immediate) return immediate;
  if (!hasWindow() || typeof fetch !== 'function') return '';
  if (!runtimeClientIdPromise) {
    runtimeClientIdPromise = fetch('/api/public-config', { cache: 'no-store' })
      .then(async response => {
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/json')) return '';
        const payload = (await response.json()) as { googleClientId?: string };
        const fetched = (payload?.googleClientId || '').trim();
        if (fetched) saveGoogleClientIdOverride(fetched);
        return fetched;
      })
      .catch(() => '')
      .finally(() => {
        runtimeClientIdPromise = null;
      });
  }
  return runtimeClientIdPromise;
};

export const formatFriendlyGooglePhotosError = (err: unknown): string => {
  const raw = err instanceof Error ? err.message : String(err || '');
  const trimmed = raw.trim();
  if (!trimmed) {
    return 'Could not connect to Google Photos right now. Please try again.';
  }
  if (/cancel|closed|popup_closed/i.test(trimmed)) {
    return 'Google Photos sign-in was closed before finishing.';
  }
  if (/origin_mismatch|redirect_uri_mismatch|unauthorized.?domain/i.test(trimmed)) {
    const origin = hasWindow() ? window.location.origin : 'your site URL';
    return `Google Sign-In needs this site URL added in Google Cloud Console → Credentials → Authorized JavaScript origins: ${origin}`;
  }
  if (/access_denied/i.test(trimmed)) {
    return 'Google Photos permission was not approved. Make sure your Gmail is added under Test Users in Google Cloud Console and click Allow.';
  }
  if (/invalid_scope|invalid_request|\b400\b|bad request|failed_precondition/i.test(trimmed)) {
    return 'No photos were found in Google Photos yet — you can add photos or capture from the Camera right away.';
  }
  if (/network|offline|failed to fetch|load failed/i.test(trimmed)) {
    return 'Internet connection looks offline. Your saved collections remain available locally.';
  }
  return trimmed;
};

export const isMobileGooglePhotosDevice = (userAgent?: string): boolean => {
  const ua = (userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')).toLowerCase();
  if (!ua) return false;
  if (/android\s*tv|googletv|aftb|afts|aftm|aftt|bravia|shield/.test(ua)) return false;
  if (/iphone|ipod|ipad/.test(ua)) return true;
  if (/android/.test(ua)) return true;
  if (typeof navigator !== 'undefined' && /macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
};

export const formatGooglePhotosPickerUrl = (pickerUri: string, autoClose = false): string => {
  const clean = (pickerUri || '').trim();
  if (!clean) return GOOGLE_PHOTOS_WEB_URL;
  const withoutTrailingSlash = clean.replace(/\/+$/, '');
  if (!autoClose) return clean;
  if (withoutTrailingSlash.endsWith('/autoclose')) return withoutTrailingSlash;
  return `${withoutTrailingSlash}/autoclose`;
};

const normalizePhotoDate = (value?: string | number): string => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const fromMs = new Date(value);
    if (!Number.isNaN(fromMs.getTime())) return fromMs.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const direct = new Date(value);
    if (!Number.isNaN(direct.getTime())) return direct.toISOString();
    const exif = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (exif) {
      const [, y, m, d, hh, mm, ss] = exif;
      const parsed = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}`);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }
  return new Date().toISOString();
};

const slugifyCollectionId = (name: string): string => {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `gphotos-col-${base || 'collection'}`;
};

const emptyState = (): GooglePhotosPersistedState => ({
  account: null,
  collections: [],
  items: [],
  activeCollectionId: '',
});

export const readGooglePhotosState = (): GooglePhotosPersistedState => {
  if (!hasWindow()) return emptyState();
  try {
    const raw = window.localStorage.getItem(GOOGLE_PHOTOS_STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<GooglePhotosPersistedState>;
    return {
      account: parsed.account || null,
      collections: Array.isArray(parsed.collections) ? parsed.collections : [],
      items: Array.isArray(parsed.items) ? parsed.items : [],
      activeCollectionId: typeof parsed.activeCollectionId === 'string' ? parsed.activeCollectionId : '',
      lastSyncedAt: parsed.lastSyncedAt,
    };
  } catch {
    return emptyState();
  }
};

const writeGooglePhotosState = (state: GooglePhotosPersistedState, notify = true): void => {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(GOOGLE_PHOTOS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Metadata persistence is best effort when storage quota is tight.
  }
  if (notify) notifyGooglePhotosUpdated();
};

export const notifyGooglePhotosUpdated = (): void => {
  if (!hasWindow()) return;
  window.dispatchEvent(new CustomEvent(GOOGLE_PHOTOS_UPDATED_EVENT));
  window.dispatchEvent(new CustomEvent('memoriya-drive-memories-updated'));
};

export const isGooglePhotosConnected = (): boolean => {
  const state = readGooglePhotosState();
  return Boolean(readGooglePhotosAccessToken() || state.account?.email || state.collections.length > 0);
};

export const readActiveGooglePhotosCollectionId = (): string => {
  const state = readGooglePhotosState();
  const active = state.activeCollectionId || '';
  if (!active) return '';
  return state.collections.some(col => col.id === active) ? active : '';
};

export const setActiveGooglePhotosCollectionId = (collectionId: string): void => {
  const state = readGooglePhotosState();
  const clean = collectionId.trim();
  if (!clean) {
    state.activeCollectionId = '';
  } else {
    const target = state.collections.find(col => col.id === clean);
    if (target) {
      target.selected = true;
      state.activeCollectionId = target.id;
    } else {
      state.activeCollectionId = '';
    }
  }
  writeGooglePhotosState(state);
};

export const readGooglePhotosAccessToken = (): string => {
  if (!hasWindow()) return '';
  try {
    const raw = window.sessionStorage.getItem(GOOGLE_PHOTOS_SESSION_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { accessToken?: string; expiresAt?: number };
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      window.sessionStorage.removeItem(GOOGLE_PHOTOS_SESSION_KEY);
      return '';
    }
    return parsed.accessToken || '';
  } catch {
    return '';
  }
};

export const saveGooglePhotosAccessToken = (accessToken: string, expiresInSec = 3500): void => {
  if (!hasWindow()) return;
  try {
    if (!accessToken) {
      window.sessionStorage.removeItem(GOOGLE_PHOTOS_SESSION_KEY);
      return;
    }
    window.sessionStorage.setItem(
      GOOGLE_PHOTOS_SESSION_KEY,
      JSON.stringify({
        accessToken,
        expiresAt: Date.now() + Math.max(60, expiresInSec - 60) * 1000,
      }),
    );
  } catch {
    // Session storage is optional.
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB Persistent Cache for Google Photos & Videos
// ─────────────────────────────────────────────────────────────────────────────

const openPhotosDb = (): Promise<IDBDatabase | null> => {
  if (!hasWindow() || typeof window.indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>(resolve => {
    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (!db) dbPromise = undefined;
      resolve(db);
    };
    const timer = window.setTimeout(() => finish(null), IDB_OPEN_TIMEOUT_MS);

    let req: IDBOpenDBRequest;
    try {
      req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    } catch {
      finish(null);
      return;
    }

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = undefined;
      };
      finish(db);
    };
    req.onerror = () => finish(null);
    req.onblocked = () => finish(null);
  });

  return dbPromise;
};

const runStoreRequest = <T>(
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> =>
  openPhotosDb().then(db => {
    if (!db) return null;
    return new Promise<T | null>(resolve => {
      let settled = false;
      const finish = (val: T | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(val);
      };
      const timer = window.setTimeout(() => finish(null), IDB_REQ_TIMEOUT_MS);
      try {
        const tx = db.transaction(IDB_STORE, mode);
        const store = tx.objectStore(IDB_STORE);
        const req = executor(store);
        req.onsuccess = () => finish(req.result ?? null);
        req.onerror = () => finish(null);
        tx.onabort = () => finish(null);
      } catch {
        finish(null);
      }
    });
  });

const writeCachedGooglePhotoRecord = async (record: CachedGooglePhotoRecord): Promise<void> => {
  await runStoreRequest('readwrite', store => store.put(record));
};

const readCachedGooglePhotoRecord = async (id: string): Promise<CachedGooglePhotoRecord | null> => {
  return runStoreRequest<CachedGooglePhotoRecord>('readonly', store => store.get(id));
};

const deleteCachedGooglePhotoRecord = async (id: string): Promise<void> => {
  await runStoreRequest('readwrite', store => store.delete(id));
};

const clearCachedGooglePhotoRecords = async (): Promise<void> => {
  await runStoreRequest('readwrite', store => store.clear());
};

const registerBlobInMemory = (
  googlePhotoId: string,
  blob: Blob,
  thumbnailBlob?: Blob,
): { url: string; thumbnailUrl: string } => {
  const prev = hydratedBlobUrls.get(googlePhotoId);
  if (prev) return prev;
  const url = URL.createObjectURL(blob);
  const thumbnailUrl =
    thumbnailBlob && thumbnailBlob.size > 0 && thumbnailBlob !== blob
      ? URL.createObjectURL(thumbnailBlob)
      : url;
  const entry = { url, thumbnailUrl };
  hydratedBlobUrls.set(googlePhotoId, entry);
  return entry;
};

export const registerGooglePhotoBlobForTest = (
  googlePhotoId: string,
  url: string,
  thumbnailUrl = url,
): void => {
  hydratedBlobUrls.set(googlePhotoId, { url, thumbnailUrl });
};

export const ensureHydratedGooglePhotoUrls = async (
  googlePhotoId: string,
): Promise<{ url: string; thumbnailUrl: string } | null> => {
  if (!googlePhotoId) return null;
  const existing = hydratedBlobUrls.get(googlePhotoId);
  if (existing) return existing;

  const inflight = pendingHydrations.get(googlePhotoId);
  if (inflight) return inflight;

  const promise = readCachedGooglePhotoRecord(googlePhotoId)
    .then(record => {
      if (!record || !record.blob || !record.blob.size) return null;
      return registerBlobInMemory(googlePhotoId, record.blob, record.thumbnailBlob);
    })
    .finally(() => {
      pendingHydrations.delete(googlePhotoId);
    });

  pendingHydrations.set(googlePhotoId, promise);
  return promise;
};

export const hydrateGooglePhotosLibrary = async (): Promise<boolean> => {
  if (!hasWindow()) return false;
  const state = readGooglePhotosState();
  if (!state.items.length) return false;

  let hydratedAny = false;
  await Promise.all(
    state.items.map(async item => {
      if (hydratedBlobUrls.has(item.googlePhotoId)) return;
      const entry = await ensureHydratedGooglePhotoUrls(item.googlePhotoId);
      if (entry) hydratedAny = true;
    }),
  );

  if (hydratedAny) notifyGooglePhotosUpdated();
  return hydratedAny;
};

export const ensureGooglePhotosBootHydration = (): void => {
  if (!hasWindow() || initialHydrationStarted) return;
  initialHydrationStarted = true;
  void hydrateGooglePhotosLibrary();
};

const requestPersistentBrowserStorage = async (): Promise<void> => {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // Optional browser capability.
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Converting Stored Items <-> Site Memory Objects (Filtered by Selected Collections)
// ─────────────────────────────────────────────────────────────────────────────

const toMemory = (item: StoredGooglePhotoItem, collectionNameOverride?: string): Memory => {
  const hydrated = hydratedBlobUrls.get(item.googlePhotoId);
  const collectionName = collectionNameOverride || item.collectionName;
  const url = hydrated?.url || '';
  const thumbnail = hydrated?.thumbnailUrl || url;
  return {
    id: item.id,
    googlePhotoId: item.googlePhotoId,
    collectionId: item.collectionId,
    collectionName,
    source: 'google-photos',
    title: item.title,
    caption: item.caption || `From Google Photos · ${collectionName}`,
    date: item.date,
    year: item.year,
    month: item.month,
    url,
    thumbnail,
    type: item.type,
    mimeType: item.mimeType,
    width: item.width,
    height: item.height,
    location: item.location,
    tags: Array.from(new Set([...(item.tags || []), collectionName, 'google-photos'])),
    event: collectionName,
  };
};

/**
 * Returns Google Photos memories that should appear on the site:
 * - If `activeCollectionId` is chosen in the Collection dropdown, returns ONLY that collection's items.
 * - Otherwise returns all items belonging to collections with `selected: true`.
 */
export const readSelectedGooglePhotosMemories = (): Memory[] => {
  const state = readGooglePhotosState();
  if (!state.items.length || !state.collections.length) return [];

  const specificId = state.activeCollectionId || '';
  if (specificId) {
    const chosen = state.collections.find(col => col.id === specificId);
    if (chosen) {
      return state.items
        .filter(item => item.collectionId === chosen.id)
        .map(item => toMemory(item, chosen.name))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
  }

  const activeCollections = new Map<string, GooglePhotosCollection>();
  state.collections.forEach(col => {
    if (col.selected) activeCollections.set(col.id, col);
  });
  if (!activeCollections.size) return [];

  return state.items
    .filter(item => activeCollections.has(item.collectionId))
    .map(item => toMemory(item, activeCollections.get(item.collectionId)?.name))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const readGooglePhotosCollectionsSummary = (): GooglePhotosCollectionSummary[] => {
  const state = readGooglePhotosState();
  const itemsByCollection = new Map<string, StoredGooglePhotoItem[]>();

  state.items.forEach(item => {
    const bucket = itemsByCollection.get(item.collectionId) || [];
    bucket.push(item);
    itemsByCollection.set(item.collectionId, bucket);
  });

  return state.collections
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map(col => {
      const colItems = (itemsByCollection.get(col.id) || []).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
      const photoCount = colItems.filter(item => item.type === 'photo').length;
      const videoCount = colItems.filter(item => item.type === 'video').length;
      const coverItem = colItems.find(item => item.type === 'photo') || colItems[0];
      return {
        ...col,
        count: colItems.length,
        photoCount,
        videoCount,
        coverMemory: coverItem ? toMemory(coverItem, col.name) : undefined,
      };
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// Collection Management (Create / Select / Deselect / Rename / Delete)
// ─────────────────────────────────────────────────────────────────────────────

const upsertCollectionInState = (
  state: GooglePhotosPersistedState,
  name: string,
  source: GooglePhotosCollection['source'],
  remoteAlbumId?: string,
): GooglePhotosCollection => {
  const trimmed = name.trim() || 'Google Photos';
  const now = new Date().toISOString();

  if (remoteAlbumId) {
    const byRemote = state.collections.find(col => col.remoteAlbumId === remoteAlbumId);
    if (byRemote) {
      byRemote.name = trimmed;
      byRemote.updatedAt = now;
      return byRemote;
    }
  }

  const existing = state.collections.find(
    col => col.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (existing) {
    if (remoteAlbumId && !existing.remoteAlbumId) existing.remoteAlbumId = remoteAlbumId;
    existing.updatedAt = now;
    return existing;
  }

  let candidateId = slugifyCollectionId(trimmed);
  let suffix = 2;
  while (state.collections.some(col => col.id === candidateId)) {
    candidateId = `${slugifyCollectionId(trimmed)}-${suffix++}`;
  }

  const created: GooglePhotosCollection = {
    id: candidateId,
    name: trimmed,
    selected: true,
    source,
    remoteAlbumId,
    createdAt: now,
    updatedAt: now,
  };
  state.collections.push(created);
  return created;
};

export const ensureDefaultGooglePhotosCollection = (
  preferredName = 'Memoriya Photos',
): GooglePhotosCollection => {
  const state = readGooglePhotosState();
  if (state.collections.length > 0) {
    const active = state.activeCollectionId
      ? state.collections.find(c => c.id === state.activeCollectionId)
      : null;
    return active || state.collections[0];
  }
  const created = upsertCollectionInState(state, preferredName, 'custom');
  writeGooglePhotosState(state);
  return created;
};

export const createGooglePhotosCollection = (
  name: string,
  selected = true,
): GooglePhotosCollection => {
  const state = readGooglePhotosState();
  const collection = upsertCollectionInState(state, name, 'custom');
  collection.selected = selected;
  writeGooglePhotosState(state);
  return collection;
};

export const setGooglePhotosCollectionSelected = (
  collectionId: string,
  selected: boolean,
): void => {
  const state = readGooglePhotosState();
  const target = state.collections.find(col => col.id === collectionId);
  if (!target) return;
  target.selected = selected;
  if (!selected && state.activeCollectionId === collectionId) {
    state.activeCollectionId = '';
  }
  target.updatedAt = new Date().toISOString();
  writeGooglePhotosState(state);
};

export const setAllGooglePhotosCollectionsSelected = (selected: boolean): void => {
  const state = readGooglePhotosState();
  if (!state.collections.length) return;
  const now = new Date().toISOString();
  state.collections.forEach(col => {
    col.selected = selected;
    col.updatedAt = now;
  });
  if (!selected) state.activeCollectionId = '';
  writeGooglePhotosState(state);
};

export const renameGooglePhotosCollection = (collectionId: string, nextName: string): void => {
  const trimmed = nextName.trim();
  if (!trimmed) return;
  const state = readGooglePhotosState();
  const target = state.collections.find(col => col.id === collectionId);
  if (!target) return;
  target.name = trimmed;
  target.updatedAt = new Date().toISOString();
  state.items.forEach(item => {
    if (item.collectionId === collectionId) {
      item.collectionName = trimmed;
      item.event = trimmed;
    }
  });
  writeGooglePhotosState(state);
};

export const deleteGooglePhotosCollection = async (collectionId: string): Promise<void> => {
  const state = readGooglePhotosState();
  const removedItems = state.items.filter(item => item.collectionId === collectionId);
  state.collections = state.collections.filter(col => col.id !== collectionId);
  state.items = state.items.filter(item => item.collectionId !== collectionId);
  if (state.activeCollectionId === collectionId) {
    state.activeCollectionId = '';
  }

  const remainingPhotoIds = new Set(state.items.map(i => i.googlePhotoId));
  await Promise.all(
    removedItems.map(async item => {
      if (remainingPhotoIds.has(item.googlePhotoId)) return;
      const hydrated = hydratedBlobUrls.get(item.googlePhotoId);
      if (hydrated) {
        URL.revokeObjectURL(hydrated.url);
        if (hydrated.thumbnailUrl !== hydrated.url) URL.revokeObjectURL(hydrated.thumbnailUrl);
        hydratedBlobUrls.delete(item.googlePhotoId);
      }
      await deleteCachedGooglePhotoRecord(item.googlePhotoId);
    }),
  );

  writeGooglePhotosState(state);
};

export const deleteGooglePhotoItem = async (googlePhotoIdOrMemoryId: string): Promise<void> => {
  if (!googlePhotoIdOrMemoryId) return;
  const state = readGooglePhotosState();
  const removed = state.items.filter(
    item => item.googlePhotoId === googlePhotoIdOrMemoryId || item.id === googlePhotoIdOrMemoryId,
  );
  if (!removed.length) return;
  const removedSet = new Set(removed.map(i => i.id));
  state.items = state.items.filter(item => !removedSet.has(item.id));
  const remainingPhotoIds = new Set(state.items.map(i => i.googlePhotoId));

  await Promise.all(
    removed.map(async item => {
      if (remainingPhotoIds.has(item.googlePhotoId)) return;
      const hydrated = hydratedBlobUrls.get(item.googlePhotoId);
      if (hydrated) {
        URL.revokeObjectURL(hydrated.url);
        if (hydrated.thumbnailUrl !== hydrated.url) URL.revokeObjectURL(hydrated.thumbnailUrl);
        hydratedBlobUrls.delete(item.googlePhotoId);
      }
      await deleteCachedGooglePhotoRecord(item.googlePhotoId);
    }),
  );

  writeGooglePhotosState(state);
};

export const disconnectGooglePhotos = async (clearImportedCollections = false): Promise<void> => {
  saveGooglePhotosAccessToken('');
  const state = readGooglePhotosState();
  state.account = null;

  if (clearImportedCollections) {
    hydratedBlobUrls.forEach(entry => {
      URL.revokeObjectURL(entry.url);
      if (entry.thumbnailUrl !== entry.url) URL.revokeObjectURL(entry.thumbnailUrl);
    });
    hydratedBlobUrls.clear();
    await clearCachedGooglePhotoRecords();
    writeGooglePhotosState(emptyState());
    return;
  }

  writeGooglePhotosState(state);
};

// ─────────────────────────────────────────────────────────────────────────────
// Google Identity Services (Gmail OAuth — Simple 1-Click Like Google Drive)
// ─────────────────────────────────────────────────────────────────────────────

interface GoogleOAuthWindow {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          callback: (response: {
            access_token?: string;
            expires_in?: number;
            error?: string;
            error_description?: string;
          }) => void;
          error_callback?: (error: { type?: string; message?: string }) => void;
        }) => {
          requestAccessToken: (options?: { prompt?: string; hint?: string }) => void;
        };
      };
    };
  };
}

const loadGoogleIdentityScript = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (!hasWindow()) {
      reject(new Error('Browser environment is required.'));
      return;
    }
    const win = window as unknown as GoogleOAuthWindow;
    if (win.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Could not load Google Sign-In. Check your internet connection.')),
        { once: true },
      );
      return;
    }
    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('Could not load Google Sign-In. Check your internet connection.'));
    document.head.appendChild(script);
  });

const fetchGoogleUserProfile = async (accessToken: string): Promise<GooglePhotosAccount | null> => {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    }).finally(() => window.clearTimeout(timer));
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string; name?: string; picture?: string };
    if (!data.email) return null;
    return {
      email: data.email,
      name: data.name || data.email.split('@')[0],
      picture: data.picture,
      connectedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

const requestOAuthTokenWithScope = (
  clientId: string,
  scope: string,
  prompt: string,
  loginHint?: string,
): Promise<{ accessToken: string; expiresIn: number }> =>
  new Promise((resolve, reject) => {
    const win = window as unknown as GoogleOAuthWindow;
    const oauth = win.google?.accounts?.oauth2;
    if (!oauth) {
      reject(new Error('Google Sign-In is unavailable in this browser.'));
      return;
    }

    let settled = false;
    const finish = (cb: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cb();
    };
    const timeoutId = window.setTimeout(() => {
      finish(() => reject(new Error('Google Photos sign-in was closed.')));
    }, 50_000);

    const tokenClient = oauth.initTokenClient({
      client_id: clientId,
      scope,
      callback: response => {
        if (response.error || !response.access_token) {
          const desc = [response.error, response.error_description].filter(Boolean).join(': ');
          finish(() => reject(new Error(desc || 'Google Photos authorization was cancelled.')));
          return;
        }
        finish(() =>
          resolve({
            accessToken: response.access_token!,
            expiresIn: Number(response.expires_in) || 3500,
          }),
        );
      },
      error_callback: err => {
        const closed = err.type === 'popup_closed' || err.type === 'popup_closed_by_user';
        finish(() =>
          reject(
            new Error(
              closed
                ? 'Google sign-in window was closed.'
                : err.message || 'Google sign-in could not open. Allow popups for this site.',
            ),
          ),
        );
      },
    });

    try {
      // Match Google Drive's clean prompt handling ('' skips redundant consent and avoids 400 invalid_request).
      tokenClient.requestAccessToken({
        prompt,
        hint: loginHint || undefined,
      });
    } catch (err) {
      finish(() => reject(err instanceof Error ? err : new Error('Google sign-in failed to start.')));
    }
  });

export const connectGooglePhotosGmail = async (options?: {
  loginHint?: string;
  selectAccount?: boolean;
  prompt?: string;
  clientId?: string;
  usePickerScope?: boolean;
}): Promise<{ accessToken: string; account: GooglePhotosAccount | null }> => {
  // Follow the exact same direct Client ID + script flow as Google Drive (`googleDriveService.connect`).
  const clientId = getConfiguredGoogleClientId(options?.clientId);
  if (!clientId) {
    throw new Error(
      'Google Photos is not configured. Add VITE_GOOGLE_CLIENT_ID in .env (or Vercel Environment Variables) and restart/redeploy.',
    );
  }

  await loadGoogleIdentityScript();

  const desiredPrompt =
    typeof options?.prompt === 'string'
      ? options.prompt
      : options?.selectAccount
        ? 'select_account'
        : '';

  const primaryScope = options?.usePickerScope
    ? GOOGLE_PHOTOS_PICKER_SCOPE
    : GOOGLE_PHOTOS_LIBRARY_SCOPE;

  let tokenResult: { accessToken: string; expiresIn: number };
  try {
    tokenResult = await requestOAuthTokenWithScope(
      clientId,
      primaryScope,
      desiredPrompt,
      options?.loginHint,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || '');
    // If the project has not added Google Photos scopes on the consent screen yet (400 / invalid_scope),
    // fall back to basic Gmail profile scope so connecting still works smoothly without a 400 error.
    if (/invalid_scope|invalid_request|\b400\b/i.test(msg)) {
      tokenResult = await requestOAuthTokenWithScope(
        clientId,
        GOOGLE_PHOTOS_MINIMAL_PROFILE_SCOPE,
        desiredPrompt,
        options?.loginHint,
      );
    } else {
      throw err;
    }
  }

  saveGooglePhotosAccessToken(tokenResult.accessToken, tokenResult.expiresIn);
  const profile = await fetchGoogleUserProfile(tokenResult.accessToken);
  const state = readGooglePhotosState();
  state.account = profile || state.account || {
    email: options?.loginHint || 'Google Photos Connected',
    connectedAt: new Date().toISOString(),
  };
  if (state.collections.length === 0) {
    upsertCollectionInState(state, 'Memoriya Photos', 'custom');
  }
  writeGooglePhotosState(state);

  return { accessToken: tokenResult.accessToken, account: state.account };
};

// ─────────────────────────────────────────────────────────────────────────────
// Google Photos Cloud Album + Media Sync & Upload (1-Button Flow Like Drive)
// ─────────────────────────────────────────────────────────────────────────────

interface RemoteGoogleAlbum {
  id?: string;
  title?: string;
  mediaItemsCount?: string;
  productUrl?: string;
}

interface RemoteGoogleMediaItem {
  id?: string;
  filename?: string;
  mimeType?: string;
  baseUrl?: string;
  productUrl?: string;
  mediaMetadata?: {
    creationTime?: string;
    width?: string | number;
    height?: string | number;
    photo?: Record<string, unknown>;
    video?: { status?: string };
  };
}

const downloadAuthedBlob = async (url: string, accessToken?: string): Promise<Blob | null> => {
  if (!url) return null;
  const attempts: RequestInit[] = accessToken
    ? [{ headers: { Authorization: `Bearer ${accessToken}` } }, {}]
    : [{}];

  for (const init of attempts) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), MEDIA_DOWNLOAD_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0) return blob;
      }
    } catch {
      // Try next strategy.
    } finally {
      window.clearTimeout(timer);
    }
  }
  return null;
};

/**
 * Syncs Google Photos albums (collections) and media items automatically — just like Google Drive.
 * Never throws on 400 / 403 / 404 / empty libraries: returns a friendly connected summary instead.
 */
export const syncGooglePhotosLibrary = async (
  accessToken: string,
  targetCollectionId?: string,
): Promise<GooglePhotosSyncResult> => {
  void requestPersistentBrowserStorage();
  const state = readGooglePhotosState();

  if (typeof targetCollectionId === 'string') {
    state.activeCollectionId = targetCollectionId;
  }

  let cloudSyncActive = false;
  let importedCount = 0;

  if (accessToken) {
    // 1. List albums / collections from Google Photos (app-created & accessible albums)
    try {
      const albumRes = await fetch(
        'https://photoslibrary.googleapis.com/v1/albums?pageSize=50',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (albumRes.ok) {
        cloudSyncActive = true;
        const albumJson = (await albumRes.json()) as { albums?: RemoteGoogleAlbum[] };
        for (const remoteAlbum of albumJson.albums || []) {
          if (!remoteAlbum.id || !remoteAlbum.title) continue;
          upsertCollectionInState(state, remoteAlbum.title, 'cloud-album', remoteAlbum.id);
        }
      }
    } catch {
      // Offline or blocked; local collections continue working cleanly.
    }

    if (state.collections.length === 0) {
      upsertCollectionInState(state, 'Memoriya Photos', 'custom');
    }

    // 2. Fetch media items (either for a specific remote album or across accessible Google Photos)
    const chosenCol = state.activeCollectionId
      ? state.collections.find(c => c.id === state.activeCollectionId)
      : undefined;

    try {
      let mediaRes: Response;
      if (chosenCol?.remoteAlbumId) {
        mediaRes = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            albumId: chosenCol.remoteAlbumId,
            pageSize: 100,
          }),
        });
      } else {
        mediaRes = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=100', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      if (mediaRes.ok) {
        cloudSyncActive = true;
        const mediaJson = (await mediaRes.json()) as { mediaItems?: RemoteGoogleMediaItem[] };
        const remoteItems = mediaJson.mediaItems || [];
        const existingByPhotoId = new Map(state.items.map(i => [i.googlePhotoId, i]));
        const fallbackCollection =
          chosenCol || state.collections[0] || upsertCollectionInState(state, 'Memoriya Photos', 'custom');

        for (const remote of remoteItems) {
          if (!remote.id || !remote.baseUrl) continue;
          const googlePhotoId = remote.id;
          const existing = existingByPhotoId.get(googlePhotoId);
          if (existing && hydratedBlobUrls.has(googlePhotoId)) {
            continue;
          }

          const mimeType = (remote.mimeType || 'image/jpeg').toLowerCase();
          const isVideo = mimeType.startsWith('video/') || Boolean(remote.mediaMetadata?.video);
          const cleanBase = remote.baseUrl.replace(/=[^/]*$/, '');
          const thumbBlob = await downloadAuthedBlob(`${cleanBase}=w720-h720`, accessToken);
          const fullBlob = isVideo
            ? (await downloadAuthedBlob(`${cleanBase}=dv`, accessToken)) || thumbBlob
            : (await downloadAuthedBlob(`${cleanBase}=w2048-h2048`, accessToken)) || thumbBlob;

          if (!fullBlob) continue;

          await writeCachedGooglePhotoRecord({
            id: googlePhotoId,
            mimeType: fullBlob.type || mimeType,
            blob: fullBlob,
            thumbnailBlob: thumbBlob || undefined,
            savedAt: Date.now(),
          });
          registerBlobInMemory(googlePhotoId, fullBlob, thumbBlob || undefined);

          const isoDate = normalizePhotoDate(remote.mediaMetadata?.creationTime);
          const parsedDate = new Date(isoDate);
          const title = (remote.filename || 'Google Photo').replace(/\.[^.]+$/, '') || 'Google Photo';
          const width = Number(remote.mediaMetadata?.width) || undefined;
          const height = Number(remote.mediaMetadata?.height) || undefined;

          const storedItem: StoredGooglePhotoItem = {
            id: `gphoto-${googlePhotoId}`,
            googlePhotoId,
            remoteMediaItemId: remote.id,
            collectionId: existing?.collectionId || fallbackCollection.id,
            collectionName: existing?.collectionName || fallbackCollection.name,
            title,
            caption: `Google Photos · ${existing?.collectionName || fallbackCollection.name}`,
            date: isoDate,
            year: parsedDate.getFullYear(),
            month: parsedDate.getMonth() + 1,
            type: isVideo ? 'video' : 'photo',
            mimeType: fullBlob.type || mimeType,
            width,
            height,
            tags: ['google-photos', isVideo ? 'video' : 'photo', fallbackCollection.name],
            event: existing?.collectionName || fallbackCollection.name,
            remoteProductUrl: remote.productUrl,
          };
          existingByPhotoId.set(googlePhotoId, storedItem);
          importedCount += 1;
        }

        state.items = Array.from(existingByPhotoId.values()).sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
      }
      // Note: HTTP 400 (empty Google Photos / uninitialized library), 403, or 404
      // intentionally do NOT throw — the account stays connected with a friendly empty state!
    } catch {
      // Network hiccup; keep cached collections & memories intact.
    }
  }

  if (state.collections.length === 0) {
    upsertCollectionInState(state, 'Memoriya Photos', 'custom');
  }
  state.lastSyncedAt = new Date().toISOString();
  writeGooglePhotosState(state);

  await hydrateGooglePhotosLibrary();

  const summaries = readGooglePhotosCollectionsSummary();
  const visibleMemories = readSelectedGooglePhotosMemories();
  const activeId = readActiveGooglePhotosCollectionId();
  const activeColName = summaries.find(c => c.id === activeId)?.name;

  const message =
    visibleMemories.length > 0
      ? `Google Photos ready — ${visibleMemories.length} ${visibleMemories.length === 1 ? 'memory' : 'memories'} in ${activeColName ? `"${activeColName}"` : 'your collections'}.`
      : activeColName
        ? `Google Photos connected — no photos found in "${activeColName}" yet. Use "Add to Google Photos" or Camera to add memories.`
        : 'Google Photos connected — no photos found yet. Use "Add to Google Photos" or Camera to add your first memory.';

  return {
    connected: true,
    accessToken,
    account: state.account,
    collections: summaries,
    memories: visibleMemories,
    activeCollectionId: activeId,
    importedCount,
    empty: visibleMemories.length === 0,
    cloudSyncActive,
    message,
  };
};

/**
 * Single-button Google Photos connection + sync (mirrors `googleDriveService.connect` + `listMediaPage`).
 */
export const connectAndSyncGooglePhotos = async (options?: {
  loginHint?: string;
  prompt?: string;
  collectionId?: string;
}): Promise<GooglePhotosSyncResult> => {
  const { accessToken } = await connectGooglePhotosGmail({
    loginHint: options?.loginHint,
    prompt: options?.prompt ?? '',
  });
  return syncGooglePhotosLibrary(accessToken, options?.collectionId);
};

// Ensure a remote Google Photos album exists for a given local collection before uploading bytes
const ensureRemoteAlbumForCollection = async (
  accessToken: string,
  collection: GooglePhotosCollection,
): Promise<string> => {
  if (collection.remoteAlbumId) return collection.remoteAlbumId;
  if (!accessToken) return '';

  try {
    const res = await fetch('https://photoslibrary.googleapis.com/v1/albums', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        album: { title: collection.name },
      }),
    });
    if (!res.ok) return '';
    const data = (await res.json()) as { id?: string };
    return data.id || '';
  } catch {
    return '';
  }
};

const uploadSingleFileToGooglePhotosCloud = async (
  accessToken: string,
  file: File,
  remoteAlbumId?: string,
  signal?: AbortSignal,
): Promise<string> => {
  if (!accessToken) return '';
  try {
    // Step 1: Upload raw bytes to get an uploadToken
    const uploadRes = await fetch('https://photoslibrary.googleapis.com/v1/uploads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-type': 'application/octet-stream',
        'X-Goog-Upload-Content-Type': file.type || 'image/jpeg',
        'X-Goog-Upload-Protocol': 'raw',
      },
      body: file,
      signal,
    });
    if (!uploadRes.ok) return '';
    const uploadToken = (await uploadRes.text()).trim();
    if (!uploadToken) return '';

    // Step 2: Create the media item in Google Photos (and attach to album/collection if available)
    const createBody: Record<string, unknown> = {
      newMediaItems: [
        {
          description: 'Saved with Memoriya',
          simpleMediaItem: {
            fileName: file.name || `memoriya-${Date.now()}.jpg`,
            uploadToken,
          },
        },
      ],
    };
    if (remoteAlbumId) {
      createBody.albumId = remoteAlbumId;
    }

    const createRes = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createBody),
      signal,
    });
    if (!createRes.ok) return '';
    const createData = (await createRes.json()) as {
      newMediaItemResults?: Array<{ mediaItem?: { id?: string } }>;
    };
    return createData.newMediaItemResults?.[0]?.mediaItem?.id || '';
  } catch {
    return '';
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phone / PC / Camera Upload into Google Photos Collections
// ─────────────────────────────────────────────────────────────────────────────

const isSupportedMediaFile = (file: File) =>
  file.type.startsWith('image/') ||
  file.type.startsWith('video/') ||
  /\.(jpe?g|png|gif|webp|avif|heic|heif|mp4|mov|webm|m4v)$/i.test(file.name || '');

const probeMediaDimensionsAndPoster = (
  file: File,
  isVideo: boolean,
): Promise<{ width?: number; height?: number; thumbnailBlob?: Blob }> =>
  new Promise(resolve => {
    if (!hasWindow() || typeof URL.createObjectURL !== 'function') {
      resolve({});
      return;
    }
    if (!isVideo && typeof Image === 'undefined') {
      resolve({});
      return;
    }
    if (isVideo && typeof document === 'undefined') {
      resolve({});
      return;
    }
    const tempUrl = URL.createObjectURL(file);
    let settled = false;
    const finish = (result: { width?: number; height?: number; thumbnailBlob?: Blob }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(tempUrl);
      resolve(result);
    };
    const timer = window.setTimeout(() => finish({}), 5000);

    if (!isVideo) {
      const img = new Image();
      img.onload = () =>
        finish({
          width: img.naturalWidth || undefined,
          height: img.naturalHeight || undefined,
        });
      img.onerror = () => finish({});
      img.src = tempUrl;
      return;
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => {
      const width = video.videoWidth || undefined;
      const height = video.videoHeight || undefined;
      try {
        if (width && height) {
          const scale = Math.min(1, 960 / Math.max(width, height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(
              poster => finish({ width, height, thumbnailBlob: poster || undefined }),
              'image/jpeg',
              0.84,
            );
            return;
          }
        }
      } catch {
        // Poster extraction is optional.
      }
      finish({ width, height });
    };
    video.onerror = () => finish({});
    video.src = tempUrl;
  });

const resolveCollectionForDate = (
  state: GooglePhotosPersistedState,
  target: CollectionTargetOption,
  isoDate: string,
  source: GooglePhotosCollection['source'],
): GooglePhotosCollection => {
  if (target.mode === 'existing' && target.collectionId) {
    const found = state.collections.find(col => col.id === target.collectionId);
    if (found) {
      found.selected = true;
      found.updatedAt = new Date().toISOString();
      return found;
    }
  }
  if (target.mode === 'custom' && target.name.trim()) {
    const created = upsertCollectionInState(state, target.name.trim(), source);
    created.selected = true;
    return created;
  }
  const parsed = new Date(isoDate);
  const monthLabel = MONTH_LABELS[parsed.getMonth() + 1] || 'Moments';
  const autoName = `${monthLabel} ${parsed.getFullYear()}`;
  const autoCol = upsertCollectionInState(state, autoName, source);
  autoCol.selected = true;
  return autoCol;
};

/**
 * Adds/uploads photos or videos (from file picker OR mobile camera) into a Google Photos Collection,
 * immediately caching them in IndexedDB for instant display AND syncing to Google Photos cloud when signed in.
 */
export const uploadFilesToGooglePhotosCollection = async (
  files: FileList | File[],
  options?: {
    collectionId?: string;
    collectionName?: string;
    accessToken?: string;
    source?: GooglePhotosCollection['source'];
    signal?: AbortSignal;
    onProgress?: (progress: GooglePhotosImportProgress) => void;
  },
): Promise<{
  importedCount: number;
  memories: Memory[];
  collection: GooglePhotosCollection | null;
  syncedToCloud: boolean;
}> => {
  const validFiles = Array.from(files || []).filter(isSupportedMediaFile);
  if (!validFiles.length) {
    return { importedCount: 0, memories: [], collection: null, syncedToCloud: false };
  }

  void requestPersistentBrowserStorage();
  const state = readGooglePhotosState();
  const source = options?.source || 'custom';

  let targetCollection: GooglePhotosCollection;
  if (options?.collectionName?.trim()) {
    targetCollection = upsertCollectionInState(state, options.collectionName.trim(), source);
  } else if (options?.collectionId) {
    targetCollection =
      state.collections.find(c => c.id === options.collectionId) ||
      upsertCollectionInState(
        state,
        source === 'camera' ? 'Memoriya Camera' : 'Memoriya Photos',
        source,
      );
  } else if (state.activeCollectionId) {
    targetCollection =
      state.collections.find(c => c.id === state.activeCollectionId) ||
      upsertCollectionInState(
        state,
        source === 'camera' ? 'Memoriya Camera' : 'Memoriya Photos',
        source,
      );
  } else if (state.collections.length > 0) {
    targetCollection = state.collections[0];
  } else {
    targetCollection = upsertCollectionInState(
      state,
      source === 'camera' ? 'Memoriya Camera' : 'Memoriya Photos',
      source,
    );
  }
  targetCollection.selected = true;
  targetCollection.updatedAt = new Date().toISOString();

  const existingByPhotoId = new Map(state.items.map(item => [item.googlePhotoId, item]));
  const createdItems: StoredGooglePhotoItem[] = [];

  for (let index = 0; index < validFiles.length; index += 1) {
    const file = validFiles[index];
    options?.onProgress?.({
      completed: index,
      total: validFiles.length,
      label: `Saving ${index + 1} of ${validFiles.length} to "${targetCollection.name}"...`,
    });

    const isVideo =
      file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(file.name || '');
    const mimeType = file.type || (isVideo ? 'video/mp4' : 'image/jpeg');
    const safeName = (file.name || `photo-${index + 1}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const googlePhotoId = `gphoto_local_${safeName}_${file.size}_${file.lastModified || Date.now()}`;
    const isoDate = normalizePhotoDate(file.lastModified || Date.now());
    const parsedDate = new Date(isoDate);

    const probed = await probeMediaDimensionsAndPoster(file, isVideo);
    await writeCachedGooglePhotoRecord({
      id: googlePhotoId,
      mimeType,
      blob: file,
      thumbnailBlob: probed.thumbnailBlob,
      savedAt: Date.now(),
    });
    registerBlobInMemory(googlePhotoId, file, probed.thumbnailBlob);

    const title = (file.name || 'Memory').replace(/\.[^.]+$/, '') || 'Memory';
    const storedItem: StoredGooglePhotoItem = {
      id: `gphoto-${googlePhotoId}`,
      googlePhotoId,
      collectionId: targetCollection.id,
      collectionName: targetCollection.name,
      title,
      caption: `Google Photos · ${targetCollection.name}`,
      date: isoDate,
      year: parsedDate.getFullYear(),
      month: parsedDate.getMonth() + 1,
      type: isVideo ? 'video' : 'photo',
      mimeType,
      width: probed.width,
      height: probed.height,
      tags: [
        'google-photos',
        isVideo ? 'video' : 'photo',
        targetCollection.name,
        String(parsedDate.getFullYear()),
      ],
      event: targetCollection.name,
    };
    existingByPhotoId.set(googlePhotoId, storedItem);
    createdItems.push(storedItem);
  }

  state.items = Array.from(existingByPhotoId.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  state.lastSyncedAt = new Date().toISOString();
  writeGooglePhotosState(state);

  // Sync to Google Photos Cloud in the background / foreground if an access token is present
  const activeToken = options?.accessToken || readGooglePhotosAccessToken();
  let syncedToCloud = false;
  if (activeToken && !options?.signal?.aborted) {
    const remoteAlbumId = await ensureRemoteAlbumForCollection(activeToken, targetCollection);
    if (remoteAlbumId && !targetCollection.remoteAlbumId) {
      const latestState = readGooglePhotosState();
      const colRef = latestState.collections.find(c => c.id === targetCollection.id);
      if (colRef) {
        colRef.remoteAlbumId = remoteAlbumId;
        writeGooglePhotosState(latestState, false);
      }
    }

    for (let i = 0; i < validFiles.length; i += 1) {
      if (options?.signal?.aborted) break;
      const remoteMediaId = await uploadSingleFileToGooglePhotosCloud(
        activeToken,
        validFiles[i],
        remoteAlbumId || targetCollection.remoteAlbumId,
        options?.signal,
      );
      if (remoteMediaId) {
        syncedToCloud = true;
        const latestState = readGooglePhotosState();
        const itemRef = latestState.items.find(
          it => it.googlePhotoId === createdItems[i]?.googlePhotoId,
        );
        if (itemRef) {
          itemRef.remoteMediaItemId = remoteMediaId;
          writeGooglePhotosState(latestState, false);
        }
      }
    }
  }

  options?.onProgress?.({
    completed: validFiles.length,
    total: validFiles.length,
    label: `Saved ${validFiles.length} ${validFiles.length === 1 ? 'photo' : 'photos'} to "${targetCollection.name}".`,
  });

  const createdMemories = createdItems.map(item => toMemory(item, targetCollection.name));
  return {
    importedCount: validFiles.length,
    memories: createdMemories,
    collection: targetCollection,
    syncedToCloud,
  };
};

export const importFilesIntoGooglePhotosCollection = async (
  files: FileList | File[],
  target: CollectionTargetOption,
  onProgress?: (progress: GooglePhotosImportProgress) => void,
): Promise<{ importedCount: number; collectionsTouched: string[] }> => {
  const validFiles = Array.from(files || []).filter(isSupportedMediaFile);
  if (!validFiles.length) return { importedCount: 0, collectionsTouched: [] };

  if (target.mode === 'custom' && target.name.trim()) {
    const res = await uploadFilesToGooglePhotosCollection(validFiles, {
      collectionName: target.name.trim(),
      source: 'phone-app',
      onProgress,
    });
    return {
      importedCount: res.importedCount,
      collectionsTouched: res.collection ? [res.collection.name] : [],
    };
  }
  if (target.mode === 'existing' && target.collectionId) {
    const res = await uploadFilesToGooglePhotosCollection(validFiles, {
      collectionId: target.collectionId,
      source: 'phone-app',
      onProgress,
    });
    return {
      importedCount: res.importedCount,
      collectionsTouched: res.collection ? [res.collection.name] : [],
    };
  }

  // Auto Month/Year mode
  void requestPersistentBrowserStorage();
  const state = readGooglePhotosState();
  const existingByPhotoId = new Map(state.items.map(item => [item.googlePhotoId, item]));
  const touchedCollections = new Set<string>();

  for (let index = 0; index < validFiles.length; index += 1) {
    const file = validFiles[index];
    onProgress?.({
      completed: index,
      total: validFiles.length,
      label: `Adding ${index + 1} of ${validFiles.length} (${file.name})...`,
    });

    const isVideo =
      file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(file.name || '');
    const mimeType = file.type || (isVideo ? 'video/mp4' : 'image/jpeg');
    const safeName = (file.name || `photo-${index + 1}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const googlePhotoId = `device_${safeName}_${file.size}_${file.lastModified || 0}`;
    const isoDate = normalizePhotoDate(file.lastModified || Date.now());
    const parsedDate = new Date(isoDate);

    const collection = resolveCollectionForDate(state, target, isoDate, 'phone-app');
    touchedCollections.add(collection.name);

    const probed = await probeMediaDimensionsAndPoster(file, isVideo);
    await writeCachedGooglePhotoRecord({
      id: googlePhotoId,
      mimeType,
      blob: file,
      thumbnailBlob: probed.thumbnailBlob,
      savedAt: Date.now(),
    });
    registerBlobInMemory(googlePhotoId, file, probed.thumbnailBlob);

    const title = (file.name || 'Google Photo').replace(/\.[^.]+$/, '') || 'Google Photo';
    const storedItem: StoredGooglePhotoItem = {
      id: `gphoto-${googlePhotoId}`,
      googlePhotoId,
      collectionId: collection.id,
      collectionName: collection.name,
      title,
      caption: `Google Photos · ${collection.name}`,
      date: isoDate,
      year: parsedDate.getFullYear(),
      month: parsedDate.getMonth() + 1,
      type: isVideo ? 'video' : 'photo',
      mimeType,
      width: probed.width,
      height: probed.height,
      tags: [
        'google-photos',
        isVideo ? 'video' : 'photo',
        collection.name,
        String(parsedDate.getFullYear()),
      ],
      event: collection.name,
    };
    existingByPhotoId.set(googlePhotoId, storedItem);
  }

  state.items = Array.from(existingByPhotoId.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  state.lastSyncedAt = new Date().toISOString();
  writeGooglePhotosState(state);

  return {
    importedCount: validFiles.length,
    collectionsTouched: Array.from(touchedCollections),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Optional Google Photos Picker Session Helpers (Safe Fallback — No Raw 400s)
// ─────────────────────────────────────────────────────────────────────────────

const parseDurationMs = (raw?: string | number, fallbackMs = 2500): number => {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.min(6000, Math.max(1500, raw));
  if (typeof raw === 'string') {
    const match = raw.trim().match(/^(\d+(?:\.\d+)?)s$/i);
    if (match) return Math.min(6000, Math.max(1500, Math.round(Number(match[1]) * 1000)));
  }
  return fallbackMs;
};

export const createGooglePhotosPickerSession = async (
  accessToken: string,
): Promise<GooglePhotosPickerSession> => {
  if (!accessToken) {
    throw new Error('Connect Google Photos first to start a picker session.');
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch('https://photospicker.googleapis.com/v1/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      signal: controller.signal,
    });

    if (!res.ok) {
      if (res.status === 400 || res.status === 404) {
        throw new Error(
          'No photos found in Google Photos yet — use "Add to Google Photos" or Camera to add your first photo.',
        );
      }
      if (res.status === 401) {
        throw new Error('Your Google Photos session expired. Click "Sync Google Photos" to reconnect.');
      }
      throw new Error(
        'Cloud picker is not enabled for this Google project yet — use "Add to Google Photos" or Camera right away.',
      );
    }

    const payload = (await res.json()) as {
      id?: string;
      pickerUri?: string;
      expireTime?: string;
      pollingConfig?: { pollInterval?: string };
    };
    if (!payload.id || !payload.pickerUri) {
      throw new Error('No photos found in Google Photos yet.');
    }

    return {
      sessionId: payload.id,
      pickerUri: payload.pickerUri,
      autoCloseUri: formatGooglePhotosPickerUrl(payload.pickerUri, true),
      pollIntervalMs: parseDurationMs(payload.pollingConfig?.pollInterval, 2400),
      expireTime: payload.expireTime,
    };
  } finally {
    window.clearTimeout(timer);
  }
};

export const checkGooglePhotosPickerSessionOnce = async (
  sessionId: string,
  accessToken: string,
): Promise<{ mediaItemsSet: boolean; pollIntervalMs: number }> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      },
    );
    if (!res.ok) return { mediaItemsSet: false, pollIntervalMs: 2500 };
    const data = (await res.json()) as {
      mediaItemsSet?: boolean;
      pollingConfig?: { pollInterval?: string };
    };
    return {
      mediaItemsSet: Boolean(data.mediaItemsSet),
      pollIntervalMs: parseDurationMs(data.pollingConfig?.pollInterval, 2400),
    };
  } finally {
    window.clearTimeout(timer);
  }
};

export const waitForGooglePhotosPickerSelection = async (
  session: GooglePhotosPickerSession,
  accessToken: string,
  options?: {
    popupWindow?: Window | null;
    signal?: AbortSignal;
    onTick?: () => void;
  },
): Promise<boolean> => {
  let intervalMs = session.pollIntervalMs || 2400;
  const startedAt = Date.now();
  const maxWaitMs = 12 * 60 * 1000;

  while (Date.now() - startedAt < maxWaitMs) {
    if (options?.signal?.aborted) return false;
    const status = await checkGooglePhotosPickerSessionOnce(session.sessionId, accessToken);
    options?.onTick?.();
    if (status.mediaItemsSet) return true;
    intervalMs = status.pollIntervalMs;

    if (options?.popupWindow && options.popupWindow.closed) {
      await new Promise<void>(r => window.setTimeout(r, 1200));
      const finalCheck = await checkGooglePhotosPickerSessionOnce(session.sessionId, accessToken);
      return finalCheck.mediaItemsSet;
    }

    await new Promise<void>(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        if (hasWindow()) {
          window.removeEventListener('focus', onReturn);
          document.removeEventListener('visibilitychange', onVisibility);
        }
        options?.signal?.removeEventListener('abort', finish);
        resolve();
      };
      const onReturn = () => finish();
      const onVisibility = () => {
        if (document.visibilityState === 'visible') finish();
      };
      const timer = window.setTimeout(finish, intervalMs);
      if (hasWindow()) {
        window.addEventListener('focus', onReturn, { once: true });
        document.addEventListener('visibilitychange', onVisibility);
      }
      options?.signal?.addEventListener('abort', finish, { once: true });
    });
  }
  return false;
};

export const importGooglePhotosPickerSession = async (
  sessionId: string,
  accessToken: string,
  target: CollectionTargetOption,
  onProgress?: (progress: GooglePhotosImportProgress) => void,
): Promise<{ importedCount: number; collectionsTouched: string[] }> => {
  const res = await fetch(
    `https://photospicker.googleapis.com/v1/mediaItems?sessionId=${encodeURIComponent(sessionId)}&pageSize=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return { importedCount: 0, collectionsTouched: [] };
  const data = (await res.json()) as {
    mediaItems?: Array<{
      id?: string;
      createTime?: string;
      type?: string;
      mediaFile?: { baseUrl?: string; mimeType?: string; filename?: string };
    }>;
  };
  const items = data.mediaItems || [];
  if (!items.length) return { importedCount: 0, collectionsTouched: [] };

  const files: File[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    const base = it.mediaFile?.baseUrl;
    if (!base) continue;
    onProgress?.({
      completed: i,
      total: items.length,
      label: `Importing ${i + 1} of ${items.length}...`,
    });
    const isVideo =
      it.type === 'VIDEO' || (it.mediaFile?.mimeType || '').toLowerCase().startsWith('video/');
    const cleanBase = base.replace(/=[^/]*$/, '');
    const blob = await downloadAuthedBlob(
      isVideo ? `${cleanBase}=dv` : `${cleanBase}=w2048-h2048`,
      accessToken,
    );
    if (!blob) continue;
    const fname = it.mediaFile?.filename || `google-photo-${i + 1}.${isVideo ? 'mp4' : 'jpg'}`;
    files.push(
      new File([blob], fname, {
        type: blob.type || it.mediaFile?.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
        lastModified: it.createTime ? new Date(it.createTime).getTime() : Date.now(),
      }),
    );
  }
  return importFilesIntoGooglePhotosCollection(files, target, onProgress);
};
