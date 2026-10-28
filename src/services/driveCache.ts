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

const OPEN_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 20_000;

const openCache = () => new Promise<IDBDatabase | null>(resolve => {
  if (typeof indexedDB === 'undefined') {
    resolve(null);
    return;
  }
  let settled = false;
  const finish = (db: IDBDatabase | null) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    resolve(db);
  };
  const timeout = window.setTimeout(() => finish(null), OPEN_TIMEOUT_MS);
  let request: IDBOpenDBRequest;
  try {
    request = indexedDB.open(DB_NAME, 1);
  } catch {
    finish(null);
    return;
  }
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    }
  };
  request.onsuccess = () => {
    if (settled) {
      request.result.close();
      return;
    }
    finish(request.result);
  };
  request.onerror = () => finish(null);
  request.onblocked = () => finish(null);
});

let cacheDbPromise: Promise<IDBDatabase | null> | undefined;
const getCache = () => cacheDbPromise || (cacheDbPromise = openCache().then(db => {
  if (!db) cacheDbPromise = undefined;
  return db;
}));
const inFlightDownloads = new Map<string, Promise<{ blob: Blob; accessToken: string } | null>>();
let imageWarmChain: Promise<void> = Promise.resolve();

const readCached = async (id: string) => {
  const db = await getCache();
  if (!db) return undefined;
  return new Promise<CachedDriveMedia | undefined>(resolve => {
    let settled = false;
    const finish = (value?: CachedDriveMedia) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(value);
    };
    const timeout = window.setTimeout(() => finish(undefined), REQUEST_TIMEOUT_MS);
    try {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
      request.onsuccess = () => finish(request.result as CachedDriveMedia | undefined);
      request.onerror = () => finish(undefined);
    } catch {
      finish(undefined);
    }
  });
};

export const readCachedDriveMedia = async (id: string) => {
  if (!id) return null;
  const cached = await readCached(id);
  return cached ? { blob: cached.blob, mimeType: cached.mimeType, modifiedTime: cached.modifiedTime } : null;
};

const writeCached = async (item: CachedDriveMedia) => {
  const db = await getCache();
  if (!db) return false;
  return new Promise<boolean>(resolve => {
    let settled = false;
    const finish = (saved: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(saved);
    };
    const timeout = window.setTimeout(() => finish(false), REQUEST_TIMEOUT_MS);
    try {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(item);
      request.onsuccess = () => finish(true);
      request.onerror = () => finish(false);
    } catch {
      finish(false);
    }
  });
};

// A cached File is still the same picture when Drive did not supply (or the
// saved snapshot lost) a modifiedTime. Requiring both timestamps to match made
// older libraries download every original again on each refresh.
const cacheMatchesFile = (cached: CachedDriveMedia, modifiedTime?: string) =>
  !cached.modifiedTime || !modifiedTime || cached.modifiedTime === modifiedTime;

