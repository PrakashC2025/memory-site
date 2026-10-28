import { visualMemoriesOnly, type Memory } from '../data/memories';

export const DRIVE_SESSION_KEY = 'memoriya-drive-session-v1';
export const DRIVE_OFFLINE_LIBRARY_KEY = 'memoriya-drive-offline-library-v1';
export const DRIVE_MEMORIES_UPDATED_EVENT = 'memoriya-drive-memories-updated';
export const DRIVE_ACCESS_TOKEN_UPDATED_EVENT = 'memoriya-drive-access-token-updated';

let driveSyncLock = false;

export const acquireDriveSyncLock = () => {
  if (driveSyncLock) return false;
  driveSyncLock = true;
  return true;
};

export const releaseDriveSyncLock = () => {
  driveSyncLock = false;
};

interface DriveSessionSnapshot {
  accessToken: string;
  driveAuthRequired?: boolean;
  nextPageToken: string;
  changePageToken?: string;
  importCount: number;
  memories: Memory[];
  savedAt: number;
  driveFolderId?: string;
  driveFolders?: Array<{ id: string; name: string }>;
}

type OfflineDriveSnapshot = {
  memories: Memory[];
  driveFolderId?: string;
  driveFolders?: Array<{ id: string; name: string }>;
  savedAt: number;
};

const readStoredSnapshot = <T,>(key: string, storage: Storage) => {
  try {
    const stored = storage.getItem(key);
    return stored ? JSON.parse(stored) as T : null;
  } catch {
    return null;
  }
};

const saveOfflineSnapshot = (snapshot: OfflineDriveSnapshot) => {
  try {
    window.localStorage.setItem(DRIVE_OFFLINE_LIBRARY_KEY, JSON.stringify(snapshot));
  } catch {
    // IndexedDB media blobs remain available even when metadata storage is denied.
  }
};

export const readDriveMemories = () => {
  const session = readStoredSnapshot<DriveSessionSnapshot>(DRIVE_SESSION_KEY, window.sessionStorage);
  const snapshot = session || readStoredSnapshot<OfflineDriveSnapshot>(DRIVE_OFFLINE_LIBRARY_KEY, window.localStorage);
  if (!snapshot) return [];
  try {
    // Keep the local session metadata after the short-lived OAuth token expires.
    // Story Mode can still play the IndexedDB blobs, while the main screen can
    // ask the user to sync again when Drive needs a fresh token.
    if (!snapshot.memories?.length) return [];
    return visualMemoriesOnly(snapshot.memories).map(memory => upgradeDriveImageUrls(memory));
  } catch {
    return [];
  }
};

export const useDriveMemories = () => readDriveMemories();

export const readDriveAccessToken = () => {
  try {
    const stored = window.sessionStorage.getItem(DRIVE_SESSION_KEY);
    if (!stored) return '';
    return (JSON.parse(stored) as DriveSessionSnapshot).accessToken || '';
  } catch {
    return '';
  }
};

export const readDriveAuthRequired = () => {
  try {
    const stored = window.sessionStorage.getItem(DRIVE_SESSION_KEY);
    if (!stored) return false;
    return Boolean((JSON.parse(stored) as DriveSessionSnapshot).driveAuthRequired);
  } catch {
    return false;
  }
};

export const saveDriveAuthRequired = (required: boolean) => {
  try {
    const stored = window.sessionStorage.getItem(DRIVE_SESSION_KEY);
    if (!stored) return;
    const current = JSON.parse(stored) as Partial<DriveSessionSnapshot>;
    window.sessionStorage.setItem(DRIVE_SESSION_KEY, JSON.stringify({
      ...current,
      driveAuthRequired: required,
      savedAt: Date.now(),
    }));
    if (required) window.dispatchEvent(new CustomEvent(DRIVE_ACCESS_TOKEN_UPDATED_EVENT, { detail: '' }));
  } catch {
    // The in-memory sync guard still prevents repeated requests in this page.
  }
};

export const readDriveFolderId = () => {
  const session = readStoredSnapshot<DriveSessionSnapshot>(DRIVE_SESSION_KEY, window.sessionStorage);
  return session?.driveFolderId || readStoredSnapshot<OfflineDriveSnapshot>(DRIVE_OFFLINE_LIBRARY_KEY, window.localStorage)?.driveFolderId || '';
};

export const readDriveChangePageToken = () => {
  try {
    const stored = window.sessionStorage.getItem(DRIVE_SESSION_KEY);
    if (!stored) return '';
    return (JSON.parse(stored) as DriveSessionSnapshot).changePageToken || '';
  } catch {
    return '';
  }
};

export const saveDriveChangePageToken = (changePageToken: string) => {
  if (!changePageToken) return;
  try {
    const stored = window.sessionStorage.getItem(DRIVE_SESSION_KEY);
    const current = stored ? JSON.parse(stored) as Partial<DriveSessionSnapshot> : {};
    window.sessionStorage.setItem(DRIVE_SESSION_KEY, JSON.stringify({
      ...current,
      changePageToken,
      savedAt: Date.now(),
    }));
  } catch {
    // Session storage is optional; the current page keeps its in-memory token.
  }
};

export const clearDriveChangePageToken = () => {
  try {
    const stored = window.sessionStorage.getItem(DRIVE_SESSION_KEY);
    if (!stored) return;
    const current = JSON.parse(stored) as Partial<DriveSessionSnapshot>;
    delete current.changePageToken;
    window.sessionStorage.setItem(DRIVE_SESSION_KEY, JSON.stringify({ ...current, savedAt: Date.now() }));
  } catch {
    // Session storage is optional.
  }
};

