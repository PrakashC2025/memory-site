import React from 'react';
import MemoryLightbox from '../components/MemoryLightbox';
import { readDriveMemories } from '../services/driveLibrary';

interface StoryModeProps {
  onExit: () => void;
}

const StoryMode: React.FC<StoryModeProps> = ({ onExit }) => {
  const memories = readDriveMemories();

  if (!memories.length) {
    return (
      <div className="fixed inset-0 z-[5] grid place-items-center bg-black px-4 text-white">
        <section className="neon-card max-w-md p-6 text-center">
          <h1 className="text-2xl font-black">No Drive story yet</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">Connect Google Drive in Memoriya to play your own photos and videos here.</p>
          <button onClick={onExit} className="neon-button mt-5 px-4 py-2 text-sm font-black">Back to Memoriya</button>
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[5] overflow-hidden bg-black">
      <MemoryLightbox
        memory={memories[0]}
        memories={memories}
        autoplay
        mode="story"
        template="auto"
        transitionStyle="dream-dissolve"
        speed="slow"
        intensity="premium"
        onClose={onExit}
      />
    </div>
  );
};

export default StoryMode;
