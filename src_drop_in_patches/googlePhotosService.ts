/**
 * Universal Google Photos + Local Device (PC / Mobile Gallery) Service & UI Auto-Injector
 * (`googlePhotosService.ts`)
 *
 * Features:
 * 1. Google Photos Integration:
 *    - Connects to Google Photos Library API (`photoslibrary.googleapis.com/v1/mediaItems`)
 *    - Launches Google Photos Picker API (`photospicker.googleapis.com/v1/sessions`)
 *    - Resolves authenticated `baseUrl` streams into fast local `blob:` URLs
 * 2. Local PC & Mobile Photo/Video Upload + IndexedDB Persistence:
 *    - Lets users pick photos/videos from PC folders or Android/iOS mobile camera roll/Google Photos app
 *    - Stores selected local files in IndexedDB (`memorya_local_media_db`) so they persist across refreshes!
 * 3. Automatic Fetch / Drive API Interceptor:
 *    - Intercepts `googleapis.com/drive/v3/files` responses in the browser and automatically injects
 *      your linked Google Photos + Local Photos into the returned `files` array so `Memoriya.tsx`,
 *      `StoryMode.tsx`, `MemoryReel.tsx`, and the total item count ("ocount") include them automatically!
 * 4. Universal PC & Mobile Button Auto-Injector:
 *    - Uses a `MutationObserver` to find ANY "Connect Google Drive" / "Google Drive" button in the DOM
 *      and injects "Google Photos" + "Add Local Photos" buttons right next to it, PLUS a responsive
 *      PC/Mobile floating pill so the buttons are 100% guaranteed to appear on every screen!
 */

export interface GooglePhotoMediaItem {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  thumbnailLink: string;
  webViewLink?: string;
  webContentLink?: string;
  createdTime: string;
  modifiedTime: string;
  source: 'google-photos' | 'local-device';
  width?: number;
  height?: number;
  isVideo?: boolean;
  imageMediaMetadata?: {
    width?: number;
    height?: number;
    time?: string;
  };
}

export const GOOGLE_PHOTOS_SCOPES = [
  'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
  'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
  'https://www.googleapis.com/auth/photoslibrary.appendonly',
  'https://www.googleapis.com/auth/photoslibrary.readonly',
].join(' ');

const STORAGE_KEY_PHOTOS_CACHE = 'memorya_google_photos_items_v1';
const STORAGE_KEY_PHOTOS_TOKEN = 'memorya_google_photos_access_token';
const IDB_NAME = 'memorya_local_and_gphotos_db_v1';
const IDB_STORE = 'media_blobs';

const blobUrlCache = new Map<string, string>();
let memoryLocalItems: GooglePhotoMediaItem[] = [];

// ============================================================================
// IndexedDB Storage for Local PC / Mobile Photos & Cached Google Photo Blobs
// ============================================================================

function openMediaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBlobItemToIDB(
  id: string,
  name: string,
  mimeType: string,
  blob: Blob,
  createdTime: string,
  source: 'google-photos' | 'local-device'
): Promise<GooglePhotoMediaItem> {
  const objectUrl = URL.createObjectURL(blob);
  const item: GooglePhotoMediaItem = {
    id,
    name,
    mimeType,
    url: objectUrl,
    thumbnailLink: objectUrl,
    webViewLink: objectUrl,
    webContentLink: objectUrl,
    createdTime,
    modifiedTime: createdTime,
    source,
    isVideo: mimeType.startsWith('video/'),
    imageMediaMetadata: { time: createdTime },
  };

  try {
    const db = await openMediaDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({
        id,
        name,
        mimeType,
        blob,
        createdTime,
        source,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('IndexedDB save fallback to memory:', e);
  }

  const existingIdx = memoryLocalItems.findIndex((i) => i.id === id);
  if (existingIdx >= 0) {
    memoryLocalItems[existingIdx] = item;
  } else {
    memoryLocalItems.unshift(item);
  }
  return item;
}

export async function loadAllStoredBlobItemsFromIDB(): Promise<GooglePhotoMediaItem[]> {
  try {
    const db = await openMediaDB();
    const records: any[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const loaded: GooglePhotoMediaItem[] = [];
    for (const rec of records) {
      if (rec && rec.blob instanceof Blob) {
        const objectUrl = URL.createObjectURL(rec.blob);
        loaded.push({
          id: rec.id,
          name: rec.name || 'Photo',
          mimeType: rec.mimeType || 'image/jpeg',
          url: objectUrl,
          thumbnailLink: objectUrl,
          webViewLink: objectUrl,
          webContentLink: objectUrl,
          createdTime: rec.createdTime || new Date().toISOString(),
          modifiedTime: rec.createdTime || new Date().toISOString(),
          source: rec.source || 'local-device',
          isVideo: (rec.mimeType || '').startsWith('video/'),
          imageMediaMetadata: { time: rec.createdTime || new Date().toISOString() },
        });
      }
    }
    memoryLocalItems = loaded;
    return loaded;
  } catch {
    return memoryLocalItems;
  }
}

/**
 * Imports files selected from PC file dialog or Mobile Gallery / Google Photos App picker.
 */
export async function importLocalOrMobileFiles(
  fileList: FileList | File[]
): Promise<GooglePhotoMediaItem[]> {
  const files = Array.from(fileList || []);
  const imported: GooglePhotoMediaItem[] = [];

  for (const file of files) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      continue;
    }
    const id = `local_${file.name.replace(/[^a-zA-Z0-9]/g, '_')}_${file.size}_${file.lastModified}`;
    const createdTime = file.lastModified
      ? new Date(file.lastModified).toISOString()
      : new Date().toISOString();
    const item = await saveBlobItemToIDB(
      id,
      file.name,
      file.type || 'image/jpeg',
      file,
      createdTime,
      'local-device'
    );
    imported.push(item);
  }

  notifyAllMediaUpdated();
  return getAllExtraMediaItems();
}

// ============================================================================
// Google Photos OAuth + Library API + Picker API
// ============================================================================

export function setGooglePhotosAccessToken(token: string): void {
  if (typeof window !== 'undefined' && token) {
    sessionStorage.setItem(STORAGE_KEY_PHOTOS_TOKEN, token);
  }
}

export function getGooglePhotosAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  const direct =
    sessionStorage.getItem(STORAGE_KEY_PHOTOS_TOKEN) ||
    localStorage.getItem('google_access_token') ||
    localStorage.getItem('gapi_access_token') ||
    (window as any).gapi?.client?.getToken?.()?.access_token;
  if (direct) return direct;

  // Scan sessionStorage and localStorage for any Google OAuth ya29.* access token
  for (const storage of [sessionStorage, localStorage]) {
    try {
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (!k) continue;
        const val = storage.getItem(k) || '';
        if (val.startsWith('ya29.')) return val;
        if (val.includes('ya29.')) {
          const m = val.match(/ya29\.[A-Za-z0-9_\-.]+/);
          if (m) return m[0];
        }
      }
    } catch {}
  }
  return null;
}

