const STORAGE_KEY = 'memoriya-camera-upload-queue-v1';

export interface PendingCameraUpload {
  id: string;
  name: string;
  type: string;
  folderId: string;
  createdAt: number;
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