export const writeCachedDriveMedia = (
  file: { id: string; modifiedTime?: string; mimeType: string },
  blob: Blob,
) => {
  if (!file.id || !blob.size) return Promise.resolve(false);
  return writeCached({
    id: file.id,
    modifiedTime: file.modifiedTime,
    mimeType: file.mimeType || blob.type,
    blob,
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

export const ensureCachedDriveMedia = (file: DriveMediaFile, accessToken: string) => {
  const taskKey = `${file.id}:${file.modifiedTime || ''}`;
  const existingTask = inFlightDownloads.get(taskKey);
  if (existingTask) return existingTask;
  const task = (async () => {
    const existing = await readCached(file.id);
    if (existing && cacheMatchesFile(existing, file.modifiedTime)) {
      return { blob: existing.blob, accessToken };
    }
    try {
      const result = await withMediaFetch(() => googleDriveService.downloadMediaFileWithReconnect(accessToken, file.id));
      await writeCached({
        id: file.id,
        modifiedTime: file.modifiedTime,
        mimeType: file.mimeType,
        blob: result.blob,
      });
      return result;
    } catch {
      // A cache miss must never prevent the live Drive story from playing.
      return null;
    }
  })();
  inFlightDownloads.set(taskKey, task);
  void task.then(() => undefined, () => undefined).finally(() => {
    if (inFlightDownloads.get(taskKey) === task) inFlightDownloads.delete(taskKey);
  });
  return task;
};

const downloadDriveMedia = async (file: DriveMediaFile, accessToken: string) =>
  Boolean(await ensureCachedDriveMedia(file, accessToken));

export interface DriveCacheProgress {
  completed: number;
  failed: number;
  total: number;
}

type DriveCacheOptions = {
  includeVideos?: boolean;
  limit?: number;
  onProgress?: (progress: DriveCacheProgress) => void;
};

// Kept as a compatibility marker for older cache diagnostics. The default
// now expands to the complete supplied Drive list; callers can still pass a
// smaller explicit limit when they only want a preview warm.
const MAX_WARMED_FILES = 48;

const getCacheWorkerCount = () => {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') return 1;
  return 4;
};

// Background warming must yield to the live story when the browser has no
// connection or the page is hidden. Waiting for the browser events preserves
// the queue position, so a return to the page continues instead of restarting
// or marking every remaining file as failed.
const waitForCacheResume = async () => {
  while (navigator.onLine === false || document.hidden) {
    await new Promise<void>(resolve => {
      const onResume = () => {
        window.removeEventListener('online', onResume);
        document.removeEventListener('visibilitychange', onResume);
        resolve();
      };
      window.addEventListener('online', onResume, { once: true });
      document.addEventListener('visibilitychange', onResume, { once: true });
    });
  }
};

export const cacheDriveMediaFiles = async (files: DriveMediaFile[], accessToken: string, options?: DriveCacheOptions) => {
  const limit = Math.max(0, options?.limit ?? Math.max(MAX_WARMED_FILES, files.length));
  const visualFiles = files.filter(file =>
    file.mimeType.startsWith('image/') || ((options?.includeVideos ?? true) && file.mimeType.startsWith('video/')),
  );
  const imageFiles = visualFiles.filter(file => file.mimeType.startsWith('image/')).slice(0, limit);
  const videoFiles = visualFiles.filter(file => file.mimeType.startsWith('video/')).slice(0, Math.max(0, limit - imageFiles.length));
  const progress: DriveCacheProgress = { completed: 0, failed: 0, total: imageFiles.length + videoFiles.length };
  options?.onProgress?.({ ...progress });
  const runPhase = async (phaseFiles: DriveMediaFile[]) => {
    let cursor = 0;
    const worker = async () => {
      while (cursor < phaseFiles.length) {
        const file = phaseFiles[cursor];
        cursor += 1;
        await waitForCacheResume();
        if (await downloadDriveMedia(file, accessToken)) progress.completed += 1;
        else progress.failed += 1;
        options?.onProgress?.({ ...progress });
      }
    };
    await Promise.all(Array.from({ length: Math.min(getCacheWorkerCount(), phaseFiles.length) }, () => worker()));
  };
  // All callers share this image barrier. A later page cannot start its video
  // phase while another page is still warming Drive images.
  const imagePhase = imageWarmChain.then(() => runPhase(imageFiles));
  imageWarmChain = imagePhase.then(() => undefined, () => undefined);
  await imagePhase;
  await runPhase(videoFiles);
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
      modifiedTime: memory.modifiedTime,
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
    // Keep the Drive thumbnail URL stable. The blob URL is only a fast local
    // source; replacing the thumbnail made a later hydration revoke the URL
    // while MemoryReel was still decoding it, producing ERR_FILE_NOT_FOUND.
    return { ...memory, url, mimeType: cached.mimeType };
  }));
  return { memories: hydrated, objectUrls };
};

export const releaseCachedObjectUrls = (objectUrls: string[]) => {
  objectUrls.forEach(url => URL.revokeObjectURL(url));
  objectUrls.length = 0;
};
