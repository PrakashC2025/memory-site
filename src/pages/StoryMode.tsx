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
  const objectUrlsRef = useRef<string[]>([]);
  const memories = readDriveMemories();
  const storyMemories = localMemories.length ? localMemories : memories;

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []);

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
