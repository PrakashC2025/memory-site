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
  parents?: string[];
  trashed?: boolean;
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

export interface DriveChange {
  fileId: string;
  removed?: boolean;
  file?: DriveMediaFile;
}

export interface DriveChangePage {
  changes: DriveChange[];
  nextPageToken?: string;
  newStartPageToken?: string;
}

export interface DriveAudioFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  createdTime?: string;
  modifiedTime?: string;
}

export const isVisualDriveFile = (file: Pick<DriveMediaFile, 'mimeType'>) => {
  const mimeType = (file.mimeType || '').toLowerCase();
  return mimeType.startsWith('image/') || mimeType.startsWith('video/');
};

const AUDIO_FILE_EXTENSION = /\.(mp3|m4a|m4b|aac|ogg|oga|wav|flac|opus|aiff|aif|amr|mka|wma)$/i;

// Audio and video share extensions such as .webm and .mp4 in Drive. The MIME
// type wins, so a video can never enter the Story Music list by mistake.
export const isAudioDriveFile = (file: Pick<DriveAudioFile, 'mimeType' | 'name'>) => {
  const mimeType = (file.mimeType || '').toLowerCase();
  if (mimeType.startsWith('video/')) return false;
  return mimeType.startsWith('audio/') || AUDIO_FILE_EXTENSION.test(file.name || '');
};

export const isDriveAuthorizationError = (error: unknown) =>
  error instanceof Error && /authorization expired|access was denied|unauthorized|invalid credentials/i.test(error.message);

// Read existing memories and allow the in-site camera to create new photos.
// drive.file keeps write access limited to files created by Memoriya.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';
const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const DRIVE_REQUEST_TIMEOUT_MS = 20000;
const DRIVE_MEDIA_TIMEOUT_MS = 90000;
const DRIVE_MEDIA_ATTEMPTS = 4;
const invalidDriveTokens = new Set<string>();

const markDriveTokenInvalid = (accessToken: string) => {
  if (!accessToken) return;
  invalidDriveTokens.add(accessToken);
  if (invalidDriveTokens.size > 4) invalidDriveTokens.delete(invalidDriveTokens.values().next().value as string);
};

const isDriveTokenInvalid = (accessToken: string) => invalidDriveTokens.has(accessToken);

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};

