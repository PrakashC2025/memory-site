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
  accessToken?: string;
  mode?: 'google';
  message?: string;
  error?: string;
}

export interface DriveMediaPage {
  files: DriveMediaFile[];
  nextPageToken?: string;
}

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.loaded = 'false';
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error('Google OAuth script failed to load.'));
    document.head.appendChild(script);
  });

export class GoogleDriveService {
  async connect(): Promise<DriveConnectionState> {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    if (!clientId) {
      throw new Error('Google Drive is not configured. Add VITE_GOOGLE_CLIENT_ID in .env and restart the dev server.');
    }

    await loadScript(GOOGLE_SCRIPT_URL);

    return new Promise<DriveConnectionState>((resolve, reject) => {
      const oauth = window.google?.accounts?.oauth2;
      if (!oauth) {
        reject(new Error('Google OAuth is unavailable in this browser session.'));
        return;
      }

      const tokenClient = oauth.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: response => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error || 'Google Drive authorization was cancelled.'));
            return;
          }

          resolve({
            connected: true,
            loading: false,
            folders: [
              { id: 'drive-root', name: 'Google Drive Photos', mediaCount: 0, selected: true },
            ],
            accessToken: response.access_token,
            lastImportedAt: new Date().toISOString(),
            mode: 'google',
            message: 'Google Drive connected with readonly access.',
          });
        },
      });

      tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  }

  async listSelectedMedia(
    _folderIds: string[],
    accessToken?: string,
    onBatch?: (files: DriveMediaFile[], loadedCount: number) => void
  ): Promise<DriveMediaFile[]> {
    if (!accessToken) return [];

    const allFiles: DriveMediaFile[] = [];
    let pageToken = '';

    do {
      const params = new URLSearchParams({
        q: "(mimeType contains 'image/' or mimeType contains 'video/') and trashed=false",
        pageSize: '100',
        orderBy: 'createdTime desc',
        fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink,webContentLink,webViewLink,createdTime,modifiedTime,imageMediaMetadata,videoMediaMetadata)',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`Drive scan failed (${response.status}).`);
      }

      const payload = await response.json() as {
        nextPageToken?: string;
        files?: Array<DriveMediaFile & { thumbnailLink?: string; webViewLink?: string }>;
      };

      const batch = (payload.files || []).map(file => ({
        ...file,
        thumbnailUrl: file.thumbnailUrl || file.thumbnailLink || file.webContentLink || file.webViewLink || '',
        webContentLink: file.webContentLink || file.webViewLink,
      }));

      allFiles.push(...batch);
      onBatch?.(batch, allFiles.length);
      pageToken = payload.nextPageToken || '';
      await new Promise(resolve => window.setTimeout(resolve, 40));
    } while (pageToken);

    return allFiles;
  }

  async listMediaPage(accessToken: string, pageToken = ''): Promise<DriveMediaPage> {
    const params = new URLSearchParams({
      q: "(mimeType contains 'image/' or mimeType contains 'video/') and trashed=false",
      pageSize: '60',
      orderBy: 'createdTime desc',
      fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink,webContentLink,webViewLink,createdTime,modifiedTime,imageMediaMetadata,videoMediaMetadata)',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Drive scan failed (${response.status}).`);
    }

    const payload = await response.json() as {
      nextPageToken?: string;
      files?: Array<DriveMediaFile & { thumbnailLink?: string; webViewLink?: string }>;
    };

    return {
      nextPageToken: payload.nextPageToken,
      files: (payload.files || []).map(file => ({
        ...file,
        thumbnailUrl: file.thumbnailUrl || file.thumbnailLink || file.webContentLink || file.webViewLink || '',
        webContentLink: file.webContentLink || file.webViewLink,
      })),
    };
  }

  toMemory(file: DriveMediaFile, accessToken?: string): import('../data/memories').Memory {
    const date = normalizeDriveDate(this.extractBestDate(file));
    const parsed = new Date(date);
    return {
      id: `drive-${file.id}`,
      title: file.name.replace(/\.[^.]+$/, ''),
      caption: 'Imported from Google Drive',
      date,
      year: parsed.getFullYear(),
      month: parsed.getMonth() + 1,
      type: file.mimeType.startsWith('video/') ? 'video' : 'photo',
      url: file.webContentLink || file.thumbnailUrl,
      thumbnail: file.thumbnailUrl,
      authToken: accessToken,
      driveFileId: file.id,
      mimeType: file.mimeType,
      location: file.imageMediaMetadata?.location ? 'Drive GPS metadata' : undefined,
      tags: ['drive', file.mimeType.startsWith('video/') ? 'video' : 'photo'],
      event: 'Google Drive Import',
    };
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

export const normalizeDriveDate = (value?: string) => {
  if (!value) return new Date().toISOString();

  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  const exifMatch = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (exifMatch) {
    const [, year, month, day, hour, minute, second] = exifMatch;
    const normalized = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
    if (!Number.isNaN(normalized.getTime())) return normalized.toISOString();
  }

  return new Date().toISOString();
};

export const googleDriveService = new GoogleDriveService();
