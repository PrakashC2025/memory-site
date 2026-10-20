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
    rotation?: number;
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

export interface DriveAudioFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  modifiedTime?: string;
}

// Read existing memories and allow the in-site camera to create new photos.
// drive.file keeps write access limited to files created by Memoriya.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';
const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const DRIVE_REQUEST_TIMEOUT_MS = 20000;

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
};

type GoogleTokenError = {
  type?: string;
  message?: string;
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
            error_callback?: (error: GoogleTokenError) => void;
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

const fetchDriveJson = async <T,>(url: string, accessToken: string): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), DRIVE_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Google Drive authorization expired or access was denied. Reconnect Google Drive and try again.');
      }
      throw new Error(`Drive scan failed (${response.status}).`);
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Drive is taking too long to respond. Please try Sync Drive again.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

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

      let settled = false;
      const finish = (handler: () => void) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        handler();
      };

      const timeoutId = window.setTimeout(() => {
        finish(() => reject(new Error('Google Drive authorization was cancelled.')));
      }, 45000);

      const tokenClient = oauth.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: response => {
          if (response.error || !response.access_token) {
            finish(() => reject(new Error(response.error || 'Google Drive authorization was cancelled.')));
            return;
          }

          finish(() => resolve({
            connected: true,
            loading: false,
            folders: [
              { id: 'drive-root', name: 'Google Drive Photos', mediaCount: 0, selected: true },
            ],
            accessToken: response.access_token,
            lastImportedAt: new Date().toISOString(),
            mode: 'google',
            message: 'Google Drive connected with memory upload access.',
          }));
        },
        error_callback: error => {
          const wasClosed = error.type === 'popup_closed' || error.type === 'popup_closed_by_user';
          finish(() => reject(new Error(wasClosed
            ? 'Google Drive authorization was cancelled.'
            : error.message || 'Google Drive authorization failed.')));
        },
      });

      try {
        // Empty prompt skips the consent screen when the user has already granted
        // access, so reconnecting is instant. First-time connects still show consent.
        tokenClient.requestAccessToken({ prompt: '' });
      } catch (err) {
        finish(() => reject(err instanceof Error ? err : new Error('Google Drive authorization failed.')));
      }
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
        pageSize: '40',
        orderBy: 'createdTime desc',
        fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink,webContentLink,webViewLink,createdTime,modifiedTime,imageMediaMetadata,videoMediaMetadata)',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const payload = await fetchDriveJson<{
        nextPageToken?: string;
        files?: Array<DriveMediaFile & { thumbnailLink?: string; webViewLink?: string }>;
      }>(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, accessToken);

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

  async listMediaPage(accessToken: string, pageToken = '', folderId = ''): Promise<DriveMediaPage> {
    const locationQuery = folderId ? `'${folderId}' in parents and ` : '';
    const params = new URLSearchParams({
      q: `${locationQuery}(mimeType contains 'image/' or mimeType contains 'video/') and trashed=false`,
      pageSize: '40',
      orderBy: 'createdTime desc',
      fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink,webContentLink,webViewLink,createdTime,modifiedTime,imageMediaMetadata,videoMediaMetadata)',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const payload = await fetchDriveJson<{
      nextPageToken?: string;
      files?: Array<DriveMediaFile & { thumbnailLink?: string; webViewLink?: string }>;
    }>(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, accessToken);

    return {
      nextPageToken: payload.nextPageToken,
      files: (payload.files || []).map(file => ({
        ...file,
        thumbnailUrl: file.thumbnailUrl || file.thumbnailLink || file.webContentLink || file.webViewLink || '',
        webContentLink: file.webContentLink || file.webViewLink,
      })),
    };
  }

  async listFolders(accessToken: string): Promise<Array<{ id: string; name: string }>> {
    const params = new URLSearchParams({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      pageSize: '100',
      orderBy: 'name',
      fields: 'files(id,name)',
    });
    const payload = await fetchDriveJson<{ files?: Array<{ id: string; name: string }> }>(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      accessToken,
    );
    return payload.files || [];
  }

  async listAudioFiles(accessToken: string): Promise<DriveAudioFile[]> {
    const files: DriveAudioFile[] = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({
        q: "(mimeType contains 'audio/' or name contains '.mp3' or name contains '.m4a' or name contains '.aac' or name contains '.ogg' or name contains '.oga' or name contains '.wav' or name contains '.flac') and trashed=false",
        pageSize: '100',
        orderBy: 'modifiedTime desc',
        fields: 'nextPageToken,files(id,name,mimeType,createdTime,modifiedTime)',
        spaces: 'drive',
        includeItemsFromAllDrives: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const payload = await fetchDriveJson<{ nextPageToken?: string; files?: DriveAudioFile[] }>(
        `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
        accessToken,
      );
      files.push(...(payload.files || []));
      pageToken = payload.nextPageToken || '';
    } while (pageToken);
    return files;
  }

  async downloadMediaFile(accessToken: string, fileId: string): Promise<Blob> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), DRIVE_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Google Drive authorization expired. Reconnect Google Drive and try again.');
        }
        throw new Error(`Drive audio could not be downloaded (${response.status}).`);
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error('Drive returned an empty audio file.');
      return blob;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Drive audio took too long to download. Please try again.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async uploadMedia(accessToken: string, file: File, folderId?: string, signal?: AbortSignal): Promise<DriveMediaFile> {
    const boundary = `memoriya-${Date.now().toString(36)}`;
    const metadata: { name: string; mimeType: string; parents?: string[] } = {
      name: file.name || `memoriya-${Date.now()}.jpg`,
      mimeType: file.type || 'image/jpeg',
    };
    if (folderId && folderId !== 'drive-root') metadata.parents = [folderId];

    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`,
      file,
      `\r\n--${boundary}--`,
    ], { type: `multipart/related; boundary=${boundary}` });

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,createdTime,modifiedTime,thumbnailLink,webContentLink,imageMediaMetadata,videoMediaMetadata', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      signal,
      body,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail || `Drive upload failed (${response.status}). Reconnect Drive with upload permission.`);
    }
    const uploaded = await response.json() as DriveMediaFile & { thumbnailLink?: string };
    return {
      ...uploaded,
      thumbnailUrl: uploaded.thumbnailUrl || uploaded.thumbnailLink || uploaded.webContentLink || '',
    };
  }

  async deleteMedia(accessToken: string, fileId: string): Promise<void> {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Drive delete failed (${response.status}).`);
    }
  }

  toMemory(file: DriveMediaFile, accessToken?: string): import('../data/memories').Memory {
    const date = normalizeDriveDate(this.extractBestDate(file));
    const parsed = new Date(date);
    const isVideo = file.mimeType.startsWith('video/');
    const mediaUrl = file.id
      ? `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media${accessToken ? `&access_token=${encodeURIComponent(accessToken)}` : ''}`
      : file.webContentLink || file.thumbnailUrl;
    const previewUrl = sharpenDriveThumbnail(file.thumbnailUrl, accessToken) || mediaUrl;
    return {
      id: `drive-${file.id}`,
      title: file.name.replace(/\.[^.]+$/, ''),
      caption: 'Imported from Google Drive',
      date,
      year: parsed.getFullYear(),
      month: parsed.getMonth() + 1,
      type: isVideo ? 'video' : 'photo',
      url: mediaUrl,
      thumbnail: previewUrl,
      authToken: accessToken,
      driveFileId: file.id,
      orientation: normalizeDriveRotation(file.imageMediaMetadata?.rotation),
      mimeType: file.mimeType,
      location: file.imageMediaMetadata?.location ? 'Drive GPS metadata' : undefined,
      tags: ['drive', isVideo ? 'video' : 'photo'],
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

export const normalizeDriveRotation = (rotation?: number) => {
  if (!Number.isFinite(rotation)) return 0;
  const quarterTurns = Math.round((rotation as number) / 90);
  return (((quarterTurns % 4) + 4) % 4) * 90;
};

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

const sharpenDriveThumbnail = (url: string, _accessToken?: string) => {
  if (!url) return url;
  return url
    .replace(/=s\d+(-[cp])?$/i, '=s1600')
    .replace(/sz=w\d+/i, 'sz=w1600');
};
