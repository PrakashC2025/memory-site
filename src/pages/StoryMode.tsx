import React, { useEffect, useRef, useState } from 'react';
import MemoryReel from '../components/MemoryReel';
import type { Memory } from '../data/memories';
import { readDriveAccessToken, readDriveFolderId, readDriveFolders, readDriveMemories, saveDriveMemories } from '../services/driveLibrary';
import { googleDriveService } from '../services/googleDriveService';
import { cacheDriveMediaFiles, cacheDriveMemories, hydrateCachedDriveMemories, releaseCachedObjectUrls } from '../services/driveCache';

interface StoryModeProps {
  onExit: () => void;
}

const StoryMode: React.FC<StoryModeProps> = ({ onExit }) => {
  const localInputRef = useRef<HTMLInputElement>(null);
  const [localMemories, setLocalMemories] = useState<Memory[]>([]);
  const [driveMemories, setDriveMemories] = useState<Memory[]>(() => readDriveMemories());
  const [driveFolders, setDriveFolders] = useState<Array<{ id: string; name: string }>>(() => {
    const savedFolders = readDriveFolders();
    return readDriveAccessToken() ? [{ id: '', name: 'All My Drive photos' }, ...savedFolders] : [];
  });
  const [selectedFolderId, setSelectedFolderId] = useState(() => readDriveFolderId());
  const [driveLoading, setDriveLoading] = useState(() => Boolean(readDriveAccessToken() && !readDriveMemories().length));
  const [driveError, setDriveError] = useState('');
  const folderChangedRef = useRef(false);
  const objectUrlsRef = useRef<string[]>([]);
  const driveObjectUrlsRef = useRef<string[]>([]);
  const storyMemories = localMemories.length ? localMemories : driveMemories;

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
      releaseCachedObjectUrls(driveObjectUrlsRef.current);
    };
  }, []);

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
  }, []);

  useEffect(() => {
    const seed = folderChangedRef.current ? [] : readDriveMemories();
    folderChangedRef.current = false;
    const token = seed[0]?.authToken || readDriveAccessToken();
    const folderId = selectedFolderId;
    let active = true;
    let known = [...seed];
    let syncBusy = false;

    const applyCached = async (next: Memory[]) => {
      const result = await hydrateCachedDriveMemories(next);
      if (!active) {
        releaseCachedObjectUrls(result.objectUrls);
        return;
      }
      releaseCachedObjectUrls(driveObjectUrlsRef.current);
      driveObjectUrlsRef.current = result.objectUrls;
      setDriveMemories(result.memories);
    };

    void applyCached(known);
    if (token) void cacheDriveMemories(known, token).then(() => applyCached(known));

    const syncDrive = async () => {
      if (!token || syncBusy) return;
      syncBusy = true;
      setDriveError('');
      try {
        let pageToken = '';
        do {
          const page = await googleDriveService.listMediaPage(token, pageToken, folderId);
          if (!active) return;
          const knownIds = new Set(known.map(memory => memory.id));
          const newFiles = page.files.filter(file => !knownIds.has(`drive-${file.id}`));
          if (newFiles.length) {
            // Append new media without replacing the active reel. Existing
            // photos keep their order and new uploads wait for their turn.
            const newMemories = newFiles.map(file => googleDriveService.toMemory(file, token));
            known = [...known, ...newMemories];
            saveDriveMemories(known, token, folderId);
            setDriveMemories(current => [...current, ...newMemories]);
            void cacheDriveMediaFiles(newFiles, token).then(async () => {
              const cached = await hydrateCachedDriveMemories(newMemories);
              if (!active || !cached.objectUrls.length) {
                if (!active) releaseCachedObjectUrls(cached.objectUrls);
                return;
              }
              driveObjectUrlsRef.current.push(...cached.objectUrls);
              const cachedById = new Map(cached.memories.map(memory => [memory.id, memory]));
              setDriveMemories(current => current.map(memory => cachedById.get(memory.id) || memory));
            });
          } else {
            // Refresh the local cache silently when Drive has not changed.
            void cacheDriveMediaFiles(page.files, token);
          }
          pageToken = page.nextPageToken || '';
        } while (pageToken && active);
      } catch {
        setDriveError('Drive is temporarily unavailable. Cached memories will keep playing.');
      } finally {
        syncBusy = false;
        if (active) setDriveLoading(false);
      }
    };

    void syncDrive();
    const interval = window.setInterval(() => void syncDrive(), 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [selectedFolderId]);

  const changeDriveFolder = (folderId: string) => {
    if (folderId === selectedFolderId) return;
    folderChangedRef.current = true;
    saveDriveMemories([], readDriveAccessToken(), folderId);
    setDriveLoading(true);
    setDriveError('');
    setSelectedFolderId(folderId);
    setDriveMemories([]);
  };

  const importLocalFiles = (files: FileList | null) => {
    const mediaFiles = Array.from(files || []).filter(file => file.type.startsWith('image/'));
    if (!mediaFiles.length) return;

    objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];

    const now = new Date();
    const nextMemories = mediaFiles.map((file, index) => {
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.push(url);
      return {
        id: `local-${file.name}-${file.lastModified}-${index}`,
        title: file.name.replace(/\.[^.]+$/, ''),
        caption: 'Local story media',
        date: new Date(file.lastModified || now.getTime()).toISOString(),
        year: new Date(file.lastModified || now.getTime()).getFullYear(),
        month: new Date(file.lastModified || now.getTime()).getMonth() + 1,
        type: 'photo',
        url,
        thumbnail: url,
        mimeType: file.type,
        tags: ['local', 'photo'],
        event: 'Local Story',
      } satisfies Memory;
    });

    setLocalMemories(nextMemories);
  };

  const localPicker = (
    <input
      ref={localInputRef}
      type="file"
      accept="image/*"
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
            <button onClick={() => localInputRef.current?.click()} className="neon-button px-4 py-2 text-sm font-black">Use Local Photos</button>
            <button onClick={onExit} className="neon-button px-4 py-2 text-sm font-black">Back to Memoriya</button>
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
        driveAccessToken={readDriveAccessToken() || storyMemories[0].authToken}
        driveFolderId={selectedFolderId}
        driveFolders={driveFolders}
        onDriveFolderChange={changeDriveFolder}
        onClose={onExit}
      />
    </div>
  );
};

export default StoryMode;
