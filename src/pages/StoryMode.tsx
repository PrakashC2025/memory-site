import React from 'react';
import MemoryLightbox from '../components/MemoryLightbox';
import { SAMPLE_MEMORIES } from '../data/memories';

interface StoryModeProps {
  onExit: () => void;
}

const StoryMode: React.FC<StoryModeProps> = ({ onExit }) => {
  return (
    <div className="fixed inset-0 z-[5] overflow-hidden bg-black">
      <MemoryLightbox
        memory={SAMPLE_MEMORIES[0]}
        memories={SAMPLE_MEMORIES}
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
