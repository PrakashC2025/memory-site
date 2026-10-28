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

export const ensureCachedDriveMedia = (file: DriveMediaFile, accessToken: string, priority = 0) => {
  const taskKey = `${file.id}:${file.modifiedTime || ''}`;
  const existingTask = inFlightDownloads.get(taskKey);
  if (existingTask) return existingTask;
  const task = (async () => {
    const existing = await readCached(file.id);
    if (existing && cacheMatchesFile(existing, file.modifiedTime)) {
      return { blob: existing.blob, accessToken };
    }
    try {
      const result = await withMediaFetch(
        () => googleDriveService.downloadMediaFileWithReconnect(accessToken, file.id),
        undefined,
        priority,
      );
      const saved = await writeCached({
        id: file.id,
        modifiedTime: file.modifiedTime,
        mimeType: file.mimeType,
        blob: result.blob,
      });
      if (!saved) throw new Error('Drive media could not be saved locally.');
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

const downloadDriveMedia = async (file: DriveMediaFile, accessToken: string) => {
  // Visible story requests use positive priorities and jump ahead of this
  // background cache request without cancelling the download.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await ensureCachedDriveMedia(file, accessToken, -10)) return true;
    if (attempt < 2) {
      await waitForCacheResume();
      await new Promise<void>(resolve => window.setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  return false;
};

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
  // Folder warming is deliberately background work. Keeping it to one worker
  // on touch/low-memory devices leaves decoder, input, casting and animation
  // time available while the browser is downloading the rest of the folder.
  const coarsePointer = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8;
  if (deviceMemory <= 2) return 1;
  if (coarsePointer) return 3;
  return 4;
};

const yieldToBrowser = () => new Promise<void>(resolve => {
  window.setTimeout(resolve, 0);
});

// Background warming must wait only for the network. A Story Mode cache job
// is intentionally allowed to continue while the tab is hidden or another
// app is in front, so Drive images and videos are ready when the user returns.
const waitForCacheResume = async () => {
  while (navigator.onLine === false) {
    await new Promise<void>(resolve => {
      window.addEventListener('online', resolve, { once: true });
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
        // Do not let a completed fetch/write callback start the next request
        // in the same task. This small yield keeps button taps, animation and
        // wireless-display input responsive during a large background sync.
        await yieldToBrowser();
      }
    };
    await Promise.all(Array.from({ length: Math.min(getCacheWorkerCount(), phaseFiles.length) }, () => worker()));
  };
  // Share one background queue across callers, but interleave a video after a
  // small image group. This keeps image discovery fast while ensuring videos
  // do not wait for hundreds of images before their local copies begin.
  const orderedFiles: DriveMediaFile[] = [];
  let videoIndex = 0;
  imageFiles.forEach((file, index) => {
    orderedFiles.push(file);
    if ((index + 1) % 8 === 0 && videoIndex < videoFiles.length) {
      orderedFiles.push(videoFiles[videoIndex]);
      videoIndex += 1;
    }
  });
  orderedFiles.push(...videoFiles.slice(videoIndex));
  const cachePhase = imageWarmChain.then(() => runPhase(orderedFiles));
  imageWarmChain = cachePhase.then(() => undefined, () => undefined);
  await cachePhase;
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
      // Some older saved memories have an image MIME type even when their
      // memory type is video. Keep those files in the video cache phase.
      mimeType: (memory.type === 'video' || memory.mimeType?.startsWith('video/'))
        ? (memory.mimeType?.startsWith('video/') ? memory.mimeType : 'video/mp4')
        : (memory.mimeType || 'image/jpeg'),
      thumbnailUrl: memory.thumbnail || '',
      createdTime: memory.date,
      modifiedTime: memory.modifiedTime,
    } satisfies DriveMediaFile));
  // Story Mode needs the original videos locally too, so playback does not
  // issue a second Drive request when it reaches the video portion.
  return cacheDriveMediaFiles(files, accessToken, { includeVideos: true });
};

  const MAX_HYDRATED_URLS = 60;

export const hydrateCachedDriveMemories = async (memories: Memory[]) => {
  const objectUrls: string[] = [];
  let remainingUrls = MAX_HYDRATED_URLS;
  const hydrated = await Promise.all(memories.map(async memory => {
      if (!memory.driveFileId) return memory;
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
