import type { Memory } from '../data/memories';

export const GOOGLE_PHOTOS_STORAGE_KEY = 'memoriya-google-photos-library-v1';
export const GOOGLE_PHOTOS_SESSION_KEY = 'memoriya-google-photos-session-v3';
export const GOOGLE_PHOTOS_CLIENT_ID_KEY = 'memoriya-google-client-id-override-v1';
export const GOOGLE_PHOTOS_UPDATED_EVENT = 'memoriya-google-photos-updated';
export const GOOGLE_PHOTOS_WEB_URL = 'https://photos.google.com';

const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

// Official active Google Photos scopes (post-March-2025):
// NOTE: `photoslibrary.readonly` was retired by Google and causes OAuth 400 `invalid_scope`.
// - photospicker.mediaitems.readonly: pick existing photos/albums from photos.google.com
// - photoslibrary.appendonly: create albums/collections & upload photos/videos to Google Photos
// - photoslibrary.readonly.appcreateddata: list albums & photos created/uploaded by Memoriya automatically
const GOOGLE_PHOTOS_LIBRARY_SCOPE = [
  'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
  'https://www.googleapis.com/auth/photoslibrary.appendonly',
  'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
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

const PHOTOS_LIBRARY_FORBIDDEN_KEY = 'memoriya-gphotos-lib-forbidden-v1';
const photosLibraryForbiddenTokens = new Set<string>();

export const isPhotosLibraryForbidden = (token: string): boolean => {
  if (!token) return false;
  if (photosLibraryForbiddenTokens.has(token)) return true;
  if (!hasWindow()) return false;
  try {
    return window.sessionStorage.getItem(PHOTOS_LIBRARY_FORBIDDEN_KEY) === token;
  } catch {
    return false;
  }
};

const markPhotosLibraryForbidden = (token: string): void => {
  if (!token) return;
  photosLibraryForbiddenTokens.add(token);
  if (!hasWindow()) return;
  try {
    window.sessionStorage.setItem(PHOTOS_LIBRARY_FORBIDDEN_KEY, token);
  } catch {
    // Optional session storage.
  }
};

export const readGooglePhotosAccessToken = (): string => {
  if (!hasWindow()) return '';
  try {
    const raw =
      window.sessionStorage.getItem(GOOGLE_PHOTOS_SESSION_KEY) ||
      window.localStorage.getItem(GOOGLE_PHOTOS_SESSION_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { accessToken?: string; expiresAt?: number };
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      window.sessionStorage.removeItem(GOOGLE_PHOTOS_SESSION_KEY);
      window.localStorage.removeItem(GOOGLE_PHOTOS_SESSION_KEY);
      return '';
    }
    return parsed.accessToken || '';
  } catch {
    return '';
  }
};

export const saveGooglePhotosAccessToken = (accessToken: string, expiresInSec = 3500): void => {
  if (!hasWindow()) return;
  // A freshly granted token must never stay marked as forbidden from a prior failed scope.
  photosLibraryForbiddenTokens.delete(accessToken);
  try {
    window.sessionStorage.removeItem(PHOTOS_LIBRARY_FORBIDDEN_KEY);
  } catch {
    // Session storage is optional.
  }
  try {
    if (!accessToken) {
      window.sessionStorage.removeItem(GOOGLE_PHOTOS_SESSION_KEY);
      window.localStorage.removeItem(GOOGLE_PHOTOS_SESSION_KEY);
      return;
    }
    const payload = JSON.stringify({
      accessToken,
      expiresAt: Date.now() + Math.max(60, expiresInSec - 60) * 1000,
    });
    window.sessionStorage.setItem(GOOGLE_PHOTOS_SESSION_KEY, payload);
    window.localStorage.setItem(GOOGLE_PHOTOS_SESSION_KEY, payload);
  } catch {
    // Storage is optional.
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
  if (typeof document !== 'undefined') {
    void loadGoogleIdentityScript().catch(() => undefined);
  }
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
  if (!isGooglePhotosConnected()) return [];
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
    .filter(col => {
      const colItems = itemsByCollection.get(col.id) || [];
      if (!col.remoteAlbumId && colItems.length === 0 && col.name === 'Memoriya Photos') {
        return false;
      }
      return true;
    })
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

export const disconnectGooglePhotos = async (clearImportedCollections = true): Promise<void> => {
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

    let settled = false;
    let pollTimer = 0;
    let timeoutTimer = 0;
    const finish = (cb: () => void) => {
      if (settled) return;
      settled = true;
      if (pollTimer) window.clearInterval(pollTimer);
      if (timeoutTimer) window.clearTimeout(timeoutTimer);
      cb();
    };

    timeoutTimer = window.setTimeout(() => {
      if ((window as unknown as GoogleOAuthWindow).google?.accounts?.oauth2) finish(resolve);
      else finish(() => reject(new Error('Google Sign-In took too long to load. Check your connection and try again.')));
    }, 12_000);

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_URL}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true' || win.google?.accounts?.oauth2) {
        finish(resolve);
        return;
      }
      existing.addEventListener(
        'load',
        () => {
          existing.dataset.loaded = 'true';
          finish(resolve);
        },
        { once: true },
      );
      existing.addEventListener(
        'error',
        () => finish(() => reject(new Error('Could not load Google Sign-In. Check your internet connection.'))),
        { once: true },
      );
      pollTimer = window.setInterval(() => {
        if ((window as unknown as GoogleOAuthWindow).google?.accounts?.oauth2) {
          existing.dataset.loaded = 'true';
          finish(resolve);
        }
      }, 40);
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.dataset.loaded = 'false';
    script.onload = () => {
      script.dataset.loaded = 'true';
      finish(resolve);
    };
    script.onerror = () =>
      finish(() => reject(new Error('Could not load Google Sign-In. Check your internet connection.')));
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
        const blocked = err.type === 'popup_failed_to_open';
        finish(() =>
          reject(
            new Error(
              closed
                ? 'Google sign-in window was closed.'
                : blocked
                  ? 'Google sign-in popup was blocked by your browser. Allow popups for this site and click Connect Google Photos again.'
                  : err.message || 'Google sign-in failed.',
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

  if (!(window as unknown as GoogleOAuthWindow).google?.accounts?.oauth2) {
    await loadGoogleIdentityScript();
  }

  const desiredPrompt =
    typeof options?.prompt === 'string'
      ? options.prompt
      : options?.selectAccount
        ? 'select_account'
        : '';

  const primaryScope = options?.usePickerScope
    ? GOOGLE_PHOTOS_PICKER_SCOPE
    : GOOGLE_PHOTOS_LIBRARY_SCOPE;

  // Launch exactly ONE OAuth popup synchronously inside the user's click gesture.
  // Never open a second fallback popup after `await` (browsers block post-await popups).
  const tokenResult = await requestOAuthTokenWithScope(
    clientId,
    primaryScope,
    desiredPrompt,
    options?.loginHint,
  );

  saveGooglePhotosAccessToken(tokenResult.accessToken, tokenResult.expiresIn);
  const profile = await fetchGoogleUserProfile(tokenResult.accessToken);
  const state = readGooglePhotosState();
  const prevEmail = (state.account?.email || '').trim().toLowerCase();
  const nextEmail = (profile?.email || '').trim().toLowerCase();
  if (prevEmail && nextEmail && prevEmail !== nextEmail) {
    state.collections = [];
    state.items = [];
    state.activeCollectionId = '';
  }
  state.account = profile || state.account || {
    email: options?.loginHint || 'Google Photos Connected',
    connectedAt: new Date().toISOString(),
  };
  // Remove any legacy predefined empty placeholder collections; only real collections from Google account should appear.
  const usedCollectionIds = new Set(state.items.map(i => i.collectionId));
  state.collections = state.collections.filter(
    col => Boolean(col.remoteAlbumId) || usedCollectionIds.has(col.id),
  );
  writeGooglePhotosState(state);

  return { accessToken: tokenResult.accessToken, account: state.account };
};

export const refreshGooglePhotosAccessToken = async (silent = true): Promise<string> => {
  const clientId = getConfiguredGoogleClientId();
  if (!clientId || !hasWindow()) return '';
  const state = readGooglePhotosState();
  const hint = state.account?.email || undefined;
  try {
    await loadGoogleIdentityScript();
    const tokenResult = await requestOAuthTokenWithScope(
      clientId,
      GOOGLE_PHOTOS_LIBRARY_SCOPE,
      silent ? '' : 'select_account',
      hint,
    );
    saveGooglePhotosAccessToken(tokenResult.accessToken, tokenResult.expiresIn);
    return tokenResult.accessToken;
  } catch {
    return '';
  }
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

const fetchAllRemoteGoogleAlbums = async (
  accessToken: string,
): Promise<{ ok: boolean; expired: boolean; forbidden: boolean; albums: RemoteGoogleAlbum[] }> => {
  if (!accessToken || isPhotosLibraryForbidden(accessToken)) {
    return { ok: false, expired: false, forbidden: true, albums: [] };
  }
  const albums: RemoteGoogleAlbum[] = [];
  let pageToken = '';
  let anyOk = false;
  let expired = false;
  let forbidden = false;

  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ pageSize: '50' });
    if (pageToken) params.set('pageToken', pageToken);
    try {
      const res = await fetch(
        `https://photoslibrary.googleapis.com/v1/albums?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        if (res.status === 401) {
          expired = true;
          saveGooglePhotosAccessToken('');
        } else if (res.status === 403) {
          forbidden = true;
          markPhotosLibraryForbidden(accessToken);
        }
        break;
      }
      anyOk = true;
      const json = (await res.json()) as {
        albums?: RemoteGoogleAlbum[];
        nextPageToken?: string;
      };
      if (Array.isArray(json.albums)) {
        albums.push(...json.albums);
      }
      if (!json.nextPageToken) break;
      pageToken = json.nextPageToken;
    } catch {
      break;
    }
  }

  return { ok: anyOk, expired, forbidden, albums };
};

const fetchRemoteAlbumMediaItems = async (
  accessToken: string,
  remoteAlbumId: string,
): Promise<{ ok: boolean; items: RemoteGoogleMediaItem[] }> => {
  if (!accessToken || isPhotosLibraryForbidden(accessToken)) {
    return { ok: false, items: [] };
  }
  const items: RemoteGoogleMediaItem[] = [];
  let pageToken = '';
  let anyOk = false;

  for (let page = 0; page < 15; page += 1) {
    const body: Record<string, unknown> = {
      albumId: remoteAlbumId,
      pageSize: 100,
    };
    if (pageToken) body.pageToken = pageToken;
    try {
      const res = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (res.status === 401) saveGooglePhotosAccessToken('');
        else if (res.status === 403) markPhotosLibraryForbidden(accessToken);
        break;
      }
      anyOk = true;
      const json = (await res.json()) as {
        mediaItems?: RemoteGoogleMediaItem[];
        nextPageToken?: string;
      };
      if (Array.isArray(json.mediaItems)) {
        items.push(...json.mediaItems);
      }
      if (!json.nextPageToken) break;
      pageToken = json.nextPageToken;
    } catch {
      break;
    }
  }

  return { ok: anyOk, items };
};

const fetchAllRemoteLibraryMediaItems = async (
  accessToken: string,
): Promise<{ ok: boolean; items: RemoteGoogleMediaItem[] }> => {
  if (!accessToken || isPhotosLibraryForbidden(accessToken)) {
    return { ok: false, items: [] };
  }
  const items: RemoteGoogleMediaItem[] = [];
  let pageToken = '';
  let anyOk = false;

  for (let page = 0; page < 15; page += 1) {
    const params = new URLSearchParams({ pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    try {
      const res = await fetch(
        `https://photoslibrary.googleapis.com/v1/mediaItems?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        if (res.status === 401) saveGooglePhotosAccessToken('');
        else if (res.status === 403) markPhotosLibraryForbidden(accessToken);
        break;
      }
      anyOk = true;
      const json = (await res.json()) as {
        mediaItems?: RemoteGoogleMediaItem[];
        nextPageToken?: string;
      };
      if (Array.isArray(json.mediaItems)) {
        items.push(...json.mediaItems);
      }
      if (!json.nextPageToken) break;
      pageToken = json.nextPageToken;
    } catch {
      break;
    }
  }

  return { ok: anyOk, items };
};

const buildLibrarySignature = (state: GooglePhotosPersistedState): string => {
  const cols = state.collections
    .map(c => `${c.id}:${c.name}:${c.selected ? 1 : 0}:${c.remoteAlbumId || ''}`)
    .join('|');
  const items = state.items
    .map(i => `${i.googlePhotoId}:${i.remoteMediaItemId || ''}:${i.collectionId}:${i.title}:${i.date}`)
    .join('|');
  return `${state.activeCollectionId || ''}#${cols}#${items}`;
};

let liveSyncBusy = false;

/**
 * Syncs Google Photos albums (collections) and media items directly from the user's Google account —
 * never pre-defining empty collections and NEVER opening background popups.
 */
export const syncGooglePhotosLibrary = async (
  accessToken: string,
  targetCollectionId?: string,
  options?: { background?: boolean },
): Promise<GooglePhotosSyncResult> => {
  void requestPersistentBrowserStorage();
  const state = readGooglePhotosState();
  const previousSignature = buildLibrarySignature(state);

  if (typeof targetCollectionId === 'string') {
    state.activeCollectionId = targetCollectionId;
  }

  // Strip any legacy empty predefined collections before reading real Google account collections.
  const initialItemCollectionIds = new Set(state.items.map(i => i.collectionId));
  state.collections = state.collections.filter(
    col => Boolean(col.remoteAlbumId) || initialItemCollectionIds.has(col.id),
  );

  const workingToken = accessToken;
  let cloudSyncActive = false;
  let importedCount = 0;

  if (workingToken && !isPhotosLibraryForbidden(workingToken)) {
    // 1. Read all albums / collections directly from the user's Google account.
    // Never call requestAccessToken here — browser popup blockers block non-gesture OAuth popups.
    const albumListing = await fetchAllRemoteGoogleAlbums(workingToken);

    if (albumListing.ok) {
      cloudSyncActive = true;
      const liveRemoteAlbumIds = new Set<string>();
      for (const remoteAlbum of albumListing.albums) {
        if (!remoteAlbum.id || !remoteAlbum.title) continue;
        liveRemoteAlbumIds.add(remoteAlbum.id);
        upsertCollectionInState(state, remoteAlbum.title, 'cloud-album', remoteAlbum.id);
      }
      // Remove stale cloud-album entries deleted from the Google account (unless holding local picker items)
      const localItemColIds = new Set(
        state.items.filter(i => !i.remoteMediaItemId).map(i => i.collectionId),
      );
      state.collections = state.collections.filter(
        col =>
          !col.remoteAlbumId ||
          liveRemoteAlbumIds.has(col.remoteAlbumId) ||
          localItemColIds.has(col.id),
      );
    }

    // Index existing items by BOTH googlePhotoId and remoteMediaItemId so local uploads merge seamlessly
    const existingByRemoteOrPhotoId = new Map<string, StoredGooglePhotoItem>();
    state.items.forEach(item => {
      existingByRemoteOrPhotoId.set(item.googlePhotoId, item);
      if (item.remoteMediaItemId) {
        existingByRemoteOrPhotoId.set(item.remoteMediaItemId, item);
      }
    });

    const queuedEntries: Array<{
      remote: RemoteGoogleMediaItem;
      collection: GooglePhotosCollection;
    }> = [];
    const seenRemoteIds = new Set<string>();

    // 2. Read all photos inside each collection from the Google account
    const remoteCollections = state.collections.filter(col => Boolean(col.remoteAlbumId));
    const orderedRemoteCollections = state.activeCollectionId
      ? [
          ...remoteCollections.filter(c => c.id === state.activeCollectionId),
          ...remoteCollections.filter(c => c.id !== state.activeCollectionId),
        ]
      : remoteCollections;

    for (const col of orderedRemoteCollections) {
      if (!col.remoteAlbumId) continue;
      const albumMedia = await fetchRemoteAlbumMediaItems(workingToken, col.remoteAlbumId);
      if (albumMedia.ok) {
        cloudSyncActive = true;
        for (const remote of albumMedia.items) {
          if (!remote.id || !remote.baseUrl || seenRemoteIds.has(remote.id)) continue;
          seenRemoteIds.add(remote.id);
          queuedEntries.push({ remote, collection: col });
        }
      }
    }

    // 3. Also read general library photos from the Google account (for photos not inside a named album)
    const chosenCol = state.activeCollectionId
      ? state.collections.find(c => c.id === state.activeCollectionId)
      : undefined;

    let scannedFullLibrary = false;
    if (!chosenCol || !chosenCol.remoteAlbumId) {
      const libraryMedia = await fetchAllRemoteLibraryMediaItems(workingToken);
      if (libraryMedia.ok) {
        cloudSyncActive = true;
        scannedFullLibrary = true;
        const unalbumed = libraryMedia.items.filter(
          remote => Boolean(remote.id && remote.baseUrl && !seenRemoteIds.has(remote.id)),
        );
        if (unalbumed.length > 0) {
          // Only create a library collection when real un-albumed photos exist in the Google account.
          const generalCol = upsertCollectionInState(state, 'Google Photos', 'cloud-album');
          for (const remote of unalbumed) {
            if (!remote.id) continue;
            seenRemoteIds.add(remote.id);
            queuedEntries.push({ remote, collection: generalCol });
          }
        }
      }
    }

    // Reconcile kept local items vs remote cloud items (pruning remote items deleted in Google Photos)
    const nextByPrimaryId = new Map<string, StoredGooglePhotoItem>();
    state.items.forEach(item => {
      if (item.remoteMediaItemId) {
        // If we completed a full library scan and this remote item no longer exists, drop it cleanly
        if (scannedFullLibrary && !seenRemoteIds.has(item.remoteMediaItemId)) {
          const hydrated = hydratedBlobUrls.get(item.googlePhotoId);
          if (hydrated) {
            URL.revokeObjectURL(hydrated.url);
            if (hydrated.thumbnailUrl !== hydrated.url) URL.revokeObjectURL(hydrated.thumbnailUrl);
            hydratedBlobUrls.delete(item.googlePhotoId);
          }
          void deleteCachedGooglePhotoRecord(item.googlePhotoId);
          return;
        }
      }
      nextByPrimaryId.set(item.googlePhotoId, item);
    });

    // 4. Download & hydrate media blobs in fast concurrent batches of 6
    const CONCURRENCY = 6;
    for (let start = 0; start < queuedEntries.length; start += CONCURRENCY) {
      const batch = queuedEntries.slice(start, start + CONCURRENCY);
      await Promise.all(
        batch.map(async ({ remote, collection }) => {
          if (!remote.id || !remote.baseUrl) return;
          const existing = existingByRemoteOrPhotoId.get(remote.id);
          const googlePhotoId = existing?.googlePhotoId || remote.id;

          // Reuse cached blob from memory or IndexedDB when already downloaded
          const alreadyHydrated =
            hydratedBlobUrls.has(googlePhotoId) ||
            Boolean(await ensureHydratedGooglePhotoUrls(googlePhotoId));

          const mimeType = (remote.mimeType || existing?.mimeType || 'image/jpeg').toLowerCase();
          const isVideo = mimeType.startsWith('video/') || Boolean(remote.mediaMetadata?.video);

          let finalMimeType = existing?.mimeType || mimeType;
          if (!alreadyHydrated) {
            const cleanBase = remote.baseUrl.replace(/=[^/]*$/, '');
            const thumbBlob = await downloadAuthedBlob(`${cleanBase}=w720-h720`, workingToken);
            const fullBlob = isVideo
              ? (await downloadAuthedBlob(`${cleanBase}=dv`, workingToken)) || thumbBlob
              : (await downloadAuthedBlob(`${cleanBase}=w2048-h2048`, workingToken)) || thumbBlob;

            if (!fullBlob) return;

            finalMimeType = fullBlob.type || mimeType;
            await writeCachedGooglePhotoRecord({
              id: googlePhotoId,
              mimeType: finalMimeType,
              blob: fullBlob,
              thumbnailBlob: thumbBlob || undefined,
              savedAt: Date.now(),
            });
            registerBlobInMemory(googlePhotoId, fullBlob, thumbBlob || undefined);
            importedCount += 1;
          }

          const isoDate = normalizePhotoDate(remote.mediaMetadata?.creationTime || existing?.date);
          const parsedDate = new Date(isoDate);
          const title =
            (remote.filename || existing?.title || 'Google Photo').replace(/\.[^.]+$/, '') ||
            'Google Photo';
          const width = Number(remote.mediaMetadata?.width) || existing?.width || undefined;
          const height = Number(remote.mediaMetadata?.height) || existing?.height || undefined;

          const storedItem: StoredGooglePhotoItem = {
            id: existing?.id || `gphoto-${googlePhotoId}`,
            googlePhotoId,
            remoteMediaItemId: remote.id,
            collectionId: collection.id,
            collectionName: collection.name,
            title,
            caption: `Google Photos · ${collection.name}`,
            date: isoDate,
            year: parsedDate.getFullYear(),
            month: parsedDate.getMonth() + 1,
            type: isVideo ? 'video' : 'photo',
            mimeType: finalMimeType,
            width,
            height,
            tags: ['google-photos', isVideo ? 'video' : 'photo', collection.name],
            event: collection.name,
            remoteProductUrl: remote.productUrl,
          };
          nextByPrimaryId.set(googlePhotoId, storedItem);
        }),
      );
    }

    state.items = Array.from(nextByPrimaryId.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }

  // Ensure collection selection reflects activeCollectionId ('' = show all Google account collections)
  if (
    state.activeCollectionId &&
    !state.collections.some(col => col.id === state.activeCollectionId)
  ) {
    state.activeCollectionId = '';
  }
  state.collections.forEach(col => {
    col.selected = state.activeCollectionId ? col.id === state.activeCollectionId : true;
  });

  const nextSignature = buildLibrarySignature(state);
  const changed = nextSignature !== previousSignature || importedCount > 0;
  state.lastSyncedAt = new Date().toISOString();
  writeGooglePhotosState(state, options?.background ? changed : true);

  await hydrateGooglePhotosLibrary();

  const summaries = readGooglePhotosCollectionsSummary();
  const visibleMemories = readSelectedGooglePhotosMemories();
  const activeId = readActiveGooglePhotosCollectionId();
  const activeColName = summaries.find(c => c.id === activeId)?.name;

  const message =
    visibleMemories.length > 0
      ? `Google Photos ready — ${visibleMemories.length} ${visibleMemories.length === 1 ? 'memory' : 'memories'} in ${activeColName ? `"${activeColName}"` : `${summaries.length || 1} ${summaries.length === 1 ? 'collection' : 'collections'}`}.`
      : activeColName
        ? `Google Photos connected — no photos found in "${activeColName}".`
        : 'Google Photos connected — no photos found yet. Click "Pick from Google Photos" to select existing Google Photos or "Add to Google Photos" to upload new ones.';

  return {
    connected: true,
    accessToken: workingToken,
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
 * Background live poller for Google Photos — mirrors `DriveLiveSync` so new/deleted photos
 * update automatically across Home, Memoriya, Story Mode, Timeline, Event Explorer, and Memory Tree.
 * Never opens an OAuth popup in the background (prevents browser popup-blocker console errors).
 */
export const liveSyncGooglePhotos = async (): Promise<GooglePhotosSyncResult | null> => {
  if (liveSyncBusy || !hasWindow() || !isGooglePhotosConnected()) return null;
  const token = readGooglePhotosAccessToken();
  if (!token || isPhotosLibraryForbidden(token)) return null;
  liveSyncBusy = true;
  try {
    return await syncGooglePhotosLibrary(token, undefined, { background: true });
  } catch {
    return null;
  } finally {
    liveSyncBusy = false;
  }
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
  if (!accessToken || isPhotosLibraryForbidden(accessToken)) return '';

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
    if (!res.ok) {
      if (res.status === 401) saveGooglePhotosAccessToken('');
      else if (res.status === 403) markPhotosLibraryForbidden(accessToken);
      return '';
    }
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
  if (!accessToken || isPhotosLibraryForbidden(accessToken)) return '';
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
    if (!uploadRes.ok) {
      if (uploadRes.status === 401) saveGooglePhotosAccessToken('');
      else if (uploadRes.status === 403) markPhotosLibraryForbidden(accessToken);
      return '';
    }
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
      upsertCollectionInState(state, 'Google Photos', 'cloud-album');
  } else if (state.activeCollectionId) {
    targetCollection =
      state.collections.find(c => c.id === state.activeCollectionId) ||
      upsertCollectionInState(state, 'Google Photos', 'cloud-album');
  } else if (state.collections.length > 0) {
    targetCollection = state.collections[0];
  } else {
    targetCollection = upsertCollectionInState(state, 'Google Photos', 'cloud-album');
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
      const detail = await res.text().catch(() => '');
      if (res.status === 400 || res.status === 404) {
        throw new Error(
          'No photos found in Google Photos yet — use "Add to Google Photos" or Camera to add your first photo.',
        );
      }
      if (res.status === 401) {
        saveGooglePhotosAccessToken('');
        throw new Error('Your Google Photos session expired. Click "Sync Google Photos" once, then try again.');
      }
      if (res.status === 403 && /SERVICE_DISABLED|has not been used|disabled/i.test(detail)) {
        throw new Error(
          'Enable "Google Photos Picker API" in Google Cloud Console (APIs & Services → Library → Google Photos Picker API → Enable), or use "Add to Google Photos" right now.',
        );
      }
      throw new Error(
        'Google Photos Picker permission was not granted yet — click "Sync Google Photos" and approve Google Photos access, or use "Add to Google Photos" right now.',
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
  // Avoid reading cross-origin `popupWindow.closed` (triggers COOP console warnings in Chrome).
  // Google Photos `/autoclose` closes the window when the user clicks Done, returning focus here.
  const maxWaitMs = 5 * 60 * 1000;

  while (Date.now() - startedAt < maxWaitMs) {
    if (options?.signal?.aborted) return false;
    const status = await checkGooglePhotosPickerSessionOnce(session.sessionId, accessToken);
    options?.onTick?.();
    if (status.mediaItemsSet) return true;
    intervalMs = status.pollIntervalMs;

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

/**
 * 1-click Google Photos cloud selector (no custom modal) for pulling existing photos
 * that were uploaded directly inside photos.google.com, immediately showing them across
 * the site and syncing them into the user's cloud collection.
 */
export const pickFromGooglePhotosCloud = async (options?: {
  accessToken?: string;
  collectionId?: string;
  popupWindow?: Window | null;
  onStatus?: (message: string) => void;
}): Promise<{
  importedCount: number;
  collectionName: string;
  syncedToCloud: boolean;
}> => {
  const popup = options?.popupWindow || null;
  try {
    const token = options?.accessToken || readGooglePhotosAccessToken();
    if (!token) {
      throw new Error('Your Google Photos session expired. Click "Sync Google Photos" once, then click "Pick from Google Photos".');
    }

    const session = await createGooglePhotosPickerSession(token);

    if (popup) {
      popup.location.href = session.autoCloseUri;
      popup.focus();
    } else if (hasWindow()) {
      window.open(session.autoCloseUri, 'memoriya-gphotos-picker', 'width=980,height=740');
    }

    options?.onStatus?.(
      'Select your photos in Google Photos and click "Done" — Memoriya will update automatically...',
    );

    const ready = await waitForGooglePhotosPickerSelection(session, token, {
      popupWindow: popup,
    });

    if (!ready) {
      return { importedCount: 0, collectionName: 'Google Photos', syncedToCloud: false };
    }

    options?.onStatus?.('Importing selected photos from Google Photos...');

    const allItems: Array<{
      id?: string;
      createTime?: string;
      type?: string;
      mediaFile?: { baseUrl?: string; mimeType?: string; filename?: string };
    }> = [];
    let pageToken = '';
    for (let page = 0; page < 15; page += 1) {
      const params = new URLSearchParams({
        sessionId: session.sessionId,
        pageSize: '100',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await fetch(
        `https://photospicker.googleapis.com/v1/mediaItems?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) break;
      const json = (await res.json()) as {
        mediaItems?: typeof allItems;
        nextPageToken?: string;
      };
      if (Array.isArray(json.mediaItems)) {
        allItems.push(...json.mediaItems);
      }
      if (!json.nextPageToken) break;
      pageToken = json.nextPageToken;
    }

    if (!allItems.length) {
      return { importedCount: 0, collectionName: 'Google Photos', syncedToCloud: false };
    }

    const files: File[] = [];
    const CONCURRENCY = 6;
    for (let start = 0; start < allItems.length; start += CONCURRENCY) {
      const batch = allItems.slice(start, start + CONCURRENCY);
      const downloaded = await Promise.all(
        batch.map(async (it, offset) => {
          const base = it.mediaFile?.baseUrl;
          if (!base) return null;
          const isVideo =
            it.type === 'VIDEO' ||
            (it.mediaFile?.mimeType || '').toLowerCase().startsWith('video/');
          const cleanBase = base.replace(/=[^/]*$/, '');
          const blob = await downloadAuthedBlob(
            isVideo ? `${cleanBase}=dv` : `${cleanBase}=w2048-h2048`,
            token,
          );
          if (!blob) return null;
          const fname =
            it.mediaFile?.filename ||
            `google-photo-${start + offset + 1}.${isVideo ? 'mp4' : 'jpg'}`;
          return new File([blob], fname, {
            type: blob.type || it.mediaFile?.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
            lastModified: it.createTime ? new Date(it.createTime).getTime() : Date.now(),
          });
        }),
      );
      downloaded.forEach(file => {
        if (file) files.push(file);
      });
    }

    if (!files.length) {
      return { importedCount: 0, collectionName: 'Google Photos', syncedToCloud: false };
    }

    const uploaded = await uploadFilesToGooglePhotosCollection(files, {
      collectionId: options?.collectionId || readActiveGooglePhotosCollectionId() || undefined,
      accessToken: token,
      source: 'picker',
    });

    return {
      importedCount: uploaded.importedCount,
      collectionName: uploaded.collection?.name || 'Google Photos',
      syncedToCloud: uploaded.syncedToCloud,
    };
  } catch (err) {
    if (popup) {
      try {
        popup.close();
      } catch {
        // Ignore close error if cross-origin.
      }
    }
    throw err;
  }
};

