import type { Memory } from '../data/memories';

export const GOOGLE_PHOTOS_STORAGE_KEY = 'memoriya-google-photos-library-v1';
export const GOOGLE_PHOTOS_SESSION_KEY = 'memoriya-google-photos-session-v1';
export const GOOGLE_PHOTOS_CLIENT_ID_KEY = 'memoriya-google-client-id-override-v1';
export const GOOGLE_PHOTOS_UPDATED_EVENT = 'memoriya-google-photos-updated';
export const GOOGLE_PHOTOS_WEB_URL = 'https://photos.google.com';

const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
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

export type GooglePhotosCollectionSource = 'google-photos' | 'phone-app' | 'auto';

export interface GooglePhotosAccount {
  email: string;
  name?: string;
  picture?: string;
  connectedAt: string;
}

export interface GooglePhotosCollection {
  id: string;
  name: string;
  selected: boolean;
  source: GooglePhotosCollectionSource;
  createdAt: string;
  updatedAt: string;
}

export interface StoredGooglePhotoItem {
  id: string;
  googlePhotoId: string;
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
  orientation?: number;
  location?: string;
  productUrl?: string;
  tags: string[];
  event: string;
  isFavorite?: boolean;
}

export interface GooglePhotosLibraryState {
  account: GooglePhotosAccount | null;
  collections: GooglePhotosCollection[];
  items: StoredGooglePhotoItem[];
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

const hydratedBlobUrls = new Map<string, { url: string; thumbnail: string }>();
const pendingHydrations = new Map<string, Promise<{ url: string; thumbnail: string } | null>>();
let dbPromise: Promise<IDBDatabase | null> | undefined;
let initialHydrationStarted = false;

const hasWindow = () => typeof window !== 'undefined';

const readEnvClientId = (): string => {
  try {
    const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> };
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

const emptyState = (): GooglePhotosLibraryState => ({
  account: null,
  collections: [],
  items: [],
});

export const readGooglePhotosState = (): GooglePhotosLibraryState => {
  if (!hasWindow()) return emptyState();
  try {
    const raw = window.localStorage.getItem(GOOGLE_PHOTOS_STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<GooglePhotosLibraryState>;
    return {
      account: parsed.account || null,
      collections: Array.isArray(parsed.collections) ? parsed.collections : [],
      items: Array.isArray(parsed.items) ? parsed.items : [],
      lastSyncedAt: parsed.lastSyncedAt,
    };
  } catch {
    return emptyState();
  }
};

const writeGooglePhotosState = (state: GooglePhotosLibraryState, notify = true): void => {
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

export const readGooglePhotosAccessToken = (): string => {
  if (!hasWindow()) return '';
  try {
    const raw = window.sessionStorage.getItem(GOOGLE_PHOTOS_SESSION_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { accessToken?: string; expiresAt?: number };
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) return '';
    return parsed.accessToken || '';
  } catch {
    return '';
  }
};

export const saveGooglePhotosAccessToken = (accessToken: string, expiresInSeconds = 3500): void => {
  if (!hasWindow() || !accessToken) return;
  try {
    window.sessionStorage.setItem(
      GOOGLE_PHOTOS_SESSION_KEY,
      JSON.stringify({
        accessToken,
        expiresAt: Date.now() + Math.max(60, expiresInSeconds - 60) * 1000,
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
      if (settled) {
        req.result.close();
        return;
      }
      req.result.onversionchange = () => {
        req.result.close();
        dbPromise = undefined;
      };
      finish(req.result);
    };
    req.onerror = () => finish(null);
    req.onblocked = () => finish(null);
  });

  return dbPromise;
};

const writeCachedGooglePhotoRecord = async (record: CachedGooglePhotoRecord): Promise<boolean> => {
  const db = await openPhotosDb();
  if (!db) return false;
  return new Promise<boolean>(resolve => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), IDB_REQ_TIMEOUT_MS);
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).put(record);
      req.onsuccess = () => finish(true);
      req.onerror = () => finish(false);
    } catch {
      finish(false);
    }
  });
};

const readCachedGooglePhotoRecord = async (googlePhotoId: string): Promise<CachedGooglePhotoRecord | null> => {
  if (!googlePhotoId) return null;
  const db = await openPhotosDb();
  if (!db) return null;
  return new Promise<CachedGooglePhotoRecord | null>(resolve => {
    let settled = false;
    const finish = (value: CachedGooglePhotoRecord | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), IDB_REQ_TIMEOUT_MS);
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(googlePhotoId);
      req.onsuccess = () => finish((req.result as CachedGooglePhotoRecord | undefined) || null);
      req.onerror = () => finish(null);
    } catch {
      finish(null);
    }
  });
};

