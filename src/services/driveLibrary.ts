import type { Memory } from '../data/memories';

export const DRIVE_SESSION_KEY = 'memoriya-drive-session-v1';

interface DriveSessionSnapshot {
  accessToken: string;
  nextPageToken: string;
  importCount: number;
  memories: Memory[];
  savedAt: number;
}

export const readDriveMemories = () => {
  try {
    const stored = window.sessionStorage.getItem(DRIVE_SESSION_KEY);
    if (!stored) return [];
    const snapshot = JSON.parse(stored) as DriveSessionSnapshot;
    if (!snapshot.memories?.length || Date.now() - snapshot.savedAt > 55 * 60 * 1000) return [];
    return snapshot.memories.map(memory => upgradeDriveImageUrls(memory));
  } catch {
    return [];
  }
};

export const useDriveMemories = () => readDriveMemories();

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
