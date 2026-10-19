import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Play } from 'lucide-react';
import type { Memory } from '../data/memories';
import { getStoryMediaCacheKey, readCachedStoryMedia, writeCachedStoryMedia } from '../services/storyMediaCache';
import { withMediaFetch } from '../utils/mediaQueue';

interface Props {
  memory: Memory;
  alt?: string;
  className?: string;
  eager?: boolean;
}

const DriveMediaPreview: React.FC<Props> = ({ memory, alt, className = '', eager }) => {
  const imageCandidates = useMemo(() => buildImageCandidates(memory), [memory]);
  const objectUrlRef = useRef('');
  const [imageIndex, setImageIndex] = useState(0);
  const [blobSrc, setBlobSrc] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fallbackLoading, setFallbackLoading] = useState(false);

  useEffect(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = '';
    setBlobSrc('');
    setImageIndex(0);
    setLoaded(false);
    setFailed(false);
    setFallbackLoading(false);
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = '';
    };
  }, [memory.id, memory.thumbnail, memory.url]);

  useEffect(() => {
    if (!failed || fallbackLoading || blobSrc || memory.type !== 'photo' || !memory.authToken || !memory.driveFileId) return undefined;
    const controller = new AbortController();
    let cancelled = false;
    setFallbackLoading(true);
    const loadAuthenticatedPhoto = async () => {
      try {
        const cacheKey = getStoryMediaCacheKey(memory);
        const cached = await readCachedStoryMedia(cacheKey);
        const blob = cached || await withMediaFetch(async () => {
          const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(memory.driveFileId!)}?alt=media`, {
            headers: { Authorization: `Bearer ${memory.authToken}` },
            signal: controller.signal,
            cache: 'force-cache',
          });
          if (!response.ok) throw new Error(`Drive media failed ${response.status}`);
          return response.blob();
        });
        if (cancelled) return;
        if (!cached) void writeCachedStoryMedia(cacheKey, blob, memory.mimeType || blob.type);
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        setBlobSrc(objectUrl);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setFallbackLoading(false);
      }
    };
    void loadAuthenticatedPhoto();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [blobSrc, failed, memory.authToken, memory.driveFileId, memory.id, memory.mimeType, memory.type]);

  const src = blobSrc || imageCandidates[imageIndex] || '';

  const tryNextImage = () => {
    if (imageIndex + 1 < imageCandidates.length) {
      setImageIndex(index => index + 1);
      return;
    }
    setFailed(true);
  };

  const showNativeVideo = memory.type === 'video' && failed && Boolean(memory.url);

  return (
    <span className="drive-media-preview-wrap">
      {!failed && src ? (
        <img
          src={src}
          alt={alt ?? memory.title}
          className={`${className} drive-media-preview`}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={tryNextImage}
          style={loaded ? undefined : { opacity: 0.48 }}
        />
      ) : showNativeVideo ? (
        <video
          src={memory.url}
          className={`${className} drive-media-preview`}
          muted
          playsInline
          autoPlay
          loop
          preload="metadata"
          onLoadedData={() => {
            setLoaded(true);
            setFailed(false);
          }}
          onError={() => setFailed(true)}
          style={loaded ? undefined : { opacity: 0.48 }}
        />
      ) : fallbackLoading ? (
        <span className={`drive-preview-fallback ${className} drive-media-preview`}>
          <span className="drive-preview-spinner" aria-hidden="true" />
          <small>Loading original from Drive…</small>
        </span>
      ) : (
        <span className={`drive-preview-fallback ${className} drive-media-preview`}>
          {memory.type === 'video' ? <Play size={24} /> : <Image size={24} />}
          <strong>{memory.title}</strong>
          <small>{memory.type === 'video' ? 'Video from Drive' : 'Photo from Drive'}</small>
        </span>
      )}
    </span>
  );
};

const buildImageCandidates = (memory: Memory) => {
  const id = memory.driveFileId ? encodeURIComponent(memory.driveFileId) : '';
  const thumbnail = memory.thumbnail;
  const resizedThumbnail = sharpenThumbnail(memory.thumbnail);
  const candidates = [
    thumbnail,
    resizedThumbnail,
    id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : '',
    id ? `https://lh3.googleusercontent.com/d/${id}=w1600` : '',
    memory.type === 'photo' ? memory.url : '',
  ];
  return Array.from(new Set(candidates.filter(Boolean)));
};

const sharpenThumbnail = (url: string) => {
  if (!url) return '';
  return url
    .replace(/=s\d+(-[cp])?$/i, '=s1600')
    .replace(/sz=w\d+/i, 'sz=w1600');
};

export default DriveMediaPreview;
