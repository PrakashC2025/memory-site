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

const AUDIO_EXTENSION_PATTERN = /\.(mp3|m4a|aac|ogg|oga|wav|flac)$/i;

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

  const response = await fetch(`https://archive.org/advancedsearch.php?${params.toString()}`);
  if (!response.ok) throw new Error('Open-source music search failed.');

  const payload = await response.json() as {
    response?: { docs?: ArchiveDoc[] };
  };
  const docs = (payload.response?.docs || []).filter(doc => doc.identifier);

  // Resolve the first playable audio file for each item. Metadata calls run in
  // parallel and failures for individual items are ignored.
  const resolved = await Promise.all(docs.map(async doc => {
    try {
      const metaResponse = await fetch(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`);
      if (!metaResponse.ok) return null;
      const meta = await metaResponse.json() as {
        files?: Array<{ name: string }>;
      };
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