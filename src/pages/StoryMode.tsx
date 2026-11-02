import React, { useEffect, useMemo, useRef, useState } from 'react';
import MemoryReel from '../components/MemoryReel';
import { isVisualMemory, type Memory } from '../data/memories';
import {
  acquireDriveSyncLock,
  DRIVE_ACCESS_TOKEN_UPDATED_EVENT,
  DRIVE_MEMORIES_UPDATED_EVENT,
  clearDriveChangePageToken,
  readDriveAccessToken,
  readDriveAuthRequired,
  readDriveChangePageToken,
  readDriveFolderId,
  readDriveFolders,
  readDriveMemories,
  releaseDriveSyncLock,
  removeDriveMemories,
  saveDriveAccessToken,
  saveDriveAuthRequired,
  saveDriveChangePageToken,
  saveDriveMemories,
  upgradeDriveImageUrls,
} from '../services/driveLibrary';
import { googleDriveService, isDriveAuthorizationError, isVisualDriveFile } from '../services/googleDriveService';
import { cacheDriveMediaFiles, cacheDriveMemories, deleteCachedDriveMedia, hydrateCachedDriveMemories, releaseCachedObjectUrls } from '../services/driveCache';
import { deleteCachedStoryMedia } from '../services/storyMediaCache';

interface StoryModeProps {
  onExit: () => void;
}

const normalizeFolderId = (folderId?: string) =>
  !folderId || folderId === 'drive-root' ? '' : folderId;

const compareDriveMemories = (a: Memory, b: Memory) => {
  // Prefer modifiedTime when comparing newly synced live items so photos with
  // older EXIF capture dates still surface reliably, while preserving date order.
  const dateDelta = new Date(b.date).getTime() - new Date(a.date).getTime();
  if (dateDelta) return dateDelta;
  return (a.driveFileId || a.id).localeCompare(b.driveFileId || b.id);
};