const deleteCachedGooglePhotoRecords = async (googlePhotoIds: Iterable<string>): Promise<void> => {
  const ids = Array.from(googlePhotoIds).filter(Boolean);
  if (!ids.length) return;
  ids.forEach(id => {
    const existing = hydratedBlobUrls.get(id);
    if (existing) {
      if (existing.url) URL.revokeObjectURL(existing.url);
      if (existing.thumbnail && existing.thumbnail !== existing.url) URL.revokeObjectURL(existing.thumbnail);
      hydratedBlobUrls.delete(id);
    }
  });
  const db = await openPhotosDb();
  if (!db) return;
  await Promise.all(
    ids.map(
      id =>
        new Promise<void>(resolve => {
          try {
            const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
          } catch {
            resolve();
          }
        }),
    ),
  );
};

const registerBlobInMemory = (
  googlePhotoId: string,
  blob: Blob,
  thumbnailBlob?: Blob,
): { url: string; thumbnail: string } => {
  const prev = hydratedBlobUrls.get(googlePhotoId);
  if (prev) {
    if (prev.url) URL.revokeObjectURL(prev.url);
    if (prev.thumbnail && prev.thumbnail !== prev.url) URL.revokeObjectURL(prev.thumbnail);
  }
  const url = URL.createObjectURL(blob);
  const thumbnail = thumbnailBlob
    ? URL.createObjectURL(thumbnailBlob)
    : blob.type.startsWith('video/')
      ? ''
      : url;
  const pair = { url, thumbnail };
  hydratedBlobUrls.set(googlePhotoId, pair);
  return pair;
};

export const registerGooglePhotoBlobForTest = (
  googlePhotoId: string,
  url: string,
  thumbnail = url,
): void => {
  hydratedBlobUrls.set(googlePhotoId, { url, thumbnail });
};

export const ensureHydratedGooglePhotoUrls = async (
  googlePhotoId: string,
): Promise<{ url: string; thumbnail: string } | null> => {
  if (!googlePhotoId) return null;
  const existing = hydratedBlobUrls.get(googlePhotoId);
  if (existing?.url) return existing;

  const inflight = pendingHydrations.get(googlePhotoId);
  if (inflight) return inflight;

  const task = (async () => {
    const record = await readCachedGooglePhotoRecord(googlePhotoId);
    if (!record?.blob) return null;
    return registerBlobInMemory(googlePhotoId, record.blob, record.thumbnailBlob);
  })().finally(() => {
    pendingHydrations.delete(googlePhotoId);
  });

  pendingHydrations.set(googlePhotoId, task);
  return task;
};

export const hydrateGooglePhotosLibrary = async (maxEager = 120): Promise<number> => {
  const state = readGooglePhotosState();
  if (!state.items.length) return 0;

  const selectedCollectionIds = new Set(
    state.collections.filter(col => col.selected).map(col => col.id),
  );
  // Hydrate visible collections first so active memories paint immediately.
  const prioritized = [
    ...state.items.filter(item => selectedCollectionIds.has(item.collectionId)),
    ...state.items.filter(item => !selectedCollectionIds.has(item.collectionId)),
  ].slice(0, maxEager);

  let hydratedCount = 0;
  for (const item of prioritized) {
    if (hydratedBlobUrls.has(item.googlePhotoId)) continue;
    const loaded = await ensureHydratedGooglePhotoUrls(item.googlePhotoId);
    if (loaded) hydratedCount += 1;
  }

  if (hydratedCount > 0) {
    notifyGooglePhotosUpdated();
  }
  return hydratedCount;
};

export const ensureGooglePhotosBootHydration = (): void => {
  if (initialHydrationStarted || !hasWindow()) return;
  initialHydrationStarted = true;
  void hydrateGooglePhotosLibrary().catch(() => undefined);
};

// ─────────────────────────────────────────────────────────────────────────────
// Converting Stored Items <-> App `Memory` Objects + Collection Filtering
// ─────────────────────────────────────────────────────────────────────────────

