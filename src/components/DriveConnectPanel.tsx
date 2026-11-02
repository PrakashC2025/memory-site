import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Cloud, FolderOpen, Loader2, LogOut, Upload, X } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { googleDriveService, isDriveAuthorizationError, isVisualDriveFile, type DriveConnectionState } from '../services/googleDriveService';
import {
  clearDriveSession,
  DRIVE_ACCESS_TOKEN_UPDATED_EVENT,
  DRIVE_MEMORIES_UPDATED_EVENT,
  readDriveAccessToken,
  readDriveFolderId,
  readDriveFolders,
  readDriveMemories,
  saveDriveAccessToken,
  saveDriveFolders,
  saveDriveMemories,
} from '../services/driveLibrary';
import { warmDriveFolderCache } from '../services/driveCache';

const emptyState: DriveConnectionState = {
  connected: false,
  loading: false,
  folders: [],
};

const DriveConnectPanel: React.FC = () => {
  const { config } = useTheme();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const driveAbortRef = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState(() => readDriveFolderId());
  const [availableFolders, setAvailableFolders] = useState<Array<{ id: string; name: string }>>(() => readDriveFolders());
  const [mediaCount, setMediaCount] = useState(() => readDriveMemories().length);

  const [state, setState] = useState<DriveConnectionState>(() => {
    const memories = readDriveMemories();
    const accessToken = readDriveAccessToken();
    if (!accessToken && !memories.length) return emptyState;
    return {
      connected: true,
      loading: false,
      accessToken: accessToken || memories[0]?.authToken,
      mode: 'google',
      folders: [{ id: 'drive-root', name: 'All My Drive photos', mediaCount: memories.length, selected: true }],
      message: memories.length
        ? `${memories.length} ${memories.length === 1 ? 'memory' : 'memories'} ready from Google Drive.`
        : 'Google Drive linked — choose a folder or upload photos.',
    };
  });

  useEffect(() => {
    const syncUiFromStorage = () => {
      const memories = readDriveMemories();
      const token = readDriveAccessToken();
      setMediaCount(memories.length);
      setSelectedFolderId(readDriveFolderId());
      setAvailableFolders(readDriveFolders());
      if (!token && !memories.length) {
        setState(emptyState);
      } else {
        setState(current => ({
          ...current,
          connected: true,
          accessToken: token || current.accessToken,
        }));
      }
    };

    const onTokenUpdated = (event: Event) => {
      const accessToken = (event as CustomEvent<string>).detail;
      if (!accessToken) {
        syncUiFromStorage();
        return;
      }
      setState(current => ({
        ...current,
        connected: true,
        loading: false,
        accessToken,
        error: undefined,
      }));
    };

    window.addEventListener(DRIVE_ACCESS_TOKEN_UPDATED_EVENT, onTokenUpdated);
    window.addEventListener(DRIVE_MEMORIES_UPDATED_EVENT, syncUiFromStorage);
    return () => {
      window.removeEventListener(DRIVE_ACCESS_TOKEN_UPDATED_EVENT, onTokenUpdated);
      window.removeEventListener(DRIVE_MEMORIES_UPDATED_EVENT, syncUiFromStorage);
    };
  }, []);

  const syncDriveFolderMedia = async (accessToken: string, folderId: string, signal?: AbortSignal) => {
    let foldersList = availableFolders;
    try {
      foldersList = await googleDriveService.listFolders(accessToken, signal);
      setAvailableFolders(foldersList);
      saveDriveFolders(foldersList);
    } catch (folderErr) {
      if (signal?.aborted) throw folderErr;
      // Folder list is optional; root/selected media listing still works.
    }

    const folderNameMap = new Map(foldersList.map(f => [f.id, f.name]));
    const cleanFolderId = folderId === 'drive-root' ? '' : folderId;
    const files = await googleDriveService.listAllMedia(accessToken, cleanFolderId, signal);
    const imported = files
      .filter(file => isVisualDriveFile(file) && !file.trashed)
      .map(file => {
        const base = googleDriveService.toMemory(file, accessToken);
        const parentName =
          (file.parents?.[0] && folderNameMap.get(file.parents[0])) ||
          (cleanFolderId ? folderNameMap.get(cleanFolderId) : undefined);
        return parentName ? { ...base, event: parentName } : base;
      });

    saveDriveMemories(imported, accessToken, cleanFolderId);
    setMediaCount(imported.length);
    void warmDriveFolderCache(accessToken, cleanFolderId).catch(() => undefined);

    const activeLabel = cleanFolderId ? folderNameMap.get(cleanFolderId) : '';
    return {
      count: imported.length,
      message: imported.length > 0
        ? `Google Drive ready — ${imported.length} ${imported.length === 1 ? 'memory' : 'memories'}${activeLabel ? ` in "${activeLabel}"` : ''}.`
        : activeLabel
          ? `No photos found in "${activeLabel}" yet.`
          : 'Google Drive connected — no photos found yet. Upload photos or capture with Camera.',
    };
  };

  const handleCancelSync = () => {
    driveAbortRef.current?.abort();
    driveAbortRef.current = null;
    setState(current => ({
      ...current,
      loading: false,
      error: undefined,
      message: 'Google Drive sync cancelled.',
    }));
  };

  const handleConnect = async () => {
    driveAbortRef.current?.abort();
    const abortController = new AbortController();
    driveAbortRef.current = abortController;

    const existingToken = readDriveAccessToken();
    setState(current => ({
      ...current,
      loading: true,
      error: undefined,
      message: existingToken ? 'Syncing your Google Drive folders and photos...' : 'Connecting to Google Drive...',
    }));
    try {
      let token = existingToken;
      if (!token) {
        const next = await googleDriveService.connect(undefined, '', abortController.signal);
        token = next.accessToken || '';
        if (!token) throw new Error('Google Drive authorization was cancelled.');
        saveDriveAccessToken(token);
      }

      if (abortController.signal.aborted) throw new Error('Google Drive sync was cancelled.');

      setState(current => ({
        ...current,
        connected: true,
        loading: true,
        accessToken: token,
        error: undefined,
        message: 'Reading your Google Drive folders and photos...',
      }));

      let synced: Awaited<ReturnType<typeof syncDriveFolderMedia>>;
      try {
        synced = await syncDriveFolderMedia(token, selectedFolderId, abortController.signal);
      } catch (syncErr) {
        if (!existingToken || abortController.signal.aborted || !isDriveAuthorizationError(syncErr)) {
          throw syncErr;
        }
        // Saved token expired: refresh silently once and retry
        token = await googleDriveService.refreshAccessToken(undefined, true);
        saveDriveAccessToken(token);
        synced = await syncDriveFolderMedia(token, selectedFolderId, abortController.signal);
      }

      if (abortController.signal.aborted) return;
      setState({
        connected: true,
        loading: false,
        accessToken: token,
        mode: 'google',
        folders: [{ id: 'drive-root', name: 'All My Drive photos', mediaCount: synced.count, selected: true }],
        message: synced.message,
      });
    } catch (err) {
      if (driveAbortRef.current !== abortController) return;
      const message = err instanceof Error ? err.message : 'Google Drive connection failed.';
      const cancelled = /cancel|closed/i.test(message) || abortController.signal.aborted;
      setState(current => ({
        ...current,
        loading: false,
        error: cancelled ? undefined : message,
        message: cancelled ? 'Google Drive sync cancelled.' : undefined,
      }));
    } finally {
      if (driveAbortRef.current === abortController) {
        driveAbortRef.current = null;
      }
    }
  };

  const handleFolderChange = async (nextFolderId: string) => {
    const cleanId = nextFolderId === 'drive-root' ? '' : nextFolderId;
    setSelectedFolderId(cleanId);
    const token = state.accessToken || readDriveAccessToken();
    if (!token) return;

    driveAbortRef.current?.abort();
    const abortController = new AbortController();
    driveAbortRef.current = abortController;

    setState(current => ({ ...current, loading: true, error: undefined, message: 'Loading Drive folder...' }));
    try {
      const synced = await syncDriveFolderMedia(token, cleanId, abortController.signal);
      if (abortController.signal.aborted) return;
      setState(current => ({
        ...current,
        connected: true,
        loading: false,
        error: undefined,
        message: synced.message,
      }));
    } catch (err) {
      if (driveAbortRef.current !== abortController) return;
      const cancelled = abortController.signal.aborted || (err instanceof Error && /cancel/i.test(err.message));
      setState(current => ({
        ...current,
        loading: false,
        error: cancelled ? undefined : (err instanceof Error ? err.message : 'Could not load that Google Drive folder.'),
        message: cancelled ? 'Drive folder load cancelled.' : current.message,
      }));
    } finally {
      if (driveAbortRef.current === abortController) {
        driveAbortRef.current = null;
      }
    }
  };

  const handleUpload = async (files: FileList | null) => {
    const nextFiles = Array.from(files || []).filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
    if (!nextFiles.length) return;

    let accessToken = state.accessToken || readDriveAccessToken();
    if (!accessToken) {
      setState(current => ({ ...current, error: 'Click "Sync Drive" to authorize before uploading media.' }));
      return;
    }

    setUploading(true);
    setState(current => ({ ...current, error: undefined, message: 'Uploading media to Google Drive...' }));
    try {
      const folderId = selectedFolderId || readDriveFolderId();
      const uploaded = [];
      for (const file of nextFiles) {
        try {
          uploaded.push(await googleDriveService.uploadMedia(accessToken, file, folderId));
        } catch (uploadError) {
          if (!isDriveAuthorizationError(uploadError)) throw uploadError;
          accessToken = await googleDriveService.refreshAccessToken();
          saveDriveMemories(readDriveMemories().map(memory => memory.driveFileId
            ? { ...memory, authToken: accessToken }
            : memory), accessToken, folderId);
          uploaded.push(await googleDriveService.uploadMedia(accessToken, file, folderId));
        }
      }
      const currentMemories = readDriveMemories();
      const importedMemories = uploaded.map(file => googleDriveService.toMemory(file, accessToken));
      const merged = [...importedMemories, ...currentMemories];
      saveDriveMemories(merged, accessToken, folderId);
      setMediaCount(merged.length);
      setState(current => ({
        ...current,
        connected: true,
        accessToken,
        error: undefined,
        message: `${uploaded.length} ${uploaded.length === 1 ? 'memory is' : 'memories are'} now in Google Drive.`,
      }));
    } catch (error) {
      setState(current => ({
        ...current,
        error: error instanceof Error ? error.message : 'Drive upload failed. Please try again.',
      }));
    } finally {
      setUploading(false);
    }
  };

  const activeFolderObj = availableFolders.find(f => f.id === selectedFolderId);

  return (
    <div className="neon-card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border"
          style={{ borderColor: '#4285f455', color: '#8ab4ff', background: 'rgba(66,133,244,0.13)' }}
        >
          <Cloud size={22} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-black text-white">{state.connected ? 'Google Drive Linked' : 'Connect Google Drive'}</h2>
            {state.connected && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Connected
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-6 text-white/58">
            {state.connected
              ? mediaCount > 0
                ? `${mediaCount} ${mediaCount === 1 ? 'memory' : 'memories'} ready${activeFolderObj ? ` from "${activeFolderObj.name}"` : ' from Google Drive'}.`
                : 'Connected — no photos found in this Drive folder yet. Choose another folder or upload photos.'
              : 'Connect Google Drive with one click to show all your Drive photos and choose folders.'}
          </p>
          {(state.message || state.error) && (
            <p className={`mt-3 text-xs leading-5 ${state.error ? 'text-rose-200' : 'text-white/58'}`} role={state.error ? 'alert' : undefined}>
              {state.error || state.message}
            </p>
          )}
          {state.connected && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label
                className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs text-white/80"
                style={{ borderColor: `${config.primary}35`, background: 'rgba(255,255,255,0.04)' }}
              >
                <FolderOpen size={13} style={{ color: '#8ab4ff' }} />
                <span>Drive Folder:</span>
                <select
                  value={selectedFolderId}
                  onChange={e => void handleFolderChange(e.target.value)}
                  className="max-w-[190px] bg-transparent font-semibold text-white outline-none sm:max-w-[230px]"
                  aria-label="Choose Google Drive folder"
                >
                  <option value="" className="bg-slate-950 text-white">
                    All My Drive photos
                  </option>
                  {availableFolders.map(folder => (
                    <option key={folder.id} value={folder.id} className="bg-slate-950 text-white">
                      {folder.name}
                    </option>
                  ))}
                </select>
              </label>
              <span
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-white/64"
                style={{ borderColor: `${config.primary}24` }}
              >
                <Check size={12} style={{ color: '#36f1cd' }} />
                {mediaCount === 0 ? 'No photos found' : `${mediaCount} items`}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
        <motion.button
          type="button"
          onClick={() => void handleConnect()}
          disabled={state.loading}
          whileHover={{ scale: state.loading ? 1 : 1.02 }}
          whileTap={{ scale: state.loading ? 1 : 0.98 }}
          className="neon-button flex items-center justify-center gap-2 px-5 py-3 text-sm font-black disabled:opacity-70"
          style={{ color: state.connected ? '#36f1cd' : '#8ab4ff', borderColor: state.connected ? '#36f1cd55' : '#4285f455' }}
        >
          {state.loading ? <Loader2 size={15} className="animate-spin" /> : <Cloud size={15} />}
          {state.loading ? 'Syncing Drive...' : state.connected ? 'Sync Google Drive' : 'Connect Google Drive'}
        </motion.button>
        {state.loading && (
          <button
            type="button"
            onClick={handleCancelSync}
            className="neon-button flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-black text-amber-200 hover:text-white"
            style={{ borderColor: 'rgba(251, 191, 36, 0.55)', background: 'rgba(245, 158, 11, 0.16)' }}
            title="Cancel Google Drive sync"
          >
            <X size={15} />
            Cancel
          </button>
        )}
        {state.connected && (
          <>
            <button
              type="button"
              className="neon-button flex items-center justify-center gap-2 px-5 py-3 text-sm font-black disabled:cursor-wait disabled:opacity-55"
              style={{ color: config.primary, borderColor: config.primary + '44' }}
              disabled={state.loading || uploading}
              onClick={() => uploadInputRef.current?.click()}
            >
              <Upload size={15} />
              {uploading ? 'Uploading...' : 'Upload to Drive'}
            </button>
            <button
              type="button"
              className="memoriya-disconnect-btn flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-black transition-all disabled:opacity-55"
              onClick={() => {
                driveAbortRef.current?.abort();
                driveAbortRef.current = null;
                clearDriveSession();
                setState({
                  ...emptyState,
                  message: 'Google Drive disconnected and Drive photos cleared.',
                });
                setSelectedFolderId('');
                setAvailableFolders([]);
                setMediaCount(0);
              }}
              title="Disconnect Google Drive"
            >
              <LogOut size={15} />
              Disconnect Google Drive
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

export default DriveConnectPanel;