type GoogleTokenError = {
  type?: string;
  message?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string; hint?: string }) => void;
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
  if (isDriveTokenInvalid(accessToken)) {
    throw new Error('Google Drive authorization expired or access was denied. Reconnect Google Drive and try again.');
  }
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), DRIVE_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        markDriveTokenInvalid(accessToken);
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
  private refreshPromise?: Promise<string>;
  private loginHint = '';

  setLoginHint(loginHint?: string) {
    if (loginHint) this.loginHint = loginHint;
  }

  async connect(loginHint?: string, prompt = ''): Promise<DriveConnectionState> {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    if (!clientId) {
      throw new Error('Google Drive is not configured. Add VITE_GOOGLE_CLIENT_ID in .env and restart the dev server.');
    }

    await loadScript(GOOGLE_SCRIPT_URL);
    if (loginHint) this.loginHint = loginHint;

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

          invalidDriveTokens.delete(response.access_token);
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
        tokenClient.requestAccessToken({ prompt, hint: this.loginHint || undefined });
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
        includeItemsFromAllDrives: 'true',
        supportsAllDrives: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const payload = await fetchDriveJson<{
        nextPageToken?: string;
        files?: Array<DriveMediaFile & { thumbnailLink?: string; webViewLink?: string }>;
      }>(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, accessToken);

      const batch = (payload.files || []).filter(isVisualDriveFile).map(file => ({
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

  async listMediaPage(accessToken: string, pageToken = '', folderId = '', pageSize = 40): Promise<DriveMediaPage> {
    const locationQuery = folderId ? `'${folderId}' in parents and ` : '';
    const params = new URLSearchParams({
      q: `${locationQuery}(mimeType contains 'image/' or mimeType contains 'video/') and trashed=false`,
      pageSize: String(pageSize),
      orderBy: 'createdTime desc',
      fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink,webContentLink,webViewLink,createdTime,modifiedTime,imageMediaMetadata,videoMediaMetadata)',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const payload = await fetchDriveJson<{
      nextPageToken?: string;
      files?: Array<DriveMediaFile & { thumbnailLink?: string; webViewLink?: string }>;
    }>(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, accessToken);

    return {
      nextPageToken: payload.nextPageToken,
      files: (payload.files || []).filter(isVisualDriveFile).map(file => ({
        ...file,
        thumbnailUrl: file.thumbnailUrl || file.thumbnailLink || file.webContentLink || file.webViewLink || '',
        webContentLink: file.webContentLink || file.webViewLink,
      })),
    };
  }

  async listAllMedia(accessToken: string, folderId = ''): Promise<DriveMediaFile[]> {
    const files: DriveMediaFile[] = [];
    let pageToken = '';
    do {
      const page = await this.listMediaPage(accessToken, pageToken, folderId, 100);
      files.push(...page.files);
      pageToken = page.nextPageToken || '';
    } while (pageToken);
    return files;
  }

  async getStartPageToken(accessToken: string): Promise<string> {
    const params = new URLSearchParams({
      supportsAllDrives: 'true',
      fields: 'startPageToken',
    });
    const payload = await fetchDriveJson<{ startPageToken?: string }>(
      `https://www.googleapis.com/drive/v3/changes/startPageToken?${params.toString()}`,
      accessToken,
    );
    return payload.startPageToken || '';
  }

  async listChanges(accessToken: string, pageToken: string): Promise<DriveChangePage> {
    const params = new URLSearchParams({
      pageToken,
      pageSize: '100',
      spaces: 'drive',
      includeItemsFromAllDrives: 'true',
      includeCorpusRemovals: 'true',
      supportsAllDrives: 'true',
      fields: 'nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,thumbnailLink,webContentLink,webViewLink,createdTime,modifiedTime,parents,trashed,imageMediaMetadata,videoMediaMetadata))',
    });
    const payload = await fetchDriveJson<{
      nextPageToken?: string;
      newStartPageToken?: string;
      changes?: Array<DriveChange & { file?: DriveMediaFile & { thumbnailLink?: string; webViewLink?: string } }>;
    }>(`https://www.googleapis.com/drive/v3/changes?${params.toString()}`, accessToken);

    return {
      nextPageToken: payload.nextPageToken,
      newStartPageToken: payload.newStartPageToken,
      changes: (payload.changes || []).map(change => change.file ? {
        ...change,
        file: {
          ...change.file,
          thumbnailUrl: change.file.thumbnailUrl || change.file.thumbnailLink || change.file.webContentLink || change.file.webViewLink || '',
          webContentLink: change.file.webContentLink || change.file.webViewLink,
        },
      } : change),
    };
  }

  async listFolders(accessToken: string): Promise<Array<{ id: string; name: string }>> {
    const params = new URLSearchParams({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      pageSize: '100',
      orderBy: 'name',
      fields: 'files(id,name)',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
    });
    const payload = await fetchDriveJson<{ files?: Array<{ id: string; name: string }> }>(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      accessToken,
    );
    return payload.files || [];
  }

  async listAudioFiles(accessToken: string, folderId = ''): Promise<DriveAudioFile[]> {
    const files: DriveAudioFile[] = [];
    const requestedFolderId = folderId === 'drive-root' ? '' : folderId;
    let pageToken = '';
    do {
      const params = new URLSearchParams({
        // Drive uploads are sometimes labelled application/octet-stream or have
        // uppercase extensions, so fetch non-folder metadata and filter locally.
        q: `${requestedFolderId ? `'${requestedFolderId}' in parents and ` : ''}trashed=false and mimeType != 'application/vnd.google-apps.folder'`,
        pageSize: '100',
        orderBy: 'modifiedTime desc',
        fields: 'nextPageToken,files(id,name,mimeType,parents,createdTime,modifiedTime)',
        spaces: 'drive',
        includeItemsFromAllDrives: 'true',
        supportsAllDrives: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const payload = await fetchDriveJson<{ nextPageToken?: string; files?: DriveAudioFile[] }>(
        `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
        accessToken,
      );
      files.push(...(payload.files || []).filter(isAudioDriveFile));
      pageToken = payload.nextPageToken || '';
    } while (pageToken);
    return files;
  }

  async refreshAccessToken(loginHint?: string, silent = false): Promise<string> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.connect(loginHint || this.loginHint, silent ? 'none' : '')
        .then(state => {
          if (!state.accessToken) throw new Error('Google Drive authorization returned no access token.');
          return state.accessToken;
        })
        .finally(() => {
          this.refreshPromise = undefined;
        });
    }
    return this.refreshPromise;
  }

  async downloadMediaFile(accessToken: string, fileId: string, parentSignal?: AbortSignal): Promise<Blob> {
    if (isDriveTokenInvalid(accessToken)) {
      throw new Error('Google Drive authorization expired. Reconnect Google Drive and try again.');
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), DRIVE_MEDIA_TIMEOUT_MS);
    const abortFromParent = () => controller.abort();
    if (parentSignal) {
      if (parentSignal.aborted) controller.abort();
      else parentSignal.addEventListener('abort', abortFromParent, { once: true });
    }
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          markDriveTokenInvalid(accessToken);
          throw new Error('Google Drive authorization expired. Reconnect Google Drive and try again.');
        }
        throw new Error(`Drive media could not be downloaded (${response.status}).`);
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error('Drive returned an empty media file.');
      return blob;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Drive audio took too long to download. Please try again.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
      parentSignal?.removeEventListener('abort', abortFromParent);
    }
  }

  async downloadMediaFileWithReconnect(accessToken: string, fileId: string, parentSignal?: AbortSignal) {
    let token = accessToken;
    let refreshed = false;
    let lastError: unknown;
    for (let attempt = 0; attempt < DRIVE_MEDIA_ATTEMPTS; attempt += 1) {
      if (parentSignal?.aborted) {
        const cancelled = new Error('Media request was cancelled.');
        cancelled.name = 'AbortError';
        throw cancelled;
      }
      try {
        return { blob: await this.downloadMediaFile(token, fileId, parentSignal), accessToken: token };
      } catch (error) {
        lastError = error;
        if (parentSignal?.aborted) throw error;
        if (isDriveAuthorizationError(error) && !refreshed) {
          token = await this.refreshAccessToken(undefined, true);
          refreshed = true;
          continue;
        }
        if (attempt + 1 >= DRIVE_MEDIA_ATTEMPTS) throw error;
        await waitForDriveRetry(700 * (2 ** attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Drive media could not be downloaded.');
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

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), DRIVE_REQUEST_TIMEOUT_MS);
    const abortFromParent = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', abortFromParent, { once: true });
    }
    try {
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,parents,createdTime,modifiedTime,thumbnailLink,webContentLink,imageMediaMetadata,videoMediaMetadata', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        signal: controller.signal,
        body,
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Google Drive authorization expired. Reconnect Google Drive and try again.');
        }
        const detail = await response.text().catch(() => '');
        throw new Error(detail || `Drive upload failed (${response.status}). Reconnect Drive with upload permission.`);
      }
      const uploaded = await response.json() as DriveMediaFile & { thumbnailLink?: string };
      return {
        ...uploaded,
        thumbnailUrl: uploaded.thumbnailUrl || uploaded.thumbnailLink || uploaded.webContentLink || '',
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (signal?.aborted) throw error;
        throw new Error('Drive upload took too long. Check your connection and try again.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortFromParent);
    }
  }

  async updateMedia(accessToken: string, fileId: string, file: File): Promise<DriveMediaFile> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), DRIVE_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true&fields=id,name,mimeType,createdTime,modifiedTime,thumbnailLink,webContentLink,imageMediaMetadata,videoMediaMetadata`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': file.type || 'image/jpeg',
        },
        signal: controller.signal,
        body: file,
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Google Drive authorization expired. Reconnect Google Drive and try again.');
        }
        throw new Error(`Drive image update failed (${response.status}).`);
      }
      const updated = await response.json() as DriveMediaFile & { thumbnailLink?: string };
      return {
        ...updated,
        id: updated.id || fileId,
        name: updated.name || file.name,
        mimeType: updated.mimeType || file.type || 'image/jpeg',
        thumbnailUrl: updated.thumbnailUrl || updated.thumbnailLink || updated.webContentLink || '',
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Drive image update took too long. Please try again.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async deleteMedia(accessToken: string, fileId: string): Promise<void> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), DRIVE_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      if (!response.ok && response.status !== 404) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Google Drive authorization expired. Reconnect Google Drive and try again.');
        }
        throw new Error(`Drive delete failed (${response.status}).`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Drive delete took too long. Check your connection and try again.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
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
    const dimensions = isVideo ? file.videoMediaMetadata : file.imageMediaMetadata;
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
      modifiedTime: file.modifiedTime,
      orientation: normalizeDriveRotation(file.imageMediaMetadata?.rotation),
      width: dimensions?.width,
      height: dimensions?.height,
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

const waitForDriveRetry = (delayMs: number) => new Promise<void>(resolve => {
  window.setTimeout(resolve, delayMs);
});

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
    .replace(/=s\d+(-[cp])?$/i, '=s1280')
    .replace(/sz=w\d+/i, 'sz=w1280');
};
