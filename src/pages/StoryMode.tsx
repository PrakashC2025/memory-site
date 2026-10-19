import React, { useEffect, useRef, useState } from 'react';
import MemoryReel from '../components/MemoryReel';
import type { Memory } from '../data/memories';
import { readDriveAccessToken, readDriveFolderId, readDriveMemories, saveDriveMemories } from '../services/driveLibrary';
import { googleDriveService } from '../services/googleDriveService';
import { cacheDriveMediaFiles, cacheDriveMemories, hydrateCachedDriveMemories, releaseCachedObjectUrls } from '../services/driveCache';

interface StoryModeProps {
  onExit: () => void;
}

const StoryMode: React.FC<StoryModeProps> = ({ onExit }) => {
  const localInputRef = useRef<HTMLInputElement>(null);
  const [localMemories, setLocalMemories] = useState<Memory[]>([]);
  const [driveMemories, setDriveMemories] = useState<Memory[]>(() => readDriveMemories());
  const [driveFolders, setDriveFolders] = useState<Array<{ id: string; name: string }>>(() => (
    readDriveAccessToken() ? [{ id: '', name: 'All My Drive photos' }] : []
  ));
  const [selectedFolderId, setSelectedFolderId] = useState(() => readDriveFolderId());
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
      .catch(() => setDriveFolders([{ id: '', name: 'All My Drive photos' }]));
  }, []);

  useEffect(() => {
    const seed = folderChangedRef.current ? [] : readDriveMemories();
    folderChangedRef.current = false;
    const token = seed[0]?.authToken || readDriveAccessToken();
    const folderId = selectedFolderId;
    let active = true;
    let known = [...seed];

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
      if (!token) return;
      try {
        const page = await googleDriveService.listMediaPage(token, '', folderId);
        const knownIds = new Set(known.map(memory => memory.id));
        const newFiles = page.files.filter(file => !knownIds.has(`drive-${file.id}`));
        if (!newFiles.length) {
          // Keep the active reel untouched when Drive has not changed. The
          // cache check still runs silently for a changed file on Drive.
          void cacheDriveMediaFiles(page.files, token);
          return;
        }

        // Append new memories instead of sorting the wall again. Existing
        // photos keep their order and timing while the new photos wait their
        // turn later in the live loop.
        const newMemories = newFiles.map(file => googleDriveService.toMemory(file, token));
        known = [...known, ...newMemories];
        saveDriveMemories(known, token, folderId);
        // New media is appended without replacing the active blob URLs, so
        // the photo currently on screen keeps playing normally. Its full
        // local copy is downloaded silently for the next playback/open.
        setDriveMemories(current => [...current, ...newMemories]);
        void cacheDriveMediaFiles(newFiles, token);
      } catch {
        // Cached memories remain playable when Drive is temporarily offline.
      }
    };

    void syncDrive();
    const interval = window.setInterval(() => void syncDrive(), 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [selectedFolderId]);

  const changeDriveFolder = (folderId: string) => {
    if (folderId === selectedFolderId) return;
    folderChangedRef.current = true;
    saveDriveMemories([], readDriveAccessToken(), folderId);
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
        <section className="neon-card max-w-md p-6 text-center">
          <h1 className="text-2xl font-black">No story yet</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">
            Connect Google Drive in Memoriya, or choose local photos/videos from this device — the story starts
            immediately with thumbnails and upgrades to full quality as each slide plays.
          </p>
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
