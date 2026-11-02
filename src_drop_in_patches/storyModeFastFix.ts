/**
 * Drop-in fast preloader & cache helper for StoryMode.tsx / storyMediaCache.ts
 * Preloads active + upcoming N story images in parallel using async image decoding
 * and high fetch priority so Story Mode transitions happen instantaneously.
 */

const preloadedUrls = new Map<string, HTMLImageElement>();

export function normalizeDriveFolderId(folderId?: string | null): string {
  if (!folderId || folderId === 'drive-root' || folderId.trim() === '') {
    return 'root';
  }
  return folderId;
}

export function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

export function mergeFreshAndCachedMedia<T extends { id: string }>(
  freshPublished: T[],
  cachedKnown: T[]
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const item of [...freshPublished, ...cachedKnown]) {
    if (item && item.id && !seen.has(item.id)) {
      seen.add(item.id);
      merged.append ? merged.push(item) : merged.push(item);
    }
  }
  return merged;
}

export function preloadStoryImages(
  urls: string[],
  currentIndex: number,
  lookaheadCount: number = 5
): void {
  if (typeof window === 'undefined' || !Array.isArray(urls) || urls.length === 0) return;

  const indicesToLoad: number[] = [];
  for (let offset = 0; offset <= lookaheadCount; offset++) {
    const idx = (currentIndex + offset) % urls.length;
    if (!indicesToLoad.includes(idx)) {
      indicesToLoad.push(idx);
    }
  }

  indicesToLoad.forEach((idx, priorityOrder) => {
    const url = urls[idx];
    if (!url || preloadedUrls.has(url)) return;

    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    if ('fetchPriority' in img) {
      (img as any).fetchPriority = priorityOrder <= 1 ? 'high' : 'auto';
    }
    img.src = url;
    preloadedUrls.set(url, img);
  });
}