const StoryMode: React.FC<StoryModeProps> = ({ onExit }) => {
  const localInputRef = useRef<HTMLInputElement>(null);
  const [localMemories, setLocalMemories] = useState<Memory[]>([]);
  const [driveMemories, setDriveMemories] = useState<Memory[]>(() => readDriveMemories());
  const [driveAccessToken, setDriveAccessToken] = useState(() => readDriveAccessToken());
  const [driveFolders, setDriveFolders] = useState<Array<{ id: string; name: string }>>(() => {
    const savedFolders = readDriveFolders();
    return readDriveAccessToken() ? [{ id: '', name: 'All My Drive photos' }, ...savedFolders] : [];
  });
  const [selectedFolderId, setSelectedFolderId] = useState(() => normalizeFolderId(readDriveFolderId()));
  const [driveLoading, setDriveLoading] = useState(() => Boolean(driveAccessToken && !readDriveMemories().length));
  const [driveError, setDriveError] = useState('');
  const folderChangedRef = useRef(false);
  const objectUrlsRef = useRef<string[]>([]);
  const driveObjectUrlsRef = useRef<string[]>([]);
  const cacheHydrationGenerationRef = useRef(0);
  const knownDriveMemoriesRef = useRef<Memory[]>([]);
  const driveAuthRequiredRef = useRef(readDriveAuthRequired());
  const newlyImportedIdsRef = useRef<Set<string>>(new Set());

  const storyMemories = useMemo(() => {
    const byKey = new Map<string, Memory>();
    const sourceMemories = driveAccessToken || driveMemories.length
      ? [...driveMemories, ...localMemories]
      : localMemories;
    sourceMemories.forEach(memory => {
      byKey.set(memory.driveFileId || memory.id, memory);
    });
    const sorted = Array.from(byKey.values()).sort(compareDriveMemories);
    // Keep newly uploaded live Drive photos at the front of the incoming diff
    // so MemoryReel queues them as the very next shot (shot + 1) even if their
    // EXIF capture timestamp is older than existing photos in the library.
    if (!newlyImportedIdsRef.current.size) return sorted;
    const fresh: Memory[] = [];
    const rest: Memory[] = [];
    sorted.forEach(memory => {
      const key = memory.driveFileId || memory.id;
      if (newlyImportedIdsRef.current.has(key)) fresh.push(memory);
      else rest.push(memory);
    });
    return [...fresh, ...rest];
  }, [driveAccessToken, driveMemories, localMemories]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
      releaseCachedObjectUrls(driveObjectUrlsRef.current);
    };
  }, []);

  useEffect(() => {
    const onTokenUpdated = (event: Event) => {
      const token = (event as CustomEvent<string>).detail;
      if (!token) {
        driveAuthRequiredRef.current = true;
        return;
      }
      driveAuthRequiredRef.current = false;
      setDriveAccessToken(token);
      setDriveMemories(current => current.map(memory => memory.driveFileId
        ? upgradeDriveImageUrls({ ...memory, authToken: token })
        : memory));
    };
    window.addEventListener(DRIVE_ACCESS_TOKEN_UPDATED_EVENT, onTokenUpdated);
    return () => window.removeEventListener(DRIVE_ACCESS_TOKEN_UPDATED_EVENT, onTokenUpdated);
  }, []);

  useEffect(() => {
    const activeFolderId = normalizeFolderId(selectedFolderId);
    const onMemoriesUpdated = async () => {
      const generation = ++cacheHydrationGenerationRef.current;
      const previousIds = new Set(
        knownDriveMemoriesRef.current.map(memory => memory.driveFileId || memory.id),
      );
      const next = readDriveMemories().filter(
        memory => isVisualMemory(memory) && (!activeFolderId || memory.driveFileId),
      );
      next.forEach(memory => {
        const key = memory.driveFileId || memory.id;
        if (previousIds.size > 0 && !previousIds.has(key)) {
          newlyImportedIdsRef.current.add(key);
        }
      });
      knownDriveMemoriesRef.current = next;
      setDriveMemories(next);
      setDriveLoading(false);
      const hydrated = await hydrateCachedDriveMemories(next);
      if (generation !== cacheHydrationGenerationRef.current) {
        releaseCachedObjectUrls(hydrated.objectUrls);
        return;
      }
      releaseCachedObjectUrls(driveObjectUrlsRef.current);
      driveObjectUrlsRef.current = hydrated.objectUrls;
      setDriveMemories(hydrated.memories);
    };
    window.addEventListener(DRIVE_MEMORIES_UPDATED_EVENT, onMemoriesUpdated);
    return () => window.removeEventListener(DRIVE_MEMORIES_UPDATED_EVENT, onMemoriesUpdated);
  }, [selectedFolderId]);

  useEffect(() => {
    const token = readDriveAccessToken();
    if (!token) return;
    void googleDriveService.listFolders(token)
      .then(folders => setDriveFolders([{ id: '', name: 'All My Drive photos' }, ...folders]))
      .catch(() => {
        setDriveFolders(current => current.length ? current : [{ id: '', name: 'All My Drive photos' }]);
      });
  }, [driveAccessToken]);

  useEffect(() => {
    const seed = folderChangedRef.current ? [] : readDriveMemories();
    folderChangedRef.current = false;
    let token = seed[0]?.authToken || readDriveAccessToken();
    const folderId = normalizeFolderId(selectedFolderId);
    let active = true;
    let known = seed.filter(isVisualMemory);
    knownDriveMemoriesRef.current = known;
    let syncBusy = false;
    let changePageToken = readDriveChangePageToken();
    let lastFullReconcileAt = 0;

    const applyCached = async (next: Memory[]) => {
      const generation = ++cacheHydrationGenerationRef.current;
      const result = await hydrateCachedDriveMemories(next);
      if (!active || generation !== cacheHydrationGenerationRef.current) {
        releaseCachedObjectUrls(result.objectUrls);
        return;
      }
      releaseCachedObjectUrls(driveObjectUrlsRef.current);
      driveObjectUrlsRef.current = result.objectUrls;
      setDriveMemories(result.memories);
    };

    void applyCached(known);
    if (token) void cacheDriveMemories(known, token).then(() => applyCached(knownDriveMemoriesRef.current));

    const syncDrive = async () => {
      if (syncBusy || !acquireDriveSyncLock()) return;
      known = knownDriveMemoriesRef.current;
      token = readDriveAccessToken() || token;
      if (!token) {
        releaseDriveSyncLock();
        return;
      }
      syncBusy = true;
      setDriveError('');
      try {
        let files: Awaited<ReturnType<typeof googleDriveService.listAllMedia>> = [];
        let removedFromFeed: string[] = [];
        const fullReconcileDue = !lastFullReconcileAt || Date.now() - lastFullReconcileAt >= 30000;
        let fullSnapshot = !changePageToken || fullReconcileDue;
        const readDriveUpdates = async () => {
          if (!changePageToken || fullReconcileDue) {
            if (!changePageToken) changePageToken = await googleDriveService.getStartPageToken(token);
            fullSnapshot = true;
            lastFullReconcileAt = Date.now();
            files = await googleDriveService.listAllMedia(token, folderId);
            return files;
          }
          fullSnapshot = false;
          let pageToken = changePageToken;
          let nextStartPageToken = '';
          const changedFiles: Awaited<ReturnType<typeof googleDriveService.listAllMedia>> = [];
          const listChanges = googleDriveService['listChanges'].bind(googleDriveService);
          do {
            const page = await listChanges(token, pageToken);
            page.changes.forEach(change => {
              if (change.removed || !change.file) removedFromFeed.push(change.fileId);
              else changedFiles.push(change.file);
            });
            pageToken = page.nextPageToken || '';
            nextStartPageToken = page.newStartPageToken || nextStartPageToken;
          } while (pageToken && active);
          changePageToken = nextStartPageToken || changePageToken;
          return changedFiles;
        };
        try {
          files = await readDriveUpdates();
          if (active && !fullSnapshot) {
            const latestPage = await googleDriveService.listMediaPage(token, '', folderId, 100, 'modifiedTime desc');
            const knownFileIds = new Set(files.map(file => file.id));
            files = [...files, ...latestPage.files.filter(file => !knownFileIds.has(file.id))];
          }
        } catch (listError) {
          if (!isDriveAuthorizationError(listError)) throw listError;
          token = await googleDriveService.refreshAccessToken(undefined, true);
          saveDriveAccessToken(token);
          driveAuthRequiredRef.current = false;
          saveDriveAuthRequired(false);
          if (fullSnapshot) {
            changePageToken = '';
            removedFromFeed = [];
          }
          files = await readDriveUpdates();
        }
        if (!active) return;
        const visualFiles = files.filter(
          file => isVisualDriveFile(file) && !file.trashed && (!folderId || !file.parents || file.parents.includes(folderId)),
        );
        const knownByDriveId = new Map(
          known.filter(memory => memory.driveFileId).map(memory => [memory.driveFileId as string, memory]),
        );
        const imported = visualFiles
          .map(file => googleDriveService.toMemory(file, token))
          .filter(memory => {
            const existing = memory.driveFileId ? knownByDriveId.get(memory.driveFileId) : undefined;
            if (!existing) return true;
            return existing.title !== memory.title
              || existing.date !== memory.date
              || existing.type !== memory.type
              || existing.mimeType !== memory.mimeType
              || existing.modifiedTime !== memory.modifiedTime
              || existing.orientation !== memory.orientation
              || existing.width !== memory.width
              || existing.height !== memory.height
              || (!memory.modifiedTime && existing.thumbnail !== memory.thumbnail);
          });
        imported.forEach(memory => {
          const key = memory.driveFileId || memory.id;
          if (!knownByDriveId.has(key)) {
            newlyImportedIdsRef.current.add(key);
          }
        });
        const importedById = new Map(imported.map(memory => [memory.driveFileId, memory]));
        const changedIds = new Set([...files.map(file => file.id), ...removedFromFeed]);
        const visibleIds = new Set(visualFiles.map(file => file.id));
        const removed = new Set(known
          .filter(memory => memory.driveFileId && (fullSnapshot
            ? !visibleIds.has(memory.driveFileId)
            : changedIds.has(memory.driveFileId) && !visibleIds.has(memory.driveFileId)))
          .map(memory => memory.driveFileId as string));
        removed.forEach(id => newlyImportedIdsRef.current.delete(id));
        known = known.filter(memory => !memory.driveFileId || !removed.has(memory.driveFileId));
        known = known.map(memory => memory.driveFileId && importedById.get(memory.driveFileId)
          ? importedById.get(memory.driveFileId)!
          : memory);
        const knownIds = new Set(known.map(memory => memory.driveFileId || memory.id));
        known = [...known, ...imported.filter(memory => !knownIds.has(memory.driveFileId || memory.id))]
          .sort(compareDriveMemories);
        knownDriveMemoriesRef.current = known;

        if (removed.size) {
          removeDriveMemories(removed);
          void Promise.all(Array.from(removed).flatMap(id => [deleteCachedDriveMedia(id), deleteCachedStoryMedia(id)]));
        }
        if (imported.length) {
          const importedIds = new Set(imported.map(memory => memory.driveFileId).filter(Boolean));
          void cacheDriveMediaFiles(visualFiles.filter(file => importedIds.has(file.id)), token)
            .then(() => applyCached(knownDriveMemoriesRef.current));
        }
        if (removed.size || imported.length) {
          const latestShared = readDriveMemories();
          const currentKnownIds = new Set(known.map(memory => memory.driveFileId || memory.id));
          const freshPublished = latestShared.filter(memory => {
            const key = memory.driveFileId || memory.id;
            return !currentKnownIds.has(key) && (!memory.driveFileId || !removed.has(memory.driveFileId));
          });
          freshPublished.forEach(memory => newlyImportedIdsRef.current.add(memory.driveFileId || memory.id));
          const mergedKnown = [...known, ...freshPublished].sort(compareDriveMemories);
          known = mergedKnown;
          knownDriveMemoriesRef.current = mergedKnown;
          saveDriveMemories(mergedKnown, token, folderId);
          setDriveMemories(current => {
            const currentById = new Map(current.map(memory => [memory.driveFileId || memory.id, memory]));
            mergedKnown.forEach(memory => currentById.set(memory.driveFileId || memory.id, memory));
            removed.forEach(id => currentById.delete(id));
            return Array.from(currentById.values()).sort(compareDriveMemories);
          });
          // BUG FIX: Pass mergedKnown (including freshPublished) instead of known
          // so camera uploads published during an active scan are never overwritten!
          void applyCached(mergedKnown);
        }
        saveDriveChangePageToken(changePageToken);
      } catch (syncError) {
        if (syncError instanceof Error && /Drive scan failed \(4\d\d\)/i.test(syncError.message)) {
          clearDriveChangePageToken();
        }
        if (isDriveAuthorizationError(syncError)) {
          driveAuthRequiredRef.current = true;
          saveDriveAuthRequired(true);
          clearDriveChangePageToken();
          setDriveError('Drive needs to reconnect. Return to Memoriya and tap Sync Drive once. Cached memories will keep playing.');
        } else {
          setDriveError('Drive is temporarily unavailable. Cached memories will keep playing.');
        }
      } finally {
        syncBusy = false;
        releaseDriveSyncLock();
        if (active) setDriveLoading(false);
      }
    };

    const LIVE_STORY_POLL_MS = 8000;
    const LIVE_STORY_COOLDOWN_MS = 6000;
    const LIVE_STORY_FAST_POLL_MS = 2000;
    const LIVE_STORY_ACTIVE_COOLDOWN_MS = 1000;
    let lastSyncAt = 0;

    const retryDrive = () => {
      if (document.visibilityState !== 'visible') return;
      // CRITICAL BUG FIX: standard DOM property is navigator.onLine (capital L),
      // NOT navigator.online (which was undefined, making !navigator.online === true
      // and permanently blocking all live Drive polls while Story Mode was playing).
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const retryCooldown = document.visibilityState === 'visible'
        ? LIVE_STORY_ACTIVE_COOLDOWN_MS
        : LIVE_STORY_COOLDOWN_MS;
      if (Date.now() - lastSyncAt < retryCooldown) return;
      lastSyncAt = Date.now();
      void syncDrive();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') retryDrive();
    };

    window.addEventListener('online', retryDrive);
    window.addEventListener('focus', retryDrive);
    document.addEventListener('visibilitychange', onVisibilityChange);
    void syncDrive();
    const interval = window.setInterval(retryDrive, LIVE_STORY_POLL_MS);
    const fastInterval = window.setInterval(retryDrive, LIVE_STORY_FAST_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.clearInterval(fastInterval);
      window.removeEventListener('online', retryDrive);
      window.removeEventListener('focus', retryDrive);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [driveAccessToken, selectedFolderId]);

  const changeDriveFolder = (folderId: string) => {
    const normalized = normalizeFolderId(folderId);
    if (normalized === selectedFolderId) return;
    folderChangedRef.current = true;
    newlyImportedIdsRef.current.clear();
    saveDriveMemories([], readDriveAccessToken(), normalized);
    clearDriveChangePageToken();
    setDriveLoading(true);
    setDriveError('');
    setSelectedFolderId(normalized);
    setDriveMemories([]);
  };

  const reconnectDrive = async (): Promise<string | undefined> => {
    try {
      const token = await googleDriveService.refreshAccessToken();
      driveAuthRequiredRef.current = false;
      saveDriveAuthRequired(false);
      saveDriveAccessToken(token);
      setDriveAccessToken(token);
      return token;
    } catch (error) {
      setDriveError(error instanceof Error ? error.message : 'Google Drive could not reconnect.');
      return undefined;
    }
  };

  const importLocalFiles = (files: FileList | null) => {
    const mediaFiles = Array.from(files || []).filter(file =>
      file.type.startsWith('image/') || file.type.startsWith('video/')
    );
    if (!mediaFiles.length) return;

    objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];

    const now = new Date();
    const nextMemories = mediaFiles.map((file, index) => {
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video/');
      objectUrlsRef.current.push(url);
      return {
        id: `local-${file.name}-${file.lastModified}-${index}`,
        title: file.name.replace(/\.[^.]+$/, ''),
        caption: 'Local story media',
        date: new Date(file.lastModified || now.getTime()).toISOString(),
        year: new Date(file.lastModified || now.getTime()).getFullYear(),
        month: new Date(file.lastModified || now.getTime()).getMonth() + 1,
        type: isVideo ? 'video' : 'photo',
        url,
        thumbnail: isVideo ? '' : url,
        mimeType: file.type,
        tags: ['local', isVideo ? 'video' : 'photo'],
        event: 'Local Story',
      } satisfies Memory;
    });

    setLocalMemories(nextMemories);
  };

  const localPicker = (
    <input
      ref={localInputRef}
      type="file"
      accept="image/*,video/*"
      multiple
      className="hidden"
      onChange={event => {
        importLocalFiles(event.currentTarget.files);
        event.currentTarget.value = '';
      }}
    />
  );

  if (!storyMemories.length) {
    return (
      <div className="fixed inset-0 z-[5] grid place-items-center bg-black px-4 text-white">
        {localPicker}
        <section className="neon-card max-w-md p-6 text-center" data-drive-error={driveError || undefined}>
          <h1 className="text-2xl font-black">{driveLoading ? 'Loading Drive story...' : 'No story yet'}</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">
            Connect Google Drive in Memoriya, or choose local photos/videos from this device – the story starts
            immediately with thumbnails and upgrades to full quality as each slide plays.
          </p>
          {driveFolders.length > 1 && (
            <label className="mt-5 flex flex-col gap-2 text-left text-xs font-black uppercase tracking-[0.14em] text-white/60">
              Drive folder
              <select className="rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-sm normal-case tracking-normal text-white" value={selectedFolderId} onChange={event => changeDriveFolder(event.target.value)}>
                {driveFolders.map(folder => <option key={folder.id || 'all'} value={folder.id} className="bg-slate-900">{folder.name}</option>)}
              </select>
            </label>
          )}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button type="button" onClick={() => localInputRef.current?.click()} className="neon-button px-4 py-2 text-sm font-black">Use Local Photos</button>
            <button type="button" onClick={onExit} className="neon-button px-4 py-2 text-sm font-black">Back to Memoriya</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[5] overflow-hidden bg-black">
      {localPicker}
      <MemoryReel
        memories={storyMemories}
        title={{ line: storyMemories[0].event || 'Memoriya story', big: String(storyMemories[0].year) }}
        driveAccessToken={driveAccessToken || storyMemories[0].authToken}
        driveFolderId={selectedFolderId}
        driveFolders={driveFolders}
        onDriveFolderChange={changeDriveFolder}
        onDriveReconnect={reconnectDrive}
        onClose={onExit}
      />
    </div>
  );
};

export default StoryMode;