const toMemory = (item: StoredGooglePhotoItem, collectionName?: string): Memory => {
  const hydrated = hydratedBlobUrls.get(item.googlePhotoId);
  const resolvedCollectionName = collectionName || item.collectionName || 'Google Photos';
  const url = hydrated?.url || '';
  const thumbnail = hydrated?.thumbnail || (item.type === 'photo' ? url : '');
  return {
    id: item.id,
    title: item.title,
    caption: item.caption || `From Google Photos · ${resolvedCollectionName}`,
    date: item.date,
    year: item.year,
    month: item.month,
    type: item.type,
    url,
    thumbnail,
    googlePhotoId: item.googlePhotoId,
    collectionId: item.collectionId,
    collectionName: resolvedCollectionName,
    source: 'google-photos',
    modifiedTime: item.date,
    orientation: item.orientation || 0,
    width: item.width,
    height: item.height,
    mimeType: item.mimeType,
    location: item.location,
    tags: Array.from(new Set([...(item.tags || []), 'google-photos', resolvedCollectionName])),
    isFavorite: item.isFavorite,
    event: resolvedCollectionName,
  };
};

/**
 * Returns ONLY the memories from Google Photos collections that the user has
 * selected (`selected === true`) to appear on the site.
 */
export const readSelectedGooglePhotosMemories = (): Memory[] => {
  const state = readGooglePhotosState();
  if (!state.items.length || !state.collections.length) return [];

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

export const createGooglePhotosCollection = (
  name: string,
  selected = true,
  source: GooglePhotosCollectionSource = 'google-photos',
): GooglePhotosCollection => {
  const cleanName = name.trim() || 'My Google Photos';
  const state = readGooglePhotosState();
  const existing = state.collections.find(
    col => col.name.trim().toLowerCase() === cleanName.toLowerCase(),
  );
  if (existing) {
    if (selected && !existing.selected) {
      existing.selected = true;
      existing.updatedAt = new Date().toISOString();
      writeGooglePhotosState(state);
    }
    return existing;
  }

  let candidateId = slugifyCollectionId(cleanName);
  let suffix = 2;
  while (state.collections.some(col => col.id === candidateId)) {
    candidateId = `${slugifyCollectionId(cleanName)}-${suffix}`;
    suffix += 1;
  }

  const now = new Date().toISOString();
  const created: GooglePhotosCollection = {
    id: candidateId,
    name: cleanName,
    selected,
    source,
    createdAt: now,
    updatedAt: now,
  };
  state.collections.unshift(created);
  writeGooglePhotosState(state);
  return created;
};

export const setGooglePhotosCollectionSelected = (collectionId: string, selected: boolean): void => {
  const state = readGooglePhotosState();
  let changed = false;
  state.collections = state.collections.map(col => {
    if (col.id !== collectionId || col.selected === selected) return col;
    changed = true;
    return { ...col, selected, updatedAt: new Date().toISOString() };
  });
  if (changed) writeGooglePhotosState(state);
};

export const setAllGooglePhotosCollectionsSelected = (selected: boolean): void => {
  const state = readGooglePhotosState();
  let changed = false;
  state.collections = state.collections.map(col => {
    if (col.selected === selected) return col;
    changed = true;
    return { ...col, selected };
  });
  if (changed) writeGooglePhotosState(state);
};

export const renameGooglePhotosCollection = (collectionId: string, nextName: string): void => {
  const clean = nextName.trim();
  if (!clean) return;
  const state = readGooglePhotosState();
  let changed = false;
  state.collections = state.collections.map(col => {
    if (col.id !== collectionId) return col;
    changed = true;
    return { ...col, name: clean, updatedAt: new Date().toISOString() };
  });
  if (!changed) return;
  state.items = state.items.map(item =>
    item.collectionId === collectionId
      ? { ...item, collectionName: clean, event: clean }
      : item,
  );
  writeGooglePhotosState(state);
};

export const deleteGooglePhotosCollection = async (collectionId: string): Promise<void> => {
  const state = readGooglePhotosState();
  const removedPhotoIds = state.items
    .filter(item => item.collectionId === collectionId)
    .map(item => item.googlePhotoId);
  state.collections = state.collections.filter(col => col.id !== collectionId);
  state.items = state.items.filter(item => item.collectionId !== collectionId);
  await deleteCachedGooglePhotoRecords(removedPhotoIds);
  writeGooglePhotosState(state);
};

export const disconnectGooglePhotos = async (clearPhotos = false): Promise<void> => {
  if (hasWindow()) {
    try {
      window.sessionStorage.removeItem(GOOGLE_PHOTOS_SESSION_KEY);
    } catch {
      // Optional session storage.
    }
  }
  const state = readGooglePhotosState();
  if (clearPhotos) {
    await deleteCachedGooglePhotoRecords(state.items.map(item => item.googlePhotoId));
    writeGooglePhotosState(emptyState());
    return;
  }
  state.account = null;
  writeGooglePhotosState(state);
};

// ─────────────────────────────────────────────────────────────────────────────
// Google Identity Services OAuth (Gmail Linking) + Google Photos Picker API
// ─────────────────────────────────────────────────────────────────────────────

const loadGoogleIdentityScript = (): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (!hasWindow()) {
      reject(new Error('Google sign-in requires a browser session.'));
      return;
    }
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_URL}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google OAuth script failed to load.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.dataset.loaded = 'false';
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error('Google OAuth script failed to load.'));
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

