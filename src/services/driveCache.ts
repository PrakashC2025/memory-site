import { isVisualMemory, type Memory } from '../data/memories';
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
  return cached ? { blob: cached.blob, mimeType: cached.mimeType, modifiedTime: cached.modifiedTime } : null;
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

// How many originals a single background warm may pull. A 500 photo library
// used to queue 500 full-size downloads the moment it synced; those downloads
// filled the media queue ahead of the thumbnails that were actually on screen,
// so the gallery looked stuck on placeholders. Warming the first screenful is
// enough: anything else is fetched on demand when it becomes visible.
const MAX_WARMED_FILES = 48;

export const cacheDriveMediaFiles = (files: DriveMediaFile[], accessToken: string, options?: { includeVideos?: boolean; limit?: number }) => {
  const limit = Math.max(0, options?.limit ?? MAX_WARMED_FILES);
  const visualFiles = files
    .filter(file => file.mimeType.startsWith('image/') || ((options?.includeVideos ?? true) && file.mimeType.startsWith('video/')))
    .sort((a, b) => Number(b.mimeType.startsWith('image/')) - Number(a.mimeType.startsWith('image/')))
    .slice(0, limit);
  return Promise.all(visualFiles.map(file => downloadDriveMedia(file, accessToken))).then(() => undefined);
};

export const warmDriveFolderCache = async (accessToken: string, folderId = '') => {
  if (!accessToken) return;
  const files = await googleDriveService.listAllMedia(accessToken, folderId);
  await cacheDriveMediaFiles(files, accessToken, { includeVideos: true });
};

export const cacheDriveMemories = (memories: Memory[], accessToken: string) => {
  const files = memories
    .filter(memory => isVisualMemory(memory) && memory.driveFileId)
    .map(memory => ({
      id: memory.driveFileId as string,
      name: memory.title,
      mimeType: memory.mimeType || (memory.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      thumbnailUrl: memory.thumbnail || '',
      createdTime: memory.date,
    } satisfies DriveMediaFile));
  // Story Mode needs the original video locally so playback can start without
  // waiting on a second Drive request after the cinematic reel opens.
  return cacheDriveMediaFiles(files, accessToken, { includeVideos: true });
};

// Cap how many cached originals become live blob URLs at once. Hundreds of
// simultaneous object URLs pin decoded images in memory and make large
// libraries stutter; the reel loads the rest on demand.
const MAX_HYDRATED_URLS = 60;

export const hydrateCachedDriveMemories = async (memories: Memory[]) => {
  const objectUrls: string[] = [];
  let remainingUrls = MAX_HYDRATED_URLS;
  const hydrated = await Promise.all(memories.map(async memory => {
    if (!memory.driveFileId) return memory;
    if (remainingUrls <= 0) return memory;
    const cached = await readCached(memory.driveFileId);
    if (!cached) return memory;
    if (remainingUrls <= 0) return memory;
    remainingUrls -= 1;
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
