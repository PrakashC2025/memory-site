import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, FolderOpen, FolderPlus, Images, Loader2, LogOut, Upload, X } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { GooglePhotosIcon } from './GooglePhotosModal';
import {
  connectAndSyncGooglePhotos,
  createGooglePhotosCollection,
  disconnectGooglePhotos,
  ensureGooglePhotosBootHydration,
  formatFriendlyGooglePhotosError,
  GOOGLE_PHOTOS_STORAGE_KEY,
  GOOGLE_PHOTOS_UPDATED_EVENT,
  hydrateGooglePhotosLibrary,
  isGooglePhotosConnected,
  isPhotosLibraryForbidden,
  liveSyncGooglePhotos,
  notifyGooglePhotosUpdated,
  pickFromGooglePhotosCloud,
  readActiveGooglePhotosCollectionId,
  readGooglePhotosAccessToken,
  readGooglePhotosCollectionsSummary,
  readGooglePhotosSmartCategories,
  readGooglePhotosState,
  setActiveGooglePhotosCollectionId,
  syncGooglePhotosLibrary,
  uploadFilesToGooglePhotosCollection,
  type GooglePhotosCollectionSummary,
  type GooglePhotosSmartCategory,
} from '../services/googlePhotosService';

export const GooglePhotosBoot: React.FC = () => {
  useEffect(() => {
    ensureGooglePhotosBootHydration();

    const LIVE_SYNC_INTERVAL_MS = 8_000;
    const LIVE_SYNC_COOLDOWN_MS = 3_000;
    let lastSyncAt = 0;

    const triggerSync = (force = false) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (!force && now - lastSyncAt < LIVE_SYNC_COOLDOWN_MS) return;
      lastSyncAt = now;
      void liveSyncGooglePhotos();
    };

    const onFocus = () => triggerSync(true);
    const onOnline = () => triggerSync(true);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') triggerSync(true);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === GOOGLE_PHOTOS_STORAGE_KEY) {
        void hydrateGooglePhotosLibrary().then(() => notifyGooglePhotosUpdated());
      }
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);
    triggerSync(true);
    const interval = window.setInterval(() => triggerSync(false), LIVE_SYNC_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return null;
};