export const connectGooglePhotosGmail = async (options?: {
  loginHint?: string;
  selectAccount?: boolean;
  clientId?: string;
}): Promise<{ accessToken: string; account: GooglePhotosAccount | null }> => {
  const clientId = getConfiguredGoogleClientId(options?.clientId);
  if (!clientId) {
    throw new Error(
      'Google OAuth Client ID is not configured yet. Add VITE_GOOGLE_CLIENT_ID in .env (or paste your Client ID below), or pick photos directly from your Phone / PC Google Photos.',
    );
  }

  await loadGoogleIdentityScript();

  const tokenResult = await new Promise<{ accessToken: string; expiresIn: number }>((resolve, reject) => {
    const oauth = window.google?.accounts?.oauth2;
    if (!oauth) {
      reject(new Error('Google OAuth is unavailable in this browser.'));
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
      finish(() => reject(new Error('Google Photos Gmail sign-in timed out or was closed.')));
    }, 60_000);

    const tokenClient = oauth.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_PHOTOS_PICKER_SCOPE,
      callback: response => {
        if (response.error || !response.access_token) {
          finish(() =>
            reject(
              new Error(
                response.error === 'access_denied'
                  ? 'Google Photos permission was declined. Please approve Google Photos access for your Gmail account.'
                  : response.error || 'Google Photos authorization was cancelled.',
              ),
            ),
          );
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
                : err.message || 'Google sign-in could not open. Check popup permissions for this site.',
            ),
          ),
        );
      },
    });

    try {
      tokenClient.requestAccessToken({
        prompt: options?.selectAccount ? 'select_account consent' : '',
        hint: !options?.selectAccount && options?.loginHint ? options.loginHint : undefined,
      });
    } catch (err) {
      finish(() => reject(err instanceof Error ? err : new Error('Google sign-in failed to start.')));
    }
  });

  saveGooglePhotosAccessToken(tokenResult.accessToken, tokenResult.expiresIn);
  const profile = await fetchGoogleUserProfile(tokenResult.accessToken);
  const state = readGooglePhotosState();
  state.account = profile || state.account || {
    email: options?.loginHint || 'Connected Gmail Account',
    connectedAt: new Date().toISOString(),
  };
  writeGooglePhotosState(state);

  return { accessToken: tokenResult.accessToken, account: state.account };
};

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
    throw new Error('Link your Gmail account first to start a Google Photos session.');
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
      if (res.status === 401) {
        throw new Error('Your Google Photos session expired. Tap "Reconnect Gmail" and try again.');
      }
      if (res.status === 403 && /SERVICE_DISABLED|has not been used|disabled/i.test(detail)) {
        throw new Error(
          'Enable "Google Photos Picker API" in Google Cloud Console (APIs & Services → Library → Google Photos Picker API) for your Client ID, or use "Pick from Phone / PC Google Photos" right now.',
        );
      }
      if (res.status === 403) {
        throw new Error(
          'Google Photos Picker permission is missing or blocked. Reconnect Gmail and approve Google Photos access, or ensure your email is added under Test Users in Google Cloud OAuth Consent Screen.',
        );
      }
      throw new Error(`Google Photos session failed (${res.status}).`);
    }

    const payload = (await res.json()) as {
      id?: string;
      pickerUri?: string;
      expireTime?: string;
      pollingConfig?: { pollInterval?: string };
    };
    if (!payload.id || !payload.pickerUri) {
      throw new Error('Google Photos did not return a valid picker link.');
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
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Google Photos authorization expired while waiting for selection.');
      }
      return { mediaItemsSet: false, pollIntervalMs: 2500 };
    }
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
      // Give Google's backend a moment to finalize mediaItemsSet after /autoclose closes the popup.
      await new Promise<void>(r => window.setTimeout(r, 1200));
      const finalCheck = await checkGooglePhotosPickerSessionOnce(session.sessionId, accessToken);
      return finalCheck.mediaItemsSet;
    }

    // Wait either for the poll interval OR for the user switching back from
    // the Google Photos mobile app (`visibilitychange` / `focus`).
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

