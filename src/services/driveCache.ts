import type { Memory } from '../data/memories';
import type { DriveMediaFile } from './googleDriveService';
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

const readCached = async (id: string) => {
  const db = await openCache();
  if (!db) return undefined;
  return new Promise<CachedDriveMedia | undefined>(resolve => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as CachedDriveMedia | undefined);
    request.onerror = () => resolve(undefined);
  });
};

const writeCached = async (item: CachedDriveMedia) => {
  const db = await openCache();
  if (!db) return;
  await new Promise<void>(resolve => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
};

const downloadDriveMedia = async (file: DriveMediaFile, accessToken: string) => {
  const existing = await readCached(file.id);
  if (existing && existing.modifiedTime === file.modifiedTime) return;
  try {
    const response = await withMediaFetch(() => fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'force-cache',
    }));
    if (!response.ok) return;
    await writeCached({
      id: file.id,
      modifiedTime: file.modifiedTime,
      mimeType: file.mimeType,
      blob: await response.blob(),
    });
  } catch {
    // A cache miss must never prevent the live Drive story from playing.
  }
};

export const cacheDriveMediaFiles = (files: DriveMediaFile[], accessToken: string) => {
  const visualFiles = files
    .filter(file => file.mimeType.startsWith('image/') || file.mimeType.startsWith('video/'))
    .sort((a, b) => Number(b.mimeType.startsWith('image/')) - Number(a.mimeType.startsWith('image/')));
  return Promise.all(visualFiles.map(file => downloadDriveMedia(file, accessToken))).then(() => undefined);
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
