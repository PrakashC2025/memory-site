import React, { useEffect, useRef, useState } from 'react';
import MemoryReel from '../components/MemoryReel';
import { isVisualMemory, type Memory } from '../data/memories';
import { acquireDriveSyncLock, DRIVE_ACCESS_TOKEN_UPDATED_EVENT, DRIVE_MEMORIES_UPDATED_EVENT, clearDriveChangePageToken, readDriveAccessToken, readDriveAuthRequired, readDriveFolderId, readDriveFolders, readDriveMemories, releaseDriveSyncLock, removeDriveMemories, saveDriveAccessToken, saveDriveAuthRequired, saveDriveMemories, upgradeDriveImageUrls } from '../services/driveLibrary';
import { googleDriveService, isDriveAuthorizationError, isVisualDriveFile } from '../services/googleDriveService';
import { cacheDriveMediaFiles, cacheDriveMemories, deleteCachedDriveMedia, hydrateCachedDriveMemories, releaseCachedObjectUrls } from '../services/driveCache';
import { deleteCachedStoryMedia } from '../services/storyMediaCache';

interface StoryModeProps {
  onExit: () => void;
}

const StoryMode: React.FC<StoryModeProps> = ({ onExit }) => {
  const localInputRef = useRef<HTMLInputElement>(null);
  const [localMemories, setLocalMemories] = useState<Memory[]>([]);
  const [driveMemories, setDriveMemories] = useState<Memory[]>(() => readDriveMemories());
  const [driveAccessToken, setDriveAccessToken] = useState(() => readDriveAccessToken());
  const [driveFolders, setDriveFolders] = useState<Array<{ id: string; name: string }>>(() => {
    const savedFolders = readDriveFolders();
    return readDriveAccessToken() ? [{ id: '', name: 'All My Drive photos' }, ...savedFolders] : [];
  });
  const [selectedFolderId, setSelectedFolderId] = useState(() => readDriveFolderId());
  const [driveLoading, setDriveLoading] = useState(() => Boolean(driveAccessToken && !readDriveMemories().length));
  const [driveError, setDriveError] = useState('');
  const folderChangedRef = useRef(false);
  const objectUrlsRef = useRef<string[]>([]);
  const driveObjectUrlsRef = useRef<string[]>([]);
  const cacheHydrationGenerationRef = useRef(0);
  const knownDriveMemoriesRef = useRef<Memory[]>([]);
  const driveAuthRequiredRef = useRef(readDriveAuthRequired());
  const storyMemories = localMemories.length ? localMemories : driveMemories;

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
      const onMemoriesUpdated = async () => {
        if (localMemories.length) return;
      const generation = ++cacheHydrationGenerationRef.current;
      const next = readDriveMemories().filter(memory => isVisualMemory(memory) && (!selectedFolderId || memory.driveFileId));
      knownDriveMemoriesRef.current = next;
      // Publish the fresh Drive metadata immediately. Waiting for every
      // cached original in a large library made a newly uploaded photo miss
      // the live reel even though Drive had already found it.
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
  }, [localMemories.length, selectedFolderId]);

  useEffect(() => {
    const token = readDriveAccessToken();
    if (!token) return;
    void googleDriveService.listFolders(token)
      .then(folders => setDriveFolders([{ id: '', name: 'All My Drive photos' }, ...folders]))
      .catch(() => {
        // Keep the last folder list saved by Memoriya if Drive is temporarily
        // unavailable or the short-lived access token needs renewal.
        setDriveFolders(current => current.length ? current : [{ id: '', name: 'All My Drive photos' }]);
      });
  }, [driveAccessToken]);

  useEffect(() => {
    const seed = folderChangedRef.current ? [] : readDriveMemories();
    folderChangedRef.current = false;
    let token = seed[0]?.authToken || readDriveAccessToken();
    const folderId = selectedFolderId;
    let active = true;
    let known = seed.filter(isVisualMemory);
    knownDriveMemoriesRef.current = known;
    let syncBusy = false;

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
      if (driveAuthRequiredRef.current || readDriveAuthRequired() || syncBusy || !acquireDriveSyncLock()) return;
      known = knownDriveMemoriesRef.current;
      token = readDriveAccessToken() || token;
      if (!token) {
        releaseDriveSyncLock();
        return;
      }
      syncBusy = true;
      setDriveError('');
      try {
        let files: Awaited<ReturnType<typeof googleDriveService.listAllMedia>>;
        try {
          files = await googleDriveService.listAllMedia(token, folderId);
        } catch (listError) {
          if (!isDriveAuthorizationError(listError)) throw listError;
          token = await googleDriveService.refreshAccessToken(undefined, true);
          saveDriveAccessToken(token);
          driveAuthRequiredRef.current = false;
          saveDriveAuthRequired(false);
          files = await googleDriveService.listAllMedia(token, folderId);
        }
        if (!active) return;
        const visualFiles = files.filter(file => isVisualDriveFile(file) && !file.trashed);
        const knownByDriveId = new Map(
          known.filter(memory => memory.driveFileId).map(memory => [memory.driveFileId as string, memory]),
        );
        const imported = visualFiles
          .map(file => googleDriveService.toMemory(file, token))
          .filter(memory => {
            const existing = memory.driveFileId ? knownByDriveId.get(memory.driveFileId) : undefined;
            if (!existing) return true;
            return existing.title !== memory.title || existing.date !== memory.date || existing.type !== memory.type || existing.mimeType !== memory.mimeType || existing.thumbnail !== memory.thumbnail;
          });
        const importedById = new Map(imported.map(memory => [memory.driveFileId, memory]));
        const visibleIds = new Set(visualFiles.map(file => file.id));
        const removed = new Set(known
          .filter(memory => memory.driveFileId && !visibleIds.has(memory.driveFileId))
          .map(memory => memory.driveFileId as string));
        known = known.filter(memory => !memory.driveFileId || !removed.has(memory.driveFileId));
        known = known.map(memory => memory.driveFileId && importedById.get(memory.driveFileId)
          ? importedById.get(memory.driveFileId)!
          : memory);
        const knownIds = new Set(known.map(memory => memory.driveFileId || memory.id));
        known = [...known, ...imported.filter(memory => !knownIds.has(memory.driveFileId || memory.id))]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
          saveDriveMemories(known, token, folderId);
          setDriveMemories(current => {
            const currentById = new Map(current.map(memory => [memory.driveFileId || memory.id, memory]));
            known.forEach(memory => currentById.set(memory.driveFileId || memory.id, memory));
            removed.forEach(id => currentById.delete(id));
            return Array.from(currentById.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          });
          void applyCached(known);
        }
      } catch (syncError) {
        if (syncError instanceof Error && /Drive scan failed \(4\d\d\)/i.test(syncError.message)) {
          clearDriveChangePageToken();
        }
        if (isDriveAuthorizationError(syncError)) {
          driveAuthRequiredRef.current = true;
          saveDriveAuthRequired(true);
          // The saved changes cursor is tied to the expired authorization
          // session. Clear it so reconnecting performs a clean folder scan.
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

    const retryDrive = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      void syncDrive();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') retryDrive();
    };
    window.addEventListener('online', retryDrive);
    window.addEventListener('focus', retryDrive);
    document.addEventListener('visibilitychange', onVisibilityChange);
    void syncDrive();
    const interval = window.setInterval(retryDrive, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('online', retryDrive);
      window.removeEventListener('focus', retryDrive);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [driveAccessToken, selectedFolderId]);

  const changeDriveFolder = (folderId: string) => {
    if (folderId === selectedFolderId) return;
    folderChangedRef.current = true;
    saveDriveMemories([], readDriveAccessToken(), folderId);
    clearDriveChangePageToken();
    setDriveLoading(true);
    setDriveError('');
    setSelectedFolderId(folderId);
    setDriveMemories([]);
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
          <h1 className="text-2xl font-black">{driveLoading ? 'Loading Drive story…' : 'No story yet'}</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">
            Connect Google Drive in Memoriya, or choose local photos/videos from this device — the story starts
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
        onClose={onExit}
      />
    </div>
  );
};

export default StoryMode;
