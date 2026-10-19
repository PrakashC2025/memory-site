import type { Memory } from '../data/memories';

export const DRIVE_SESSION_KEY = 'memoriya-drive-session-v1';

interface DriveSessionSnapshot {
  accessToken: string;
  nextPageToken: string;
  importCount: number;
  memories: Memory[];
  savedAt: number;
  driveFolderId?: string;
}

export const readDriveMemories = () => {
  try {
    const stored = window.sessionStorage.getItem(DRIVE_SESSION_KEY);
    if (!stored) return [];
    const snapshot = JSON.parse(stored) as DriveSessionSnapshot;
    // Keep the local session metadata after the short-lived OAuth token expires.
    // Story Mode can still play the IndexedDB blobs, while the main screen can
    // ask the user to sync again when Drive needs a fresh token.
    if (!snapshot.memories?.length) return [];
    return snapshot.memories.map(memory => upgradeDriveImageUrls(memory));
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

export const readDriveFolderId = () => {
  try {
    const stored = window.sessionStorage.getItem(DRIVE_SESSION_KEY);
    if (!stored) return '';
    return (JSON.parse(stored) as DriveSessionSnapshot).driveFolderId || '';
  } catch {
    return '';
  }
};

export const saveDriveMemories = (memories: Memory[], accessToken: string, driveFolderId = '') => {
  try {
    const stored = window.sessionStorage.getItem(DRIVE_SESSION_KEY);
    const current = stored ? JSON.parse(stored) as Partial<DriveSessionSnapshot> : {};
    window.sessionStorage.setItem(DRIVE_SESSION_KEY, JSON.stringify({
      ...current,
      accessToken,
      memories,
      driveFolderId,
      nextPageToken: '',
      importCount: memories.length,
      savedAt: Date.now(),
    }));
  } catch {
    // Session storage is optional; IndexedDB remains the playback cache.
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
    .replace(/=s\d+(-[cp])?$/i, '=s1600')
    .replace(/sz=w\d+/i, 'sz=w1600');
