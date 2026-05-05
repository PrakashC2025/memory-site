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
    return snapshot.memories;
  } catch {
    return [];
  }
};

export const useDriveMemories = () => readDriveMemories();
