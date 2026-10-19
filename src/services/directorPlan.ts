import type { Memory } from '../data/memories';
import { groupMemoriesByEvent, type MemoryEventCluster } from './memoryOrganizer';

export type DirectorMood = 'romance' | 'celebration' | 'journey' | 'family' | 'nostalgia';

export interface DirectorPlan {
  title: string;
  subtitle: string;
  mood: DirectorMood;
  template: 'wedding' | 'birthday' | 'travel' | 'family' | 'nostalgia';
  transition: 'dream-dissolve' | 'glow-pulse' | 'ken-burns' | 'crossfade' | 'film-fade';
  clusters: MemoryEventCluster[];
  sequence: Memory[];
}

const moodFor = (cluster: MemoryEventCluster): DirectorMood => {
  const text = [cluster.title, cluster.emotion, ...cluster.memories.flatMap(memory => memory.tags || [])]
    .join(' ')
    .toLowerCase();
  if (/wedding|marriage|love|romance/.test(text)) return 'romance';
  if (/birthday|festival|diwali|party|graduation|celebration|farewell/.test(text)) return 'celebration';
  if (/travel|trip|goa|beach|mountain|road|trek|journey/.test(text)) return 'journey';
  if (/family|home|baby|reunion/.test(text)) return 'family';
  return cluster.emotion === 'nostalgia' ? 'nostalgia' : 'family';
};

const moodWeight: Record<DirectorMood, number> = {
  romance: 5,
  celebration: 4,
  journey: 3,
  family: 2,
  nostalgia: 1,
};

export const buildDirectorPlan = (memories: Memory[]): DirectorPlan => {
  const clusters = groupMemoriesByEvent(memories)
    .map(cluster => ({ ...cluster, memories: [...cluster.memories].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) }))
    .sort((a, b) => {
      const moodDelta = moodWeight[moodFor(b)] - moodWeight[moodFor(a)];
      if (moodDelta) return moodDelta;
      return new Date(a.cover.date).getTime() - new Date(b.cover.date).getTime();
    });
  const mood = clusters.length ? moodFor(clusters[0]) : 'nostalgia';
  const template = mood === 'romance' ? 'wedding' : mood === 'celebration' ? 'birthday' : mood === 'journey' ? 'travel' : mood === 'family' ? 'family' : 'nostalgia';
  const transition = mood === 'romance' ? 'dream-dissolve' : mood === 'celebration' ? 'glow-pulse' : mood === 'journey' ? 'ken-burns' : mood === 'family' ? 'crossfade' : 'film-fade';
  const sequence = clusters.flatMap(cluster => cluster.memories)
    .filter((memory, index, all) => all.findIndex(item => item.id === memory.id) === index)
    .slice(0, 60);

  return {
    title: sequence.length ? 'Your story, cut by feeling' : 'Your story is waiting',
    subtitle: sequence.length
      ? `${clusters.length} event${clusters.length === 1 ? '' : 's'} arranged into a cinematic memory reel.`
      : 'Add photos or connect Drive to create a cinematic reel.',
    mood,
    template,
    transition,
    clusters,
    sequence,
  };
};

export const autoEventLabel = (fileName: string, date: Date, batchSize: number) => {
  const normalized = fileName.toLowerCase();
  if (/wedding|marriage/.test(normalized)) return 'Wedding Memories';
  if (/birthday|bday/.test(normalized)) return 'Birthday Celebration';
  if (/travel|trip|goa|beach|mountain|trek/.test(normalized)) return 'Travel Story';
  if (/family|mom|dad|home|baby/.test(normalized)) return 'Family Moments';
  if (/party|festival|diwali|graduation|farewell/.test(normalized)) return 'Celebration';
  if (batchSize > 1) return `${date.toLocaleString('en', { month: 'short' })} ${date.getFullYear()} Moments`;
  return 'New Memories';
};