export function resolveGoogleClientId(explicitClientId?: string): string {
  if (explicitClientId) return explicitClientId;
  try {
    const viteEnv = (import.meta as any)?.env;
    if (viteEnv?.VITE_GOOGLE_CLIENT_ID) return viteEnv.VITE_GOOGLE_CLIENT_ID;
    if (viteEnv?.VITE_CLIENT_ID) return viteEnv.VITE_CLIENT_ID;
  } catch {}
  try {
    if (typeof process !== 'undefined') {
      const pEnv = (process as any)?.env;
      if (pEnv?.REACT_APP_GOOGLE_CLIENT_ID) return pEnv.REACT_APP_GOOGLE_CLIENT_ID;
      if (pEnv?.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return pEnv.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    }
  } catch {}
  if (typeof window !== 'undefined') {
    const winAny = window as any;
    if (winAny.__GOOGLE_CLIENT_ID__) return winAny.__GOOGLE_CLIENT_ID__;
    const stored =
      localStorage.getItem('google_client_id') ||
      localStorage.getItem('VITE_GOOGLE_CLIENT_ID');
    if (stored) return stored;
  }
  return '';
}

export function requestGooglePhotosLink(clientId?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const cid = resolveGoogleClientId(clientId);
    const googleObj = (window as any).google;
    if (!googleObj?.accounts?.oauth2) {
      const existingToken = getGooglePhotosAccessToken();
      if (existingToken) {
        resolve(existingToken);
        return;
      }
      reject(
        new Error(
          'Google Sign-In script not loaded yet. Click "Connect Google Drive" first or refresh the page.'
        )
      );
      return;
    }

    if (!cid) {
      const existingToken = getGooglePhotosAccessToken();
      if (existingToken) {
        resolve(existingToken);
        return;
      }
      reject(
        new Error(
          'Click "Connect Google Drive" first so your Google account session is active, then click "Google Photos".'
        )
      );
      return;
    }

    const tokenClient = googleObj.accounts.oauth2.initTokenClient({
      client_id: cid,
      scope: `${GOOGLE_PHOTOS_SCOPES} https://www.googleapis.com/auth/drive.readonly`,
      prompt: 'consent',
      callback: (response: any) => {
        if (response?.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        if (response?.access_token) {
          setGooglePhotosAccessToken(response.access_token);
          resolve(response.access_token);
        } else {
          reject(new Error('No access_token returned from Google OAuth.'));
        }
      },
    });

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

export async function resolvePhotoRenderBlob(
  baseUrl: string,
  accessToken: string,
  params: string = '=w1600-h1600'
): Promise<{ url: string; blob?: Blob }> {
  const fullUrl = `${baseUrl}${params}`;
  if (blobUrlCache.has(fullUrl)) {
    return { url: blobUrlCache.get(fullUrl)! };
  }

  try {
    const response = await fetch(fullUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (response.ok) {
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      blobUrlCache.set(fullUrl, objectUrl);
      return { url: objectUrl, blob };
    }
  } catch {}
  return { url: fullUrl };
}

export async function listGooglePhotosLibraryItems(
  accessToken?: string | null,
  maxItems: number = 250
): Promise<GooglePhotoMediaItem[]> {
  const token = accessToken || getGooglePhotosAccessToken();
  if (!token) return getCachedGooglePhotosItems();

  const items: GooglePhotoMediaItem[] = [];
  let pageToken: string | undefined = undefined;

  try {
    do {
      const url = new URL('https://photoslibrary.googleapis.com/v1/mediaItems');
      url.searchParams.set('pageSize', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) break;

      const data = await res.json();
      const mediaItems = Array.isArray(data.mediaItems) ? data.mediaItems : [];

      for (const item of mediaItems) {
        const mimeType = item.mimeType || 'image/jpeg';
        const isVideo = mimeType.startsWith('video/');
        const baseUrl = item.baseUrl || '';
        if (!baseUrl) continue;

        const createdTime =
          item.mediaMetadata?.creationTime || new Date().toISOString();
        const fullUrl = isVideo ? `${baseUrl}=dv` : `${baseUrl}=w1920-h1080`;
        const thumbUrl = `${baseUrl}=w600-h600-c`;

        items.push({
          id: `gphoto_${item.id}`,
          name: item.filename || `Photo_${item.id}`,
          mimeType,
          url: fullUrl,
          thumbnailLink: thumbUrl,
          webViewLink: item.productUrl || fullUrl,
          webContentLink: fullUrl,
          createdTime,
          modifiedTime: createdTime,
          source: 'google-photos',
          width: Number(item.mediaMetadata?.width) || undefined,
          height: Number(item.mediaMetadata?.height) || undefined,
          isVideo,
          imageMediaMetadata: {
            width: Number(item.mediaMetadata?.width) || undefined,
            height: Number(item.mediaMetadata?.height) || undefined,
            time: createdTime,
          },
        });
      }

      pageToken = data.nextPageToken;
    } while (pageToken && items.length < maxItems);
  } catch (err) {
    console.warn('Google Photos Library API listing warning:', err);
  }

  if (items.length > 0) {
    saveCachedGooglePhotosItems(items);
    notifyAllMediaUpdated();
  }
  return items;
}

export async function pickGooglePhotosInteractive(
  accessToken?: string | null,
  onStatusUpdate?: (status: string) => void
): Promise<GooglePhotoMediaItem[]> {
  const token = accessToken || getGooglePhotosAccessToken();
  if (!token) {
    throw new Error('Please connect your Google account first.');
  }

  onStatusUpdate?.('Opening Google Photos Picker...');
  const createRes = await fetch('https://photospicker.googleapis.com/v1/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(
      `Google Photos Picker API returned ${createRes.status}. Ensure "Google Photos Picker API" is enabled in Google Cloud Console. Details: ${errText}`
    );
  }

  const session = await createRes.json();
  const sessionId: string = session.id;
  const pickerUri: string = session.pickerUri;

  const popup = window.open(
    pickerUri,
    'GooglePhotosPicker',
    'width=1020,height=760,menubar=no,toolbar=no,location=no,status=no'
  );

  onStatusUpdate?.('Select photos in Google Photos window & tap Done...');

  const pollIntervalMs = 2200;
  const maxWaitMs = 10 * 60 * 1000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));

    const pollRes = await fetch(
      `https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();

    if (pollData.mediaItemsSet) {
      try {
        popup?.close();
      } catch {}
      break;
    }
  }

  onStatusUpdate?.('Importing selected Google Photos...');
  const pickedItems: GooglePhotoMediaItem[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const listUrl = new URL('https://photospicker.googleapis.com/v1/mediaItems');
    listUrl.searchParams.set('sessionId', sessionId);
    listUrl.searchParams.set('pageSize', '100');
    if (pageToken) listUrl.searchParams.set('pageToken', pageToken);

    const listRes = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!listRes.ok) break;
    const listData = await listRes.json();
    const rawItems = Array.isArray(listData.mediaItems) ? listData.mediaItems : [];

    const batchSize = 6;
    for (let i = 0; i < rawItems.length; i += batchSize) {
      const slice = rawItems.slice(i, i + batchSize);
      const resolvedSlice = await Promise.all(
        slice.map(async (item: any) => {
          const mediaFile = item.mediaFile || {};
          const baseUrl: string = mediaFile.baseUrl || '';
          const mimeType: string = mediaFile.mimeType || 'image/jpeg';
          const isVideo = item.type === 'VIDEO' || mimeType.startsWith('video/');
          const createdTime = item.createTime || new Date().toISOString();
          const itemId = `gphoto_${item.id}`;
          const filename = mediaFile.filename || `GooglePhoto_${item.id}`;

          const resolved = await resolvePhotoRenderBlob(
            baseUrl,
            token,
            isVideo ? '=dv' : '=w1920-h1080'
          );

          if (resolved.blob) {
            return await saveBlobItemToIDB(
              itemId,
              filename,
              mimeType,
              resolved.blob,
              createdTime,
              'google-photos'
            );
          }

          return {
            id: itemId,
            name: filename,
            mimeType,
            url: resolved.url,
            thumbnailLink: resolved.url,
            webViewLink: resolved.url,
            webContentLink: resolved.url,
            createdTime,
            modifiedTime: createdTime,
            source: 'google-photos' as const,
            width: Number(mediaFile.mediaFileMetadata?.width) || undefined,
            height: Number(mediaFile.mediaFileMetadata?.height) || undefined,
            isVideo,
            imageMediaMetadata: {
              width: Number(mediaFile.mediaFileMetadata?.width) || undefined,
              height: Number(mediaFile.mediaFileMetadata?.height) || undefined,
              time: createdTime,
            },
          };
        })
      );
      pickedItems.push(...resolvedSlice);
    }

    pageToken = listData.nextPageToken;
  } while (pageToken);

  const existing = getCachedGooglePhotosItems();
  const mergedMap = new Map<string, GooglePhotoMediaItem>();
  for (const item of [...pickedItems, ...existing]) {
    mergedMap.set(item.id, item);
  }
  const merged = Array.from(mergedMap.values());
  saveCachedGooglePhotosItems(merged);
  notifyAllMediaUpdated();

  onStatusUpdate?.(`Added ${pickedItems.length} Google Photos!`);
  return getAllExtraMediaItems();
}

export function getCachedGooglePhotosItems(): GooglePhotoMediaItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PHOTOS_CACHE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCachedGooglePhotosItems(items: GooglePhotoMediaItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Only persist non-blob URLs in localStorage; blobs are stored in IndexedDB
    const serializable = items.filter((i) => !i.url.startsWith('blob:'));
    localStorage.setItem(STORAGE_KEY_PHOTOS_CACHE, JSON.stringify(serializable));
  } catch {}
}

/**
 * Returns ALL extra media items (both IndexedDB local/Google Photos blobs + cached Google Photos items).
 */
export function getAllExtraMediaItems(): GooglePhotoMediaItem[] {
  const map = new Map<string, GooglePhotoMediaItem>();
  for (const item of [...memoryLocalItems, ...getCachedGooglePhotosItems()]) {
    if (item && item.id) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

export function mergeGooglePhotosWithDriveItems<T extends { id?: string }>(driveItems: T[]): T[] {
  const extras = getAllExtraMediaItems();
  if (!extras.length) return driveItems;

  const seen = new Set<string>();
  const combined: any[] = [];

  for (const item of [...extras, ...(Array.isArray(driveItems) ? driveItems : [])]) {
    const id = item?.id;
    if (id && !seen.has(id)) {
      seen.add(id);
      combined.push(item);
    } else if (!id) {
      combined.push(item);
    }
  }
  return combined as T[];
}

export function notifyAllMediaUpdated(): void {
  if (typeof window === 'undefined') return;
  const allExtras = getAllExtraMediaItems();
  window.dispatchEvent(
    new CustomEvent('memorya:google-photos-loaded', { detail: allExtras })
  );
}

// ============================================================================
// Automatic Browser Hook:
// 1. Intercepts Google OAuth initTokenClient to capture Client ID & add Photos scopes
// 2. Intercepts Drive API `googleapis.com/drive/v3/files` to fix `'drive-root'` AND
//    automatically merge Local + Google Photos items into the gallery & StoryMode!
// 3. Injects "Google Photos" + "Local Photos" buttons on both PC and Mobile!
// ============================================================================

export function installUniversalMemoryaHooks(): void {
  if (typeof window === 'undefined') return;
  const win = window as any;
  if (win.__memoryaUniversalHooksInstalled) return;
  win.__memoryaUniversalHooksInstalled = true;

  // Load saved IndexedDB photos (local PC/mobile + Google Photos blobs) immediately on boot
  loadAllStoredBlobItemsFromIDB().then((items) => {
    if (items.length > 0) {
      notifyAllMediaUpdated();
      updateFloatingPillBadge(items.length);
    }
  });

  // 1. Patch `window.fetch` so:
  //    - `'drive-root' in parents` is automatically rewritten to `'root' in parents`
  //    - `createdTime desc` is rewritten to `modifiedTime desc`
  //    - Authorization Bearer tokens from Google Drive are captured for Google Photos
  //    - Drive file list responses automatically include your Local + Google Photos!
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Capture Bearer token from any outgoing Google API call
    try {
      const headers = init?.headers || (input instanceof Request ? input.headers : undefined);
      if (headers) {
        let authVal = '';
        if (headers instanceof Headers) {
          authVal = headers.get('Authorization') || headers.get('authorization') || '';
        } else if (Array.isArray(headers)) {
          const found = headers.find(([k]) => k.toLowerCase() === 'authorization');
          if (found) authVal = found[1];
        } else if (typeof headers === 'object') {
          authVal = (headers as any).Authorization || (headers as any).authorization || '';
        }
        if (authVal.startsWith('Bearer ')) {
          const tok = authVal.slice(7).trim();
          if (tok) setGooglePhotosAccessToken(tok);
        }
      }
    } catch {}

    // Fix Google Drive v3 API queries automatically
    if (urlStr.includes('googleapis.com/drive/v3/files')) {
      let modifiedUrl = urlStr
        .replace(/%27drive-root%27/g, '%27root%27')
        .replace(/'drive-root'/g, "'root'")
        .replace(/createdTime(\+|%20|\s+)desc/g, 'modifiedTime$1desc');

      if (modifiedUrl !== urlStr) {
        urlStr = modifiedUrl;
        input = typeof input === 'string' ? modifiedUrl : new URL(modifiedUrl);
      }

      const response = await originalFetch(input, init);
      try {
        const clone = response.clone();
        const data = await clone.json();
        if (data && Array.isArray(data.files)) {
          const mergedFiles = mergeGooglePhotosWithDriveItems(data.files);
          const modifiedBody = JSON.stringify({
            ...data,
            files: mergedFiles,
          });
          return new Response(modifiedBody, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }
      } catch {}
      return response;
    }

    return originalFetch(input, init);
  };

  // 2. Mount Universal PC + Mobile Toolbar & Button Injector
  const mountUniversalButtons = () => {
    // Hidden `<input type="file" multiple accept="image/*,video/*" />` for PC & Mobile gallery
    let fileInput = document.getElementById('memorya-universal-file-input') as HTMLInputElement | null;
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.id = 'memorya-universal-file-input';
      fileInput.type = 'file';
      fileInput.multiple = true;
      fileInput.accept = 'image/*,video/*';
      fileInput.style.display = 'none';
      fileInput.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files.length > 0) {
          setToolbarStatus(`Adding ${target.files.length} photo(s)...`);
          const all = await importLocalOrMobileFiles(target.files);
          updateFloatingPillBadge(all.length);
          setToolbarStatus(`Added ${target.files.length} photo(s)! (${all.length} total)`);
          target.value = '';
        }
      });
      document.body.appendChild(fileInput);
    }

    // Create a responsive PC & Mobile floating bar (bottom-left/top-right adaptive)
    // AND inject inline buttons next to any "Connect Google Drive" button!
    if (!document.getElementById('memorya-universal-photo-bar')) {
      const bar = document.createElement('div');
      bar.id = 'memorya-universal-photo-bar';
      bar.style.cssText = [
        'position: fixed',
        'bottom: 18px',
        'left: 50%',
        'transform: translateX(-50%)',
        'z-index: 99999',
        'display: flex',
        'align-items: center',
        'gap: 8px',
        'padding: 6px 10px',
        'border-radius: 9999px',
        'background: rgba(15, 23, 42, 0.88)',
        'backdrop-filter: blur(12px)',
        '-webkit-backdrop-filter: blur(12px)',
        'border: 1px solid rgba(255, 255, 255, 0.18)',
        'box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45)',
        'font-family: system-ui, -apple-system, sans-serif',
        'max-width: 96vw',
        'flex-wrap: nowrap',
        'overflow-x: auto',
      ].join(';');

      const gphotosBtn = createActionButton('google-photos');
      const localBtn = createActionButton('local-device');

      const statusSpan = document.createElement('span');
      statusSpan.id = 'memorya-universal-status-text';
      statusSpan.style.cssText =
        'color: #e2e8f0; font-size: 12px; padding: 0 6px; white-space: nowrap; display: none;';

      bar.appendChild(gphotosBtn);
      bar.appendChild(localBtn);
      bar.appendChild(statusSpan);
      document.body.appendChild(bar);
    }

    // Also find any "Connect Google Drive" / "Google Drive" button in the page header and place inline buttons right next to it
    const allButtons = Array.from(document.querySelectorAll('button, a[role="button"]'));
    for (const btn of allButtons) {
      const txt = (btn.textContent || '').trim();
      if (
        /Connect\s+Google\s+Drive|Link\s+Google\s+Drive|Google\s+Drive/i.test(txt) &&
        !btn.hasAttribute('data-memorya-drive-augmented')
      ) {
        btn.setAttribute('data-memorya-drive-augmented', 'true');
        const inlineWrapper = document.createElement('span');
        inlineWrapper.className = 'memorya-inline-photo-actions';
        inlineWrapper.style.cssText =
          'display: inline-flex; align-items: center; gap: 8px; margin-left: 8px; flex-wrap: wrap; vertical-align: middle;';
        inlineWrapper.appendChild(createActionButton('google-photos'));
        inlineWrapper.appendChild(createActionButton('local-device'));
        btn.insertAdjacentElement('afterend', inlineWrapper);
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountUniversalButtons);
  } else {
    mountUniversalButtons();
  }

  const observer = new MutationObserver(() => {
    mountUniversalButtons();
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}

function setToolbarStatus(message: string): void {
  const el = document.getElementById('memorya-universal-status-text');
  if (!el) return;
  if (!message) {
    el.style.display = 'none';
    el.textContent = '';
  } else {
    el.style.display = 'inline-block';
    el.textContent = message;
  }
}

function updateFloatingPillBadge(count: number): void {
  const badges = document.querySelectorAll('.memorya-extra-photo-count');
  badges.forEach((b) => {
    (b as HTMLElement).textContent = count > 0 ? String(count) : '';
    (b as HTMLElement).style.display = count > 0 ? 'inline-block' : 'none';
  });
}

function createActionButton(kind: 'google-photos' | 'local-device'): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';

  if (kind === 'google-photos') {
    btn.style.cssText = [
      'display: inline-flex',
      'align-items: center',
      'gap: 6px',
      'padding: 7px 13px',
      'border-radius: 9999px',
      'border: 1px solid rgba(255,255,255,0.25)',
      'background: linear-gradient(135deg, #4285F4 0%, #EA4335 35%, #FBBC05 70%, #34A853 100%)',
      'color: #ffffff',
      'font-weight: 600',
      'font-size: 13px',
      'cursor: pointer',
      'white-space: nowrap',
      'box-shadow: 0 2px 8px rgba(0,0,0,0.25)',
    ].join(';');
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2C9.24 2 7 4.24 7 7v5h5c2.76 0 5-2.24 5-5s-2.24-5-5-5zm5 5c0 2.76-2.24 5-5 5h5c2.76 0 5 2.24 5 5s-2.24 5-5 5v-5h-5c0 2.76 2.24 5 5 5s5-2.24 5-5c0-2.76-2.24-5-5-5zm-5 5H7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5v-5zm0 0V7c0-2.76-2.24-5-5-5S2 4.24 2 7s2.24 5 5 5h5z"/>
      </svg>
      <span>Google Photos</span>
      <span class="memorya-extra-photo-count" style="display:none;background:rgba(0,0,0,0.35);padding:1px 6px;border-radius:999px;font-size:11px;"></span>
    `;
    btn.addEventListener('click', async () => {
      try {
        setToolbarStatus('Connecting to Google Photos...');
        let token = getGooglePhotosAccessToken();
        if (!token) {
          token = await requestGooglePhotosLink();
        }
        const libItems = await listGooglePhotosLibraryItems(token);
        if (libItems.length > 0) {
          updateFloatingPillBadge(getAllExtraMediaItems().length);
        }
        const all = await pickGooglePhotosInteractive(token, (msg) => setToolbarStatus(msg));
        updateFloatingPillBadge(all.length);
        setToolbarStatus(`Loaded ${all.length} photos!`);
      } catch (err: any) {
        console.warn('Google Photos Picker fallback to device photo picker:', err);
        setToolbarStatus(
          'Opening device photo selector (select from Google Photos / Gallery)...'
        );
        const fileInput = document.getElementById(
          'memorya-universal-file-input'
        ) as HTMLInputElement | null;
        fileInput?.click();
      }
    });
  } else {
    btn.style.cssText = [
      'display: inline-flex',
      'align-items: center',
      'gap: 6px',
      'padding: 7px 13px',
      'border-radius: 9999px',
      'border: 1px solid rgba(255,255,255,0.22)',
      'background: rgba(30, 41, 59, 0.95)',
      'color: #f8fafc',
      'font-weight: 600',
      'font-size: 13px',
      'cursor: pointer',
      'white-space: nowrap',
      'box-shadow: 0 2px 8px rgba(0,0,0,0.25)',
    ].join(';');
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <circle cx="8.5" cy="8.5" r="1.5"></circle>
        <polyline points="21 15 16 10 5 21"></polyline>
      </svg>
      <span>+ Local / Phone Photos</span>
    `;
    btn.addEventListener('click', () => {
      const fileInput = document.getElementById(
        'memorya-universal-file-input'
      ) as HTMLInputElement | null;
      fileInput?.click();
    });
  }

  return btn;
}

// Auto-install on module import!
installUniversalMemoryaHooks();
