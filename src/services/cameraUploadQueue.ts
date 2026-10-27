const STORAGE_KEY = 'memoriya-camera-upload-queue-v1';
const COMPLETED_STORAGE_KEY = 'memoriya-camera-upload-completed-v1';

export interface PendingCameraUpload {
  id: string;
  name: string;
  type: string;
  folderId: string;
  createdAt: number;
}

export interface CompletedCameraUpload {
  id: string;
  driveFileId: string;
  folderId: string;
  completedAt: number;
  name?: string;
  mimeType?: string;
}

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

export const readPendingCameraUploads = (): PendingCameraUpload[] => {
  if (!canUseStorage()) return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is PendingCameraUpload => Boolean(
      item && typeof item.id === 'string' && typeof item.name === 'string' &&
      typeof item.type === 'string' && typeof item.folderId === 'string' &&
      typeof item.createdAt === 'number',
    ));
  } catch {
    return [];
  }
};

export const writePendingCameraUploads = (uploads: PendingCameraUpload[]) => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(uploads));
  } catch {
    // IndexedDB still holds the photo if browser storage is unavailable.
  }
};

export const readCompletedCameraUploads = (): CompletedCameraUpload[] => {
  if (!canUseStorage()) return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(COMPLETED_STORAGE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CompletedCameraUpload => Boolean(
      item && typeof item.id === 'string' && typeof item.driveFileId === 'string' &&
      typeof item.folderId === 'string' && typeof item.completedAt === 'number',
    ));
  } catch {
    return [];
  }
};

// A successful Drive response is recorded before the UI/cache callbacks run.
// If the tab closes at that point, restoring the pending queue must not send
// the same camera file a second time.
export const markCameraUploadCompleted = (upload: CompletedCameraUpload) => {
  if (!canUseStorage()) return;
  try {
    const current = readCompletedCameraUploads().filter(item => item.id !== upload.id);
    window.localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(
      [...current, upload].slice(-300),
    ));
  } catch {
    // The in-memory queue still removes the completed job for this session.
  }
};
