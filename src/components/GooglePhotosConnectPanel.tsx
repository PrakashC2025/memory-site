import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, FolderOpen, Images, LogOut, Upload } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { GooglePhotosIcon } from './GooglePhotosModal';
import {
  connectAndSyncGooglePhotos,
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
  readGooglePhotosState,
  setActiveGooglePhotosCollectionId,
  syncGooglePhotosLibrary,
  uploadFilesToGooglePhotosCollection,
  type GooglePhotosCollectionSummary,
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

  const [connected, setConnected] = useState(() => isGooglePhotosConnected());
  const [accountEmail, setAccountEmail] = useState(() => readGooglePhotosState().account?.email || '');
  const [collections, setCollections] = useState<GooglePhotosCollectionSummary[]>(() =>
    readGooglePhotosCollectionsSummary(),
  );
  const [activeCollectionId, setActiveCollectionId] = useState(() =>
    readActiveGooglePhotosCollectionId(),
  );
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
      setActiveCollectionId(readActiveGooglePhotosCollectionId());
    };
    window.addEventListener(GOOGLE_PHOTOS_UPDATED_EVENT, sync);
    return () => window.removeEventListener(GOOGLE_PHOTOS_UPDATED_EVENT, sync);
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    setError('');
    setMessage('Connecting to Google Photos...');
    try {
      const existingToken = readGooglePhotosAccessToken();
      const shouldReauthorize =
        !connected || !existingToken || isPhotosLibraryForbidden(existingToken);
      const result = shouldReauthorize
        ? await connectAndSyncGooglePhotos({ collectionId: activeCollectionId })
        : await syncGooglePhotosLibrary(existingToken, activeCollectionId);
      setConnected(true);
      setMessage(result.message);
    } catch (err) {
      const friendly = formatFriendlyGooglePhotosError(err);
      if (/closed|cancel/i.test(friendly)) {
        setError('');
        setMessage(friendly);
      } else if (/no photos were found/i.test(friendly)) {
        setConnected(true);
        setError('');
        setMessage(friendly);
      } else {
        setError(friendly);
        setMessage('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCollectionChange = async (value: string) => {
    setActiveCollectionId(value);
    setActiveGooglePhotosCollectionId(value);
    setError('');

    const token = readGooglePhotosAccessToken();
    if (token) {
      setLoading(true);
      try {
        const res = await syncGooglePhotosLibrary(token, value);
        setMessage(res.message);
      } catch {
        // Keep local collection switch smooth.
      } finally {
        setLoading(false);
      }
    } else {
      const target = collections.find(c => c.id === value);
      if (target && target.count === 0) {
        setMessage(`No photos found in "${target.name}".`);
      } else {
        setMessage(
          target
            ? `Showing "${target.name}" (${target.count} ${target.count === 1 ? 'memory' : 'memories'}).`
            : 'Showing all Google Photos collections.',
        );
      }
    }
  };

  const handlePickFromGooglePhotos = async () => {
    const existingToken = readGooglePhotosAccessToken();
    if (!existingToken) {
      setLoading(true);
      setError('');
      setMessage('Signing in to Google Photos...');
      try {
        const synced = await connectAndSyncGooglePhotos({ collectionId: activeCollectionId });
        setConnected(true);
        setMessage(
          synced.memories.length > 0
            ? synced.message
            : 'Google Photos linked — click "Pick from Google Photos" again to choose your photos.',
        );
      } catch (err) {
        setError(formatFriendlyGooglePhotosError(err));
        setMessage('');
      } finally {
        setLoading(false);
      }
      return;
    }

    const popup = window.open('about:blank', 'memoriya-gphotos-picker', 'width=980,height=740');
    setLoading(true);
    setError('');
    setMessage('Opening Google Photos...');
    try {
      const res = await pickFromGooglePhotosCloud({
        accessToken: existingToken,
        collectionId: activeCollectionId || undefined,
        popupWindow: popup,
        onStatus: status => setMessage(status),
      });
      setConnected(true);
      if (res.importedCount > 0) {
        setMessage(
          `Added ${res.importedCount} ${res.importedCount === 1 ? 'photo' : 'photos'} from Google Photos into "${res.collectionName}".`,
        );
      } else {
        setMessage('No new photos were selected from Google Photos.');
      }
    } catch (err) {
      setError(formatFriendlyGooglePhotosError(err));
      setMessage('');
    } finally {
      setLoading(false);
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
        collectionId: activeCollectionId || undefined,
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

  const totalCount = collections.reduce((sum, col) => sum + col.count, 0);
  const activeCol = collections.find(c => c.id === activeCollectionId);

  return (
    <div className="neon-card flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
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

        <div>
          <h2 className="font-black text-white">
            {connected ? 'Google Photos linked' : 'Connect Google Photos'}
          </h2>
          <p className="mt-1 text-sm leading-6 text-white/58">
            {connected
              ? totalCount > 0
                ? `${accountEmail ? `${accountEmail} · ` : ''}${activeCol ? `Showing "${activeCol.name}" (${activeCol.count})` : `${totalCount} ${totalCount === 1 ? 'memory' : 'memories'} across ${collections.length} ${collections.length === 1 ? 'collection' : 'collections'}`}.`
                : `${accountEmail ? `${accountEmail} · ` : ''}Connected — no photos found in this collection yet. Upload photos or capture from Camera.`
              : 'Connect Google Photos with one click, choose a collection, or upload photos directly.'}
          </p>

          {(message || error) && (
            <p
              className={`mt-3 text-xs leading-5 ${error ? 'text-rose-200' : 'text-white/58'}`}
              role={error ? 'alert' : undefined}
            >
              {error || message}
            </p>
          )}

          {connected && collections.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label
                className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs text-white/80"
                style={{ borderColor: `${config.primary}35`, background: 'rgba(255,255,255,0.04)' }}
              >
                <FolderOpen size={13} style={{ color: '#36f1cd' }} />
                <span>Collection:</span>
                <select
                  value={activeCollectionId}
                  onChange={e => void handleCollectionChange(e.target.value)}
                  className="bg-transparent font-semibold text-white outline-none"
                  aria-label="Choose Google Photos collection"
                >
                  <option value="" className="bg-slate-950 text-white">
                    All Google Photos ({totalCount})
                  </option>
                  {collections.map(col => (
                    <option key={col.id} value={col.id} className="bg-slate-950 text-white">
                      {col.name} ({col.count})
                    </option>
                  ))}
                </select>
              </label>

              {activeCol && (
                <span
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-white/64"
                  style={{ borderColor: `${config.primary}24` }}
                >
                  <Check size={12} style={{ color: '#36f1cd' }} />
                  {activeCol.count === 0 ? 'No photos found' : `${activeCol.count} items`}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <motion.button
          type="button"
          onClick={() => void handleConnect()}
          disabled={loading}
          whileHover={{ scale: loading ? 1 : 1.02 }}
          whileTap={{ scale: loading ? 1 : 0.98 }}
          className="neon-button px-5 py-3 text-sm font-black"
          style={{
            color: connected ? '#36f1cd' : '#ffd166',
            borderColor: connected ? '#36f1cd55' : '#fbbc0455',
          }}
        >
          {loading ? 'Connecting...' : connected ? 'Sync Google Photos' : 'Connect Google Photos'}
        </motion.button>

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
              {uploading ? 'Uploading...' : 'Add Photos'}
            </button>

            <button
              type="button"
              className="neon-button flex items-center justify-center gap-2 px-4 py-3 text-sm font-black text-white/70 hover:text-white"
              style={{ borderColor: 'rgba(255,255,255,0.16)' }}
              disabled={loading}
              onClick={() => {
                void disconnectGooglePhotos(true).then(() => {
                  setConnected(false);
                  setMessage('Google Photos disconnected.');
                  setError('');
                });
              }}
              title="Disconnect Google Photos"
            >
              <LogOut size={15} />
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
