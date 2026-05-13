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

const openCacheDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Story cache failed'));
  });

const withStore = async <T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>) => {
  const db = await openCacheDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = callback(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Story cache request failed'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('Story cache transaction failed'));
    };
  });
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

export const writeCachedStoryMedia = async (key: string, blob: Blob, mimeType = blob.type) => {
  if (!key || !blob.size) return;
  try {
    await withStore<IDBValidKey>('readwrite', store => store.put({ key, blob, mimeType, savedAt: Date.now() }));
  } catch {
    // Browsers may deny storage or evict large media. Story Mode can still use the current object URL.
  }
};
