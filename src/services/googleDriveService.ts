export interface DriveFolder {
  id: string;
  name: string;
  mediaCount: number;
  selected: boolean;
}

export interface DriveMediaFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailUrl: string;
  webContentLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  imageMediaMetadata?: {
    time?: string;
    width?: number;
    height?: number;
    location?: { latitude: number; longitude: number };
  };
  videoMediaMetadata?: {
    durationMillis?: string;
    width?: number;
    height?: number;
  };
}

export interface DriveConnectionState {
  connected: boolean;
  loading: boolean;
  folders: DriveFolder[];
  lastImportedAt?: string;
}

const DEMO_FOLDERS: DriveFolder[] = [
  { id: 'college-years', name: 'College Years 2021-2024', mediaCount: 268, selected: true },
  { id: 'goa-trips', name: 'Goa Trips', mediaCount: 94, selected: true },
  { id: 'family-archive', name: 'Family Archive', mediaCount: 147, selected: false },
];

export class GoogleDriveService {
  async connect(): Promise<DriveConnectionState> {
    // Production integration:
    // 1. Start Google OAuth with Drive readonly scope.
    // 2. Open Google Picker for folder selection.
    // 3. Store selected folder ids per user/memory space.
    await new Promise(resolve => setTimeout(resolve, 650));

    return {
      connected: true,
      loading: false,
      folders: DEMO_FOLDERS,
      lastImportedAt: new Date().toISOString(),
    };
  }

  async listSelectedMedia(_folderIds: string[]): Promise<DriveMediaFile[]> {
    // Production integration:
    // Use Drive API files.list with image/video MIME filters and request
    // thumbnailLink, imageMediaMetadata, videoMediaMetadata, createdTime,
    // modifiedTime, and webContentLink.
    return [];
  }

  extractBestDate(file: DriveMediaFile): string {
    return (
      file.imageMediaMetadata?.time ||
      file.createdTime ||
      file.modifiedTime ||
      new Date().toISOString()
    );
  }
}

export const googleDriveService = new GoogleDriveService();
