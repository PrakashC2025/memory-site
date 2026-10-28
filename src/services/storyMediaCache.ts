import type { Memory } from '../data/memories';

const DB_NAME = 'memoriya-story-media-cache-v1';
const STORE_NAME = 'story-media';
const DB_VERSION = 1;

type CachedStoryMedia = {
  key: string;
  blob: Blob;
  mimeType: string;
  savedAt: number;
};

const canUseIndexedDb = () => typeof window !== 'undefined' && 'indexedDB' in window;

let cacheDbPromise: Promise<IDBDatabase> | undefined;

const OPEN_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 20_000;

const openCacheDb = () => cacheDbPromise || (cacheDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      cacheDbPromise = undefined;
      reject(error);
    };
    const timeout = window.setTimeout(() => fail(new Error('Story cache open timed out')), OPEN_TIMEOUT_MS);

    let request: IDBOpenDBRequest;
    try {
      request = window.indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      fail(error instanceof Error ? error : new Error('Story cache failed'));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        cacheDbPromise = undefined;
      };
      resolve(db);
    };
    request.onerror = () => {
      fail(request.error || new Error('Story cache failed'));
    };
    request.onblocked = () => {
      fail(new Error('Story cache is blocked by another tab'));
    };
  }));

const withStore = async <T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>) => {
  const db = await openCacheDb();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, value?: T) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (error) reject(error);
      else resolve(value as T);
    };
    const timeout = window.setTimeout(() => {
      // A blocked/aborted mobile IDB transaction must not freeze song playback
      // or leave the offline counter pinned at 0.
      finish(new Error('Story cache request timed out'));
    }, REQUEST_TIMEOUT_MS);

    try {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = callback(store);
      request.onsuccess = () => finish(undefined, request.result);
      request.onerror = () => finish(request.error || new Error('Story cache request failed'));
      transaction.onerror = () => finish(transaction.error || new Error('Story cache transaction failed'));
      transaction.onabort = () => finish(transaction.error || new Error('Story cache transaction aborted'));
    } catch (error) {
      finish(error instanceof Error ? error : new Error('Story cache failed'));
    }
  });
};

export const requestPersistentStoryStorage = async () => {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
};

export const getStoryMediaCacheKey = (memory: Memory) => memory.driveFileId || memory.url || memory.id;

export const readCachedStoryMedia = async (key: string) => {
  if (!key) return null;
  try {
    const cached = await withStore<CachedStoryMedia | undefined>('readonly', store => store.get(key));
    return cached?.blob || null;
  } catch {
    return null;
  }
};

export const writeCachedStoryMedia = async (key: string, blob: Blob, mimeType = blob.type): Promise<boolean> => {
  if (!key || !blob.size) return false;
  try {
    await withStore<IDBValidKey>('readwrite', store => store.put({ key, blob, mimeType, savedAt: Date.now() }));
    return true;
  } catch {
    // Browsers may deny storage or evict large media. Story Mode can still use the current object URL.
    return false;
  }
};

export const deleteCachedStoryMedia = async (key: string) => {
  if (!key) return;
  try {
    await withStore<undefined>('readwrite', store => store.delete(key));
  } catch {
    // Cache cleanup is best effort; Drive metadata remains authoritative.
  }
};
