import React, { useEffect, useRef, useState } from 'react';
import MemoryLightbox from '../components/MemoryLightbox';
import type { Memory } from '../data/memories';
import { readDriveMemories } from '../services/driveLibrary';
import { getStoryMediaCacheKey, readCachedStoryMedia, writeCachedStoryMedia } from '../services/storyMediaCache';

interface StoryModeProps {
  onExit: () => void;
}

const StoryMode: React.FC<StoryModeProps> = ({ onExit }) => {
  const localInputRef = useRef<HTMLInputElement>(null);
  const [localMemories, setLocalMemories] = useState<Memory[]>([]);
  const [driveMemories] = useState<Memory[]>(() => readDriveMemories());
  const [preparedDriveMemories, setPreparedDriveMemories] = useState<Memory[]>([]);
  const [isPreparingDrive, setIsPreparingDrive] = useState(false);
  const [cacheChecked, setCacheChecked] = useState(false);
  const [prepareCount, setPrepareCount] = useState(0);
  const objectUrlsRef = useRef<string[]>([]);
  const driveObjectUrlsRef = useRef<string[]>([]);
  const storyMemories = localMemories.length ? localMemories : preparedDriveMemories;

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
      driveObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      driveObjectUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (localMemories.length || !driveMemories.length) return undefined;

    let cancelled = false;
    const openingCount = 12;
    const openingFetchLimit = 1;
    const backgroundFetchLimit = 1;
    const localStartupLimit = 48;
    const visibleStartCount = 10;
    const playableDriveMemories = driveMemories.filter(memory => memory.type === 'photo' || memory.type === 'video');
    const preparedKeys = new Set<string>();

    if (!playableDriveMemories.length) {
      setIsPreparingDrive(false);
      setPreparedDriveMemories([]);
      return undefined;
    }

    const buildLocalMemory = (memory: Memory, blob: Blob) => {
      const objectUrl = URL.createObjectURL(blob);
      driveObjectUrlsRef.current.push(objectUrl);
      return {
        ...memory,
        url: objectUrl,
        thumbnail: memory.type === 'photo' ? objectUrl : memory.thumbnail,
        mimeType: memory.mimeType || blob.type,
        authToken: undefined,
        driveFileId: undefined,
      } satisfies Memory;
    };

    const appendPrepared = (items: Memory[]) => {
      const fresh = items.filter(item => {
        const key = item.id;
        if (preparedKeys.has(key)) return false;
        preparedKeys.add(key);
        return true;
      });
      if (fresh.length) setPreparedDriveMemories(current => [...current, ...fresh]);
    };

    const idleDelay = (ms = 0) =>
      new Promise<void>(resolve => {
        const idle = (window as unknown as { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
        if (idle) {
          idle(() => resolve(), { timeout: Math.max(250, ms) });
          return;
        }
        window.setTimeout(resolve, ms || 16);
      });

    const readCachedMemory = async (memory: Memory): Promise<Memory | null> => {
      if (!memory.url) return null;
      const cacheKey = getStoryMediaCacheKey(memory);
      const cachedBlob = await readCachedStoryMedia(cacheKey);
      if (!cachedBlob || cancelled) return null;
      return buildLocalMemory(memory, cachedBlob);
    };

    const downloadMemory = async (memory: Memory): Promise<Memory | null> => {
      if (!memory.url) return null;
      const cacheKey = getStoryMediaCacheKey(memory);
      try {
        const mediaUrl = memory.driveFileId
          ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(memory.driveFileId)}?alt=media`
          : memory.url;
        const response = await fetch(mediaUrl, {
          headers: memory.authToken ? { Authorization: `Bearer ${memory.authToken}` } : undefined,
          cache: 'force-cache',
        });
        if (!response.ok) throw new Error(`Media failed ${response.status}`);
        const blob = await response.blob();
        if (blob.type.includes('text/html') || blob.type.includes('application/json')) {
          throw new Error('Drive returned a page instead of media');
        }
        if (cancelled) return null;
        void writeCachedStoryMedia(cacheKey, blob, memory.mimeType || blob.type);
        return buildLocalMemory(memory, blob);
      } catch {
        return null;
      }
    };

    const prepareBatch = async (batch: Memory[], fetchLimit: number) => {
      const prepared: Memory[] = [];
      for (let index = 0; index < batch.length && !cancelled; index += fetchLimit) {
        const group = batch.slice(index, index + fetchLimit);
        const result = await Promise.all(group.map(async memory => {
          const cached = await readCachedMemory(memory);
          return cached || downloadMemory(memory);
        }));
        prepared.push(...result.filter((memory): memory is Memory => Boolean(memory)));
        if (!cancelled) setPrepareCount(count => count + group.length);
        await idleDelay(80);
      }
      return prepared;
    };

    const waitForQuietMoment = () =>
      new Promise<void>(resolve => {
        window.setTimeout(resolve, 4500);
      });

    const run = async () => {
      setPreparedDriveMemories([]);
      setPrepareCount(0);

      const missing: Memory[] = [];
      const cachedBuffer: Memory[] = [];
      let openedFromCache = false;

      for (const memory of playableDriveMemories.slice(0, localStartupLimit)) {
        await idleDelay();
        const cached = await readCachedMemory(memory);
        if (cancelled) return;
        if (cached) {
          cachedBuffer.push(cached);
          if (!openedFromCache || cachedBuffer.length >= visibleStartCount) {
            appendPrepared(cachedBuffer.splice(0));
            openedFromCache = true;
            setIsPreparingDrive(false);
            setCacheChecked(true);
          }
        } else {
          missing.push(memory);
        }
      }

      if (cancelled) return;
      appendPrepared(cachedBuffer);
      setCacheChecked(true);
      missing.push(...playableDriveMemories.slice(localStartupLimit));

      if (!openedFromCache && !cachedBuffer.length) {
        setIsPreparingDrive(true);
        let openingItems = missing.filter(memory => memory.type === 'photo').slice(0, openingCount);
        if (!openingItems.length) openingItems = missing.slice(0, Math.min(4, openingCount));
        const openingIds = new Set(openingItems.map(memory => memory.id));
        const firstBatch = await prepareBatch(openingItems, openingFetchLimit);
        if (cancelled) return;
        appendPrepared(firstBatch);
        for (let index = missing.length - 1; index >= 0; index -= 1) {
          if (openingIds.has(missing[index].id)) missing.splice(index, 1);
        }
      }

      setIsPreparingDrive(false);

      for (let start = 0; start < missing.length && !cancelled; start += backgroundFetchLimit) {
        await waitForQuietMoment();
        const nextGroup = await prepareBatch(missing.slice(start, start + backgroundFetchLimit), backgroundFetchLimit);
        if (cancelled || !nextGroup.length) continue;
        appendPrepared(nextGroup);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [driveMemories, localMemories.length]);

  const importLocalFiles = (files: FileList | null) => {
    const mediaFiles = Array.from(files || []).filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
    if (!mediaFiles.length) return;

    objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];

    const now = new Date();
    const nextMemories = mediaFiles.map((file, index) => {
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.push(url);
      const isVideo = file.type.startsWith('video/');
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

  if (!localMemories.length && driveMemories.length && (!cacheChecked || isPreparingDrive)) {
    const total = Math.min(40, driveMemories.filter(memory => memory.type === 'photo' || memory.type === 'video').length);
    return (
      <div className="fixed inset-0 z-[5] grid place-items-center bg-black px-4 text-white">
        {localPicker}
        <section className="neon-card max-w-md p-6 text-center">
          <h1 className="text-2xl font-black">{cacheChecked ? 'Preparing story' : 'Opening local story'}</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">
            {cacheChecked ? `Making the first ${total} Drive moments playable before the album starts.` : 'Checking saved photos and videos on this device first.'}
          </p>
          {cacheChecked && (
            <>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-cyan-300 transition-all duration-300"
                  style={{ width: `${total ? Math.min(100, (prepareCount / total) * 100) : 0}%` }}
                />
              </div>
              <p className="mt-3 text-xs font-bold text-white/45">{Math.min(prepareCount, total)} / {total}</p>
            </>
          )}
        </section>
      </div>
    );
  }

  if (!storyMemories.length) {
    return (
      <div className="fixed inset-0 z-[5] grid place-items-center bg-black px-4 text-white">
        {localPicker}
        <section className="neon-card max-w-md p-6 text-center">
          <h1 className="text-2xl font-black">No Drive story yet</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">Connect Google Drive in Memoriya, or choose local photos/videos from this device.</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button onClick={() => localInputRef.current?.click()} className="neon-button px-4 py-2 text-sm font-black">Use Local Media</button>
            <button onClick={onExit} className="neon-button px-4 py-2 text-sm font-black">Back to Memoriya</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[5] overflow-hidden bg-black">
      {localPicker}
      <MemoryLightbox
        memory={storyMemories[0]}
        memories={storyMemories}
        autoplay
        mode="story"
        template="auto"
        speed="slow"
        intensity="premium"
        onImportLocalMedia={() => localInputRef.current?.click()}
        onClose={onExit}
      />
    </div>
  );
};

export default StoryMode;
