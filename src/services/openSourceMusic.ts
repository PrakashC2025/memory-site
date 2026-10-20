// Open-source music search backed by the Internet Archive's open audio collections.
// Search + metadata are CORS-enabled, and items serve direct, streamable audio files,
// so results can be played inside the app without any API key.

export interface OpenSourceMusicTrack {
  id: string;
  title: string;
  artist: string;
  previewUrl: string;    // direct, playable audio URL
  externalUrl: string;   // item details page
}

interface ArchiveDoc {
  identifier: string;
  title?: string;
  creator?: string | string[];
}

// Prefer formats that play reliably in Chrome, Safari, Android TV, and mobile
// browsers. Archive items often include a lossless FLAC first, even when an
// MP3 or OGG version is available beside it.
const AUDIO_EXTENSION_PATTERN = /\.(mp3|m4a|aac|ogg|oga|wav)$/i;
const SEARCH_TIMEOUT_MS = 15000;

const fetchJsonWithTimeout = async <T,>(url: string): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('Music search request failed.');
    return await response.json() as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Music search took too long. Please try again.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const parseCreator = (creator?: string | string[]) =>
  Array.isArray(creator) ? creator.filter(Boolean).join(', ') : creator || 'Internet Archive';

export const searchOpenSourceMusic = async (query: string, limit = 8): Promise<OpenSourceMusicTrack[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    q: `(${trimmed}) AND mediatype:audio AND -collection:opensource_audio`,
    'fl[]': 'identifier,title,creator',
    rows: String(limit),
    page: '1',
    output: 'json',
    'sort[]': 'downloads desc',
  });

  const payload = await fetchJsonWithTimeout<{
    response?: { docs?: ArchiveDoc[] };
  }>(`https://archive.org/advancedsearch.php?${params.toString()}`);
  const docs = (payload.response?.docs || []).filter(doc => doc.identifier);

  // Resolve the first playable audio file for each item. Metadata calls run in
  // parallel and failures for individual items are ignored.
  const resolved = await Promise.all(docs.map(async doc => {
    try {
      const meta = await fetchJsonWithTimeout<{
        files?: Array<{ name: string }>;
      }>(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`);
      const audioFile = (meta.files || []).find(file =>
        AUDIO_EXTENSION_PATTERN.test(file.name) && !/files\.xml$/i.test(file.name)
      );
      if (!audioFile) return null;
      return {
        id: `archive-${doc.identifier}`,
        title: doc.title || doc.identifier,
        artist: parseCreator(doc.creator),
        previewUrl: `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(audioFile.name)}`,
        externalUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
      } satisfies OpenSourceMusicTrack;
    } catch {
      return null;
    }
  }));

  return resolved.filter((track): track is OpenSourceMusicTrack => Boolean(track));
};