const GooglePhotosConnectPanel: React.FC = () => {
  const { config } = useTheme();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const gphotosAbortRef = useRef<AbortController | null>(null);
  const pickerPopupRef = useRef<Window | null>(null);

  const [connected, setConnected] = useState(() => isGooglePhotosConnected());
  const [accountEmail, setAccountEmail] = useState(() => readGooglePhotosState().account?.email || '');
  const [collections, setCollections] = useState<GooglePhotosCollectionSummary[]>(() =>
    readGooglePhotosCollectionsSummary(),
  );
  const [smartCategories, setSmartCategories] = useState<GooglePhotosSmartCategory[]>(() =>
    readGooglePhotosSmartCategories(),
  );
  const [activeCollectionId, setActiveCollectionId] = useState(() =>
    readActiveGooglePhotosCollectionId(),
  );
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    ensureGooglePhotosBootHydration();
    const sync = () => {
      setConnected(isGooglePhotosConnected());
      setAccountEmail(readGooglePhotosState().account?.email || '');
      setCollections(readGooglePhotosCollectionsSummary());
      setSmartCategories(readGooglePhotosSmartCategories());
      setActiveCollectionId(readActiveGooglePhotosCollectionId());
    };
    window.addEventListener(GOOGLE_PHOTOS_UPDATED_EVENT, sync);
    return () => window.removeEventListener(GOOGLE_PHOTOS_UPDATED_EVENT, sync);
  }, []);

  const totalCount = collections.reduce((sum, col) => sum + col.count, 0);
  const activeCol = collections.find(c => c.id === activeCollectionId);
  const activeSmart = smartCategories.find(c => c.id === activeCollectionId);

  const handleCancelSync = () => {
    gphotosAbortRef.current?.abort();
    gphotosAbortRef.current = null;
    if (pickerPopupRef.current) {
      try {
        pickerPopupRef.current.close();
      } catch {
        // Cross-origin popup close is best effort.
      }
      pickerPopupRef.current = null;
    }
    setLoading(false);
    setError('');
    setMessage('Google Photos sync cancelled.');
  };

  const handleConnect = async () => {
    gphotosAbortRef.current?.abort();
    const abortController = new AbortController();
    gphotosAbortRef.current = abortController;

    const existingToken = readGooglePhotosAccessToken();
    const shouldReauthorize = !connected || !existingToken;

    // When already signed in and 0 photos are loaded yet, open a popup window synchronously inside
    // the click gesture so if cloud `appcreateddata` is empty, we can immediately open Google Photos
    // showing all of the user's real Photos, Albums, Collections, Favorites, and Videos!
    let preOpenedPopup: Window | null = null;
    if (!shouldReauthorize && totalCount === 0 && typeof window !== 'undefined') {
      preOpenedPopup = window.open('about:blank', 'memoriya-gphotos-picker', 'width=980,height=740');
      pickerPopupRef.current = preOpenedPopup;
    }

    setLoading(true);
    setError('');
    setMessage(shouldReauthorize ? 'Connecting to Google Photos...' : 'Syncing Google Photos & Albums...');
    try {
      const result = shouldReauthorize
        ? await connectAndSyncGooglePhotos({
            collectionId: activeCollectionId,
            signal: abortController.signal,
          })
        : await syncGooglePhotosLibrary(existingToken, activeCollectionId, {
            signal: abortController.signal,
          });

      if (abortController.signal.aborted) return;
      setConnected(true);

      // If signed in and cloud appcreateddata had 0 photos, seamlessly open Google Photos Picker
      // using the synchronously opened popup so all albums/photos in photos.google.com can be synced!
      if (preOpenedPopup && result.memories.length === 0) {
        const picked = await pickFromGooglePhotosCloud({
          accessToken: existingToken,
          collectionId: activeCollectionId || undefined,
          popupWindow: preOpenedPopup,
          signal: abortController.signal,
          onStatus: status => setMessage(status),
        });
        if (abortController.signal.aborted) return;
        if (picked.importedCount > 0) {
          setMessage(
            `Synced ${picked.importedCount} ${picked.importedCount === 1 ? 'memory' : 'memories'} into ${picked.collectionName}.`,
          );
        } else {
          setMessage('Google Photos connected — click "Sync Google Photos" or "Pick from Google Photos" anytime to select albums & photos.');
        }
        return;
      }

      if (preOpenedPopup) {
        try {
          preOpenedPopup.close();
        } catch {
          // Ignore close error.
        }
        pickerPopupRef.current = null;
      }

      setMessage(
        result.memories.length > 0
          ? result.message
          : 'Google Photos linked! Click "Sync Google Photos" or "Pick from Google Photos" to open your Google Photos albums, collections & library.',
      );
    } catch (err) {
      if (preOpenedPopup) {
        try {
          preOpenedPopup.close();
        } catch {
          // Ignore close error.
        }
        pickerPopupRef.current = null;
      }
      if (gphotosAbortRef.current !== abortController) return;
      const friendly = formatFriendlyGooglePhotosError(err);
      if (/closed|cancel/i.test(friendly) || abortController.signal.aborted) {
        setError('');
        setMessage('Google Photos sync cancelled.');
      } else if (/no photos were found/i.test(friendly)) {
        setConnected(true);
        setError('');
        setMessage(friendly);
      } else {
        setError(friendly);
        setMessage('');
      }
    } finally {
      if (gphotosAbortRef.current === abortController) {
        gphotosAbortRef.current = null;
        pickerPopupRef.current = null;
        setLoading(false);
      }
    }
  };

  const handleCollectionChange = async (value: string) => {
    setActiveCollectionId(value);
    setActiveGooglePhotosCollectionId(value);
    setError('');

    if (value.startsWith('smart:')) {
      const smart = smartCategories.find(c => c.id === value);
      setMessage(smart ? `Showing "${smart.name}" (${smart.count}).` : 'Showing Google Photos category.');
      return;
    }

    const token = readGooglePhotosAccessToken();
    if (token && !isPhotosLibraryForbidden(token)) {
      gphotosAbortRef.current?.abort();
      const abortController = new AbortController();
      gphotosAbortRef.current = abortController;
      setLoading(true);
      try {
        const res = await syncGooglePhotosLibrary(token, value, { signal: abortController.signal });
        if (!abortController.signal.aborted) setMessage(res.message);
      } catch {
        // Keep local collection switch smooth.
      } finally {
        if (gphotosAbortRef.current === abortController) {
          gphotosAbortRef.current = null;
          setLoading(false);
        }
      }
    } else {
      const target = collections.find(c => c.id === value);
      if (target && target.count === 0) {
        setMessage(`No photos found in "${target.name}" yet — click "Pick from Google Photos" or "Add to Google Photos" to add items.`);
      } else {
        setMessage(
          target
            ? `Showing "${target.name}" (${target.count} ${target.count === 1 ? 'memory' : 'memories'}).`
            : 'Showing all Google Photos albums & collections.',
        );
      }
    }
  };

  const handleCreateAlbum = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = newAlbumName.trim();
    if (!trimmed) return;
    const created = createGooglePhotosCollection(trimmed, true);
    setActiveCollectionId(created.id);
    setActiveGooglePhotosCollectionId(created.id);
    setNewAlbumName('');
    setCreatingAlbum(false);
    setMessage(`Album "${created.name}" selected — now click "Pick from Google Photos" or "Add to Google Photos" to fill it.`);
  };

  const handlePickFromGooglePhotos = async () => {
    gphotosAbortRef.current?.abort();
    const abortController = new AbortController();
    gphotosAbortRef.current = abortController;

    const existingToken = readGooglePhotosAccessToken();
    if (!existingToken) {
      setLoading(true);
      setError('');
      setMessage('Signing in to Google Photos...');
      try {
        const synced = await connectAndSyncGooglePhotos({
          collectionId: activeCollectionId,
          signal: abortController.signal,
        });
        if (abortController.signal.aborted) return;
        setConnected(true);
        setMessage(
          synced.memories.length > 0
            ? synced.message
            : 'Google Photos linked — click "Pick from Google Photos" again to open your albums & photos.',
        );
      } catch (err) {
        if (gphotosAbortRef.current !== abortController) return;
        const friendly = formatFriendlyGooglePhotosError(err);
        if (/closed|cancel/i.test(friendly) || abortController.signal.aborted) {
          setError('');
          setMessage('Google Photos sign-in cancelled.');
        } else {
          setError(friendly);
          setMessage('');
        }
      } finally {
        if (gphotosAbortRef.current === abortController) {
          gphotosAbortRef.current = null;
          setLoading(false);
        }
      }
      return;
    }

    const popup = window.open('about:blank', 'memoriya-gphotos-picker', 'width=980,height=740');
    pickerPopupRef.current = popup;
    setLoading(true);
    setError('');
    setMessage('Opening Google Photos albums & library...');
    try {
      const targetColName = activeCol ? activeCol.name : undefined;
      const res = await pickFromGooglePhotosCloud({
        accessToken: existingToken,
        collectionId: activeCol ? activeCol.id : undefined,
        collectionName: targetColName,
        popupWindow: popup,
        signal: abortController.signal,
        onStatus: status => setMessage(status),
      });
      if (abortController.signal.aborted) return;
      setConnected(true);
      if (res.importedCount > 0) {
        setMessage(
          `Synced ${res.importedCount} ${res.importedCount === 1 ? 'photo' : 'photos'} from Google Photos into ${res.collectionName}.`,
        );
      } else {
        setMessage('Google Photos selection closed — no new photos were added.');
      }
    } catch (err) {
      if (gphotosAbortRef.current !== abortController) return;
      const friendly = formatFriendlyGooglePhotosError(err);
      if (/closed|cancel/i.test(friendly) || abortController.signal.aborted) {
        setError('');
        setMessage('Google Photos selection cancelled.');
      } else {
        setError(friendly);
        setMessage('');
      }
    } finally {
      if (gphotosAbortRef.current === abortController) {
        gphotosAbortRef.current = null;
        pickerPopupRef.current = null;
        setLoading(false);
      }
    }
  };

  const handleUpload = async (files: FileList | null) => {
    const nextFiles = Array.from(files || []).filter(
      file => file.type.startsWith('image/') || file.type.startsWith('video/'),
    );
    if (!nextFiles.length) return;

    setUploading(true);
    setError('');
    setMessage('Adding media to Google Photos collection...');
    try {
      const token = readGooglePhotosAccessToken();
      const res = await uploadFilesToGooglePhotosCollection(nextFiles, {
        collectionId: activeCol ? activeCol.id : undefined,
        accessToken: token || undefined,
      });
      setConnected(true);
      setMessage(
        `${res.importedCount} ${res.importedCount === 1 ? 'memory is' : 'memories are'} now in "${res.collection?.name || 'Google Photos'}"${res.syncedToCloud ? ' (synced to Google Photos)' : ''}.`,
      );
    } catch (err) {
      setError(formatFriendlyGooglePhotosError(err));
    } finally {
      setUploading(false);
    }
  };

  const activeSummaryLabel = activeCol
    ? `"${activeCol.name}" (${activeCol.count})`
    : activeSmart
      ? `"${activeSmart.name}" (${activeSmart.count})`
      : `${totalCount} ${totalCount === 1 ? 'memory' : 'memories'} across ${collections.length || 1} ${collections.length === 1 ? 'album/collection' : 'albums & collections'}`;

  return (
    <div className="neon-card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border"
          style={{
            borderColor: 'rgba(251, 188, 4, 0.38)',
            background:
              'linear-gradient(135deg, rgba(66,133,244,0.16), rgba(234,67,53,0.14), rgba(251,188,4,0.14), rgba(52,168,83,0.16))',
          }}
        >
          <GooglePhotosIcon size={22} />
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-black text-white">
              {connected ? 'Google Photos Linked' : 'Connect Google Photos'}
            </h2>
            {connected && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Connected
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-6 text-white/58">
            {connected
              ? totalCount > 0
                ? `${accountEmail ? `${accountEmail} · ` : ''}Showing ${activeSummaryLabel}.`
                : `${accountEmail ? `${accountEmail} · ` : ''}Connected — click "Sync Google Photos" or "Pick from Google Photos" to open your Google Photos albums, collections & library.`
              : 'Connect Google Photos with one click, browse your albums & collections, or upload photos directly.'}
          </p>

          {(message || error) && (
            <p
              className={`mt-3 text-xs leading-5 ${error ? 'text-rose-200' : 'text-white/58'}`}
              role={error ? 'alert' : undefined}
            >
              {error || message}
            </p>
          )}

          {connected && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs text-white/80"
                  style={{ borderColor: `${config.primary}35`, background: 'rgba(255,255,255,0.04)' }}
                >
                  <FolderOpen size={13} style={{ color: '#36f1cd' }} />
                  <span>Albums & Collections:</span>
                  <select
                    value={activeCollectionId}
                    onChange={e => void handleCollectionChange(e.target.value)}
                    className="max-w-[195px] bg-transparent font-semibold text-white outline-none sm:max-w-[250px]"
                    aria-label="Choose Google Photos collection"
                  >
                    <option value="" className="bg-slate-950 text-white">
                      All Google Photos ({totalCount})
                    </option>
                    {collections.length > 0 && (
                      <optgroup label="Albums & Collections" className="bg-slate-950 text-white">
                        {collections.map(col => (
                          <option key={col.id} value={col.id} className="bg-slate-950 text-white">
                            {col.name} ({col.count})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {smartCategories.length > 0 && (
                      <optgroup label="Google Photos Categories" className="bg-slate-950 text-white">
                        {smartCategories.map(cat => (
                          <option key={cat.id} value={cat.id} className="bg-slate-950 text-white">
                            {cat.name} ({cat.count})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => setCreatingAlbum(prev => !prev)}
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold text-white/80 hover:text-white"
                  style={{ borderColor: `${config.primary}30`, background: 'rgba(255,255,255,0.04)' }}
                  title="Create a named Google Photos album/collection"
                >
                  <FolderPlus size={13} style={{ color: '#ffd166' }} />
                  + Album
                </button>

                <span
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-white/64"
                  style={{ borderColor: `${config.primary}24` }}
                >
                  <Check size={12} style={{ color: '#36f1cd' }} />
                  {totalCount === 0
                    ? '0 synced yet'
                    : activeCol
                      ? `${activeCol.count} items`
                      : activeSmart
                        ? `${activeSmart.count} items`
                        : `${collections.length} ${collections.length === 1 ? 'album' : 'albums'} · ${totalCount} items`}
                </span>
              </div>

              {creatingAlbum && (
                <form onSubmit={handleCreateAlbum} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newAlbumName}
                    onChange={e => setNewAlbumName(e.target.value)}
                    placeholder="Album name (e.g. Family, Goa Trip, Favorites)..."
                    className="rounded-lg border border-white/20 bg-slate-950/80 px-3 py-1.5 text-xs text-white outline-none focus:border-amber-300"
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/30"
                  >
                    Save Album
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingAlbum(false);
                      setNewAlbumName('');
                    }}
                    className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/70 hover:text-white"
                  >
                    Cancel
                  </button>
                </form>
              )}

              {(collections.length > 0 || smartCategories.length > 0) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => void handleCollectionChange('')}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                      !activeCollectionId
                        ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                        : 'border-white/12 bg-white/5 text-white/70 hover:text-white'
                    }`}
                  >
                    All ({totalCount})
                  </button>
                  {collections.map(col => (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => void handleCollectionChange(col.id)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                        activeCollectionId === col.id
                          ? 'border-amber-300/60 bg-amber-400/20 text-amber-100'
                          : 'border-white/12 bg-white/5 text-white/70 hover:text-white'
                      }`}
                    >
                      {col.name} ({col.count})
                    </button>
                  ))}
                  {smartCategories.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => void handleCollectionChange(cat.id)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                        activeCollectionId === cat.id
                          ? 'border-cyan-300/60 bg-cyan-400/20 text-cyan-100'
                          : 'border-white/12 bg-white/5 text-white/70 hover:text-white'
                      }`}
                    >
                      {cat.name} ({cat.count})
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
        <motion.button
          type="button"
          onClick={() => void handleConnect()}
          disabled={loading}
          whileHover={{ scale: loading ? 1 : 1.02 }}
          whileTap={{ scale: loading ? 1 : 0.98 }}
          className="neon-button flex items-center justify-center gap-2 px-5 py-3 text-sm font-black disabled:opacity-70"
          style={{
            color: connected ? '#36f1cd' : '#ffd166',
            borderColor: connected ? '#36f1cd55' : '#fbbc0455',
          }}
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <GooglePhotosIcon size={15} />}
          {loading ? 'Syncing Photos...' : connected ? 'Sync Google Photos' : 'Connect Google Photos'}
        </motion.button>

        {loading && (
          <button
            type="button"
            onClick={handleCancelSync}
            className="neon-button flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-black text-amber-200 hover:text-white"
            style={{ borderColor: 'rgba(251, 191, 36, 0.55)', background: 'rgba(245, 158, 11, 0.16)' }}
            title="Cancel Google Photos sync"
          >
            <X size={15} />
            Cancel
          </button>
        )}

        {connected && (
          <>
            <button
              type="button"
              className="neon-button flex items-center justify-center gap-2 px-5 py-3 text-sm font-black disabled:cursor-wait disabled:opacity-55"
              style={{ color: '#ffd166', borderColor: 'rgba(251, 188, 4, 0.45)' }}
              disabled={loading || uploading}
              onClick={() => void handlePickFromGooglePhotos()}
            >
              <Images size={15} />
              Pick from Google Photos
            </button>

            <button
              type="button"
              className="neon-button flex items-center justify-center gap-2 px-5 py-3 text-sm font-black disabled:cursor-wait disabled:opacity-55"
              style={{ color: config.primary, borderColor: `${config.primary}44` }}
              disabled={loading || uploading}
              onClick={() => uploadInputRef.current?.click()}
            >
              <Upload size={15} />
              {uploading ? 'Uploading...' : 'Add to Google Photos'}
            </button>

            <button
              type="button"
              className="memoriya-disconnect-btn flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-black transition-all disabled:opacity-55"
              onClick={() => {
                gphotosAbortRef.current?.abort();
                gphotosAbortRef.current = null;
                if (pickerPopupRef.current) {
                  try {
                    pickerPopupRef.current.close();
                  } catch {
                    // Ignore close error.
                  }
                  pickerPopupRef.current = null;
                }
                setLoading(false);
                void disconnectGooglePhotos(true).then(() => {
                  setConnected(false);
                  setCollections([]);
                  setSmartCategories([]);
                  setActiveCollectionId('');
                  setAccountEmail('');
                  setMessage('Google Photos disconnected and photos cleared.');
                  setError('');
                });
              }}
              title="Disconnect Google Photos"
            >
              <LogOut size={15} />
              Disconnect Google Photos
            </button>
          </>
        )}

        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={event => {
            void handleUpload(event.currentTarget.files);
            event.currentTarget.value = '';
          }}
        />
      </div>
    </div>
  );
};

export default GooglePhotosConnectPanel;