interface PickedGoogleMediaItem {
  id: string;
  createTime?: string;
  type?: 'PHOTO' | 'VIDEO' | 'TYPE_UNSPECIFIED' | string;
  mediaFile?: {
    baseUrl?: string;
    mimeType?: string;
    filename?: string;
    mediaFileMetadata?: {
      width?: number | string;
      height?: number | string;
      cameraMake?: string;
      cameraModel?: string;
    };
  };
}

const downloadAuthenticatedBlob = async (url: string, accessToken: string): Promise<Blob | null> => {
  if (!url) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), MEDIA_DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
};

const resolveCollectionForDate = (
  state: GooglePhotosLibraryState,
  target: CollectionTargetOption,
  isoDate: string,
  source: GooglePhotosCollectionSource,
): GooglePhotosCollection => {
  if (target.mode === 'existing') {
    const found = state.collections.find(col => col.id === target.collectionId);
    if (found) {
      found.selected = true;
      found.updatedAt = new Date().toISOString();
      return found;
    }
  }

  const desiredName =
    target.mode === 'custom' && target.name.trim()
      ? target.name.trim()
      : (() => {
          const parsed = new Date(isoDate);
          const month = MONTH_LABELS[parsed.getMonth() + 1] || 'Moments';
          const year = parsed.getFullYear();
          return `${month} ${year} · Google Photos`;
        })();

  const existing = state.collections.find(
    col => col.name.trim().toLowerCase() === desiredName.toLowerCase(),
  );
  if (existing) {
    existing.selected = true;
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  let candidateId = slugifyCollectionId(desiredName);
  let suffix = 2;
  while (state.collections.some(col => col.id === candidateId)) {
    candidateId = `${slugifyCollectionId(desiredName)}-${suffix}`;
    suffix += 1;
  }

  const now = new Date().toISOString();
  const created: GooglePhotosCollection = {
    id: candidateId,
    name: desiredName,
    selected: true,
    source: target.mode === 'auto' ? 'auto' : source,
    createdAt: now,
    updatedAt: now,
  };
  state.collections.unshift(created);
  return created;
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

export const importGooglePhotosPickerSession = async (
  sessionId: string,
  accessToken: string,
  target: CollectionTargetOption,
  onProgress?: (progress: GooglePhotosImportProgress) => void,
): Promise<{ importedCount: number; collectionsTouched: string[] }> => {
  void requestPersistentBrowserStorage();

  const rawPicked: PickedGoogleMediaItem[] = [];
  let pageToken = '';

  do {
    const url = new URL('https://photospicker.googleapis.com/v1/mediaItems');
    url.searchParams.set('sessionId', sessionId);
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Could not list selected Google Photos (${res.status}).`);
    }
    const data = (await res.json()) as {
      mediaItems?: PickedGoogleMediaItem[];
      nextPageToken?: string;
    };
    if (Array.isArray(data.mediaItems)) {
      rawPicked.push(...data.mediaItems);
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  if (!rawPicked.length) {
    return { importedCount: 0, collectionsTouched: [] };
  }

  let completed = 0;
  onProgress?.({
    completed: 0,
    total: rawPicked.length,
    label: `Downloading 0 of ${rawPicked.length} from Google Photos...`,
  });

  const downloadedItems: Array<{
    picked: PickedGoogleMediaItem;
    blob: Blob;
    thumbnailBlob?: Blob;
  }> = [];

  let cursor = 0;
  const workerCount = Math.min(4, rawPicked.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < rawPicked.length) {
      const current = rawPicked[cursor];
      cursor += 1;
      const baseUrl = current.mediaFile?.baseUrl || '';
      const mimeType = current.mediaFile?.mimeType || 'image/jpeg';
      const isVideo = current.type === 'VIDEO' || mimeType.startsWith('video/');

      if (baseUrl) {
        const mediaBlob = await downloadAuthenticatedBlob(
          isVideo ? `${baseUrl}=dv` : `${baseUrl}=w2048-h2048`,
          accessToken,
        );
        const posterBlob = isVideo
          ? (await downloadAuthenticatedBlob(`${baseUrl}=w960-h960`, accessToken)) || undefined
          : undefined;
        if (mediaBlob) {
          downloadedItems.push({
            picked: current,
            blob: mediaBlob,
            thumbnailBlob: posterBlob,
          });
        }
      }

      completed += 1;
      onProgress?.({
        completed,
        total: rawPicked.length,
        label: `Imported ${completed} of ${rawPicked.length} from Google Photos...`,
      });
    }
  });

  await Promise.all(workers);

  const state = readGooglePhotosState();
  const existingByPhotoId = new Map(state.items.map(item => [item.googlePhotoId, item]));
  const touchedCollections = new Set<string>();

  for (const entry of downloadedItems) {
    const { picked, blob, thumbnailBlob } = entry;
    const googlePhotoId = `picker_${picked.id}`;
    const mimeType = picked.mediaFile?.mimeType || blob.type || 'image/jpeg';
    const isVideo = picked.type === 'VIDEO' || mimeType.startsWith('video/');
    const isoDate = normalizePhotoDate(picked.createTime);
    const parsedDate = new Date(isoDate);
    const filename = picked.mediaFile?.filename || `Google_Photo_${picked.id}`;
    const title = filename.replace(/\.[^.]+$/, '') || 'Google Photo';
    const collection = resolveCollectionForDate(state, target, isoDate, 'google-photos');
    touchedCollections.add(collection.name);

    await writeCachedGooglePhotoRecord({
      id: googlePhotoId,
      mimeType,
      blob,
      thumbnailBlob,
      savedAt: Date.now(),
    });
    registerBlobInMemory(googlePhotoId, blob, thumbnailBlob);

    const width = Number(picked.mediaFile?.mediaFileMetadata?.width) || undefined;
    const height = Number(picked.mediaFile?.mediaFileMetadata?.height) || undefined;
    const cameraLabel = [
      picked.mediaFile?.mediaFileMetadata?.cameraMake,
      picked.mediaFile?.mediaFileMetadata?.cameraModel,
    ]
      .filter(Boolean)
      .join(' ');

    const storedItem: StoredGooglePhotoItem = {
      id: `gphoto-${googlePhotoId}`,
      googlePhotoId,
      collectionId: collection.id,
      collectionName: collection.name,
      title,
      caption: cameraLabel
        ? `Google Photos · ${collection.name} · ${cameraLabel}`
        : `Linked from Google Photos · ${collection.name}`,
      date: isoDate,
      year: parsedDate.getFullYear(),
      month: parsedDate.getMonth() + 1,
      type: isVideo ? 'video' : 'photo',
      mimeType,
      width,
      height,
      tags: ['google-photos', isVideo ? 'video' : 'photo', collection.name, String(parsedDate.getFullYear())],
      event: collection.name,
    };

    existingByPhotoId.set(googlePhotoId, storedItem);
  }

  state.items = Array.from(existingByPhotoId.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  state.lastSyncedAt = new Date().toISOString();
  writeGooglePhotosState(state);

  // Clean up picker session best-effort.
  void fetch(`https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => undefined);

  return {
    importedCount: downloadedItems.length,
    collectionsTouched: Array.from(touchedCollections),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Phone Google Photos App / PC Device Gallery Import into Collections
// ─────────────────────────────────────────────────────────────────────────────

const isSupportedMediaFile = (file: File): boolean =>
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

export const importFilesIntoGooglePhotosCollection = async (
  files: FileList | File[] | null,
  target: CollectionTargetOption,
  onProgress?: (progress: GooglePhotosImportProgress) => void,
): Promise<{ importedCount: number; collectionsTouched: string[] }> => {
  const validFiles = Array.from(files || []).filter(isSupportedMediaFile);
  if (!validFiles.length) return { importedCount: 0, collectionsTouched: [] };

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
      tags: ['google-photos', isVideo ? 'video' : 'photo', collection.name, String(parsedDate.getFullYear())],
      event: collection.name,
    };

    existingByPhotoId.set(googlePhotoId, storedItem);
  }

  state.items = Array.from(existingByPhotoId.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  state.lastSyncedAt = new Date().toISOString();
  writeGooglePhotosState(state);

  onProgress?.({
    completed: validFiles.length,
    total: validFiles.length,
    label: `Added ${validFiles.length} ${validFiles.length === 1 ? 'memory' : 'memories'} to ${Array.from(touchedCollections).join(', ')}`,
  });

  return {
    importedCount: validFiles.length,
    collectionsTouched: Array.from(touchedCollections),
  };
};