export const readDriveFolders = () => {
  const session = readStoredSnapshot<DriveSessionSnapshot>(DRIVE_SESSION_KEY, window.sessionStorage);
  const folders = session?.driveFolders || readStoredSnapshot<OfflineDriveSnapshot>(DRIVE_OFFLINE_LIBRARY_KEY, window.localStorage)?.driveFolders || [];
  return folders.filter(folder => folder.id && folder.id !== 'drive-root');
};

export const saveDriveMemories = (memories: Memory[], accessToken: string, driveFolderId = '', notify = true) => {
  const visualMemories = visualMemoriesOnly(memories);
  try {
    const stored = window.sessionStorage.getItem(DRIVE_SESSION_KEY);
    const current = stored ? JSON.parse(stored) as Partial<DriveSessionSnapshot> : {};
    window.sessionStorage.setItem(DRIVE_SESSION_KEY, JSON.stringify({
      ...current,
      accessToken,
      driveAuthRequired: false,
      memories: visualMemories,
      driveFolderId,
      nextPageToken: '',
      importCount: visualMemories.length,
      savedAt: Date.now(),
    }));
    if (notify) window.dispatchEvent(new CustomEvent(DRIVE_MEMORIES_UPDATED_EVENT));
  } catch {
    // Session storage is optional; IndexedDB remains the playback cache.
  }
  saveOfflineSnapshot({
    memories: visualMemories.map(({ authToken: _authToken, ...memory }) => memory),
    driveFolderId,
    driveFolders: readDriveFolders(),
    savedAt: Date.now(),
  });
};

export const removeDriveMemories = (driveFileIds: Iterable<string>) => {
  const ids = new Set(Array.from(driveFileIds).filter(Boolean));
  if (!ids.size) return;
  try {
    const stored = window.sessionStorage.getItem(DRIVE_SESSION_KEY);
    if (!stored) return;
    const current = JSON.parse(stored) as Partial<DriveSessionSnapshot>;
    const memories = current.memories || [];
    const next = memories.filter(memory => !memory.driveFileId || !ids.has(memory.driveFileId));
    if (next.length === memories.length) return;
    window.sessionStorage.setItem(DRIVE_SESSION_KEY, JSON.stringify({
      ...current,
      memories: next,
      importCount: next.length,
      nextPageToken: current.nextPageToken || '',
      savedAt: Date.now(),
    }));
    saveOfflineSnapshot({
      memories: next.map(({ authToken: _authToken, ...memory }) => memory),
      driveFolderId: current.driveFolderId,
      driveFolders: current.driveFolders,
      savedAt: Date.now(),
    });
    window.dispatchEvent(new CustomEvent(DRIVE_MEMORIES_UPDATED_EVENT));
  } catch {
    // Session storage is optional; in-memory state still removes the media.
  }
};

export const saveDriveAccessToken = (accessToken: string) => {
  if (!accessToken) return;
  try {
    const stored = window.sessionStorage.getItem(DRIVE_SESSION_KEY);
    const current = stored ? JSON.parse(stored) as Partial<DriveSessionSnapshot> : {};
    const memories = (current.memories || []).map(memory => memory.driveFileId
      ? { ...memory, authToken: accessToken }
      : memory);
    window.sessionStorage.setItem(DRIVE_SESSION_KEY, JSON.stringify({
      ...current,
      accessToken,
      driveAuthRequired: false,
      memories,
      nextPageToken: current.nextPageToken || '',
      importCount: current.importCount || memories.length,
      savedAt: Date.now(),
    }));
    window.dispatchEvent(new CustomEvent(DRIVE_ACCESS_TOKEN_UPDATED_EVENT, { detail: accessToken }));
  } catch {
    // A fresh token is still usable in the current request when storage is unavailable.
  }
};

export const clearDriveSession = () => {
  try {
    window.sessionStorage.removeItem(DRIVE_SESSION_KEY);
    window.localStorage.removeItem(DRIVE_OFFLINE_LIBRARY_KEY);
    window.dispatchEvent(new CustomEvent(DRIVE_MEMORIES_UPDATED_EVENT));
    window.dispatchEvent(new CustomEvent(DRIVE_ACCESS_TOKEN_UPDATED_EVENT, { detail: '' }));
  } catch {
    // Session storage is optional.
  }
};

export const upgradeDriveImageUrls = (memory: Memory): Memory => {
  if (!memory.driveFileId) return memory;
  const id = encodeURIComponent(memory.driveFileId);
  const mediaUrl = `https://www.googleapis.com/drive/v3/files/${id}?alt=media${memory.authToken ? `&access_token=${encodeURIComponent(memory.authToken)}` : ''}`;
  return {
    ...memory,
    url: mediaUrl,
    thumbnail: sharpenStoredThumbnail(memory.thumbnail),
  };
};

const sharpenStoredThumbnail = (url: string) =>
  url
    // Keep the fast thumbnail path, but request enough pixels for the large
    // Story Mode hero. The original Drive blob still wins whenever it is
    // cached; this only prevents a soft thumbnail during promotion.
    .replace(/=s\d+(-[cp])?$/i, '=s2048')
    .replace(/sz=w\d+/i, 'sz=w2048');
