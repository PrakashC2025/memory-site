import type { Memory } from '../data/memories';
import { googleDriveService, type DriveMediaFile } from './googleDriveService';
import { withMediaFetch } from '../utils/mediaQueue';

const DB_NAME = 'memoriya-drive-cache-v1';
const STORE_NAME = 'media';

interface CachedDriveMedia {
  id: string;
  modifiedTime?: string;
  mimeType: string;
  blob: Blob;
}

const openCache = () => new Promise<IDBDatabase | null>(resolve => {
  if (typeof indexedDB === 'undefined') {
    resolve(null);
    return;
  }
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => resolve(null);
});

let cacheDbPromise: Promise<IDBDatabase | null> | undefined;
const getCache = () => cacheDbPromise || (cacheDbPromise = openCache());

const readCached = async (id: string) => {
  const db = await getCache();
  if (!db) return undefined;
  return new Promise<CachedDriveMedia | undefined>(resolve => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as CachedDriveMedia | undefined);
    request.onerror = () => resolve(undefined);
  });
};

export const readCachedDriveMedia = async (id: string) => {
  if (!id) return null;
  const cached = await readCached(id);
  return cached ? { blob: cached.blob, mimeType: cached.mimeType } : null;
};

const writeCached = async (item: CachedDriveMedia) => {
  const db = await getCache();
  if (!db) return;
  await new Promise<void>(resolve => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
};

export const deleteCachedDriveMedia = async (id: string) => {
  if (!id) return;
  const db = await getCache();
  if (!db) return;
  await new Promise<void>(resolve => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
};

const downloadDriveMedia = async (file: DriveMediaFile, accessToken: string) => {
  const existing = await readCached(file.id);
  if (existing && existing.modifiedTime === file.modifiedTime) return;
  try {
    const blob = await withMediaFetch(() => googleDriveService.downloadMediaFile(accessToken, file.id));
    await writeCached({
      id: file.id,
      modifiedTime: file.modifiedTime,
      mimeType: file.mimeType,
      blob,
    });
  } catch {
    // A cache miss must never prevent the live Drive story from playing.
  }
};

export const cacheDriveMediaFiles = (files: DriveMediaFile[], accessToken: string, options?: { includeVideos?: boolean }) => {
  const visualFiles = files
    .filter(file => file.mimeType.startsWith('image/') || (options?.includeVideos && file.mimeType.startsWith('video/')))
    .sort((a, b) => Number(b.mimeType.startsWith('image/')) - Number(a.mimeType.startsWith('image/')));
  return Promise.all(visualFiles.map(file => downloadDriveMedia(file, accessToken))).then(() => undefined);
};

export const cacheDriveMemories = (memories: Memory[], accessToken: string) => {
  const files = memories
    .filter(memory => memory.driveFileId)
    .map(memory => ({
      id: memory.driveFileId as string,
      name: memory.title,
      mimeType: memory.mimeType || (memory.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      thumbnailUrl: memory.thumbnail || '',
      createdTime: memory.date,
    } satisfies DriveMediaFile));
  return cacheDriveMediaFiles(files, accessToken);
};

export const hydrateCachedDriveMemories = async (memories: Memory[]) => {
  const objectUrls: string[] = [];
  const hydrated = await Promise.all(memories.map(async memory => {
    if (!memory.driveFileId) return memory;
    const cached = await readCached(memory.driveFileId);
    if (!cached) return memory;
    const url = URL.createObjectURL(cached.blob);
    objectUrls.push(url);
    return { ...memory, url, thumbnail: url, mimeType: cached.mimeType };
  }));
  return { memories: hydrated, objectUrls };
};

export const releaseCachedObjectUrls = (objectUrls: string[]) => {
  objectUrls.forEach(url => URL.revokeObjectURL(url));
  objectUrls.length = 0;
};
