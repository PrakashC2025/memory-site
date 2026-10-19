import React, { useEffect, useRef, useState } from 'react';
import MemoryLightbox from '../components/MemoryLightbox';
import type { Memory } from '../data/memories';
import { readDriveMemories } from '../services/driveLibrary';

interface StoryModeProps {
  onExit: () => void;
}

const StoryMode: React.FC<StoryModeProps> = ({ onExit }) => {
  const localInputRef = useRef<HTMLInputElement>(null);
  const [localMemories, setLocalMemories] = useState<Memory[]>([]);
  const [driveMemories] = useState<Memory[]>(() => readDriveMemories());
  const objectUrlsRef = useRef<string[]>([]);
  const storyMemories = localMemories.length ? localMemories : driveMemories;

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []);

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
