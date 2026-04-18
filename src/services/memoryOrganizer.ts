import type { Memory } from '../data/memories';

export interface MemoryEventCluster {
  id: string;
  title: string;
  year: number;
  monthRange: string;
  emotion: string;
  memories: Memory[];
  cover: Memory;
  density: number;
}

export interface RecapSection {
  id: string;
  title: string;
  subtitle: string;
  memories: Memory[];
}

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const groupMemoriesByEvent = (memories: Memory[]): MemoryEventCluster[] => {
  const eventMap = new Map<string, Memory[]>();

  memories.forEach(memory => {
    const eventName = memory.event?.trim() || `${memory.year} ${MONTHS[memory.month]} Moments`;
    const key = `${memory.year}-${eventName.toLowerCase()}`;
    eventMap.set(key, [...(eventMap.get(key) || []), memory]);
  });

  return Array.from(eventMap.entries())
    .map(([key, items]) => {
      const sorted = [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const first = sorted[0];
      const months = new Set(sorted.map(memory => memory.month));
      const emotionCounts = sorted.reduce<Record<string, number>>((acc, memory) => {
        const emotion = memory.emotion || 'nostalgia';
        acc[emotion] = (acc[emotion] || 0) + 1;
        return acc;
      }, {});
      const dominantEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'nostalgia';

      return {
        id: key,
        title: first.event || first.title,
        year: first.year,
        monthRange: formatMonthRange(Array.from(months)),
        emotion: dominantEmotion,
        memories: sorted,
        cover: sorted.find(memory => memory.isFavorite) || first,
        density: sorted.length,
      };
    })
    .sort((a, b) => new Date(b.cover.date).getTime() - new Date(a.cover.date).getTime());
};

export const buildRecapSections = (memories: Memory[]): RecapSection[] => {
  const byTag = (needle: string) =>
    memories.filter(memory =>
      [memory.event, memory.emotion, ...(memory.tags || [])]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle))
    );

  return [
    {
      id: 'first-days',
      title: 'Your First Days',
      subtitle: 'The small beginnings that quietly changed everything.',
      memories: memories.filter(memory => memory.year === 2021).slice(0, 5),
    },
    {
      id: 'best-friends',
      title: 'Best Friends',
      subtitle: 'People who turned ordinary days into keepsakes.',
      memories: byTag('friend').slice(0, 6),
    },
    {
      id: 'trips',
      title: 'Trips',
      subtitle: 'Roads, beaches, mountains, and the feeling of leaving everything behind.',
      memories: [...byTag('trip'), ...byTag('travel'), ...byTag('goa')].slice(0, 6),
    },
    {
      id: 'final-year',
      title: 'Final Year',
      subtitle: 'Bright endings, soft farewells, and one last walk through familiar places.',
      memories: byTag('final').slice(0, 6),
    },
  ].filter(section => section.memories.length > 0);
};

export const getMemoryHeatmap = (memories: Memory[]) => {
  const counts = new Map<number, number>();
  memories.forEach(memory => counts.set(memory.year, (counts.get(memory.year) || 0) + 1));
  const max = Math.max(1, ...counts.values());
  return Array.from(counts.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, count]) => ({ year, count, intensity: count / max }));
};

const formatMonthRange = (months: number[]) => {
  const sorted = months.sort((a, b) => a - b);
  if (sorted.length === 0) return 'Unknown';
  if (sorted.length === 1) return MONTHS[sorted[0]];
  return `${MONTHS[sorted[0]]} - ${MONTHS[sorted[sorted.length - 1]]}`;
};
