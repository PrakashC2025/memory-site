import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Play } from 'lucide-react';
import type { Memory } from '../data/memories';
import { readCachedDriveMedia } from '../services/driveCache';
import { googleDriveService } from '../services/googleDriveService';
import { saveDriveAccessToken } from '../services/driveLibrary';
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
  const [videoActive, setVideoActive] = useState(Boolean(eager));
  const authAttemptedRef = useRef(false);

  useEffect(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = '';
    setBlobSrc('');
    setImageIndex(0);
    setLoaded(false);
    setFailed(false);
    setFallbackLoading(false);
    setVideoActive(Boolean(eager));
    authAttemptedRef.current = false;
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = '';
    };
  }, [memory.id, memory.thumbnail, memory.url]);

  useEffect(() => {
    const canUseDriveMedia = Boolean(memory.authToken && memory.driveFileId);
    // Video cards already have a lightweight Drive poster and should not fetch
    // the complete original just because they entered the gallery. Only fetch
    // a video blob after its preview URL fails; images can still use the
    // authenticated fallback when needed.
    const drivePreviewNeedsAuth = Boolean(
      memory.driveFileId
      && (memory.type === 'video' ? videoActive : !imageCandidates.length),
    );
    if (!canUseDriveMedia || fallbackLoading || blobSrc || authAttemptedRef.current || (memory.type === 'video' && !failed && !drivePreviewNeedsAuth) || (!eager && !failed && !drivePreviewNeedsAuth)) return undefined;
    const controller = new AbortController();
    let cancelled = false;
    authAttemptedRef.current = true;
    setFallbackLoading(true);
    const loadAuthenticatedPhoto = async () => {
      try {
        const cacheKey = getStoryMediaCacheKey(memory);
        const driveCached = await readCachedDriveMedia(memory.driveFileId!);
        const cached = driveCached?.blob || await readCachedStoryMedia(cacheKey);
        const result = cached
          ? { blob: cached, accessToken: memory.authToken! }
          : await withMediaFetch(() => googleDriveService.downloadMediaFileWithReconnect(memory.authToken!, memory.driveFileId!, controller.signal), controller.signal);
        if (result.accessToken !== memory.authToken) saveDriveAccessToken(result.accessToken);
        const blob = result.blob;
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
  }, [blobSrc, eager, failed, fallbackLoading, imageCandidates.length, memory.authToken, memory.driveFileId, memory.id, memory.mimeType, memory.type, videoActive]);

  const src = memory.type === 'video'
    ? blobSrc || ''
    : blobSrc || imageCandidates[imageIndex] || '';

  const tryNextImage = () => {
    if (imageIndex + 1 < imageCandidates.length) {
      setImageIndex(index => index + 1);
      return;
    }
    setFailed(true);
  };

  const handleVideoError = () => {
    setLoaded(false);
    setFailed(true);
  };

  return (
    <span className="drive-media-preview-wrap">
      {memory.type === 'video' && !failed && src && (videoActive || !memory.thumbnail) ? (
        <video
          src={src}
          className={`${className} drive-media-preview`}
          muted
          playsInline
          autoPlay={videoActive}
          loop
          preload={videoActive ? 'metadata' : 'none'}
          poster={memory.driveFileId ? undefined : memory.thumbnail || undefined}
          onLoadedData={() => setLoaded(true)}
          onError={handleVideoError}
          style={loaded ? undefined : { opacity: 0.48 }}
        />
      ) : memory.type !== 'video' && !failed && src ? (
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
      ) : memory.type === 'video' && !videoActive ? (
        <span
          className="drive-preview-video-poster"
          role="button"
          tabIndex={0}
          onClick={() => setVideoActive(true)}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setVideoActive(true); }}
          aria-label={`Play preview for ${memory.title}`}
        >
          {memory.thumbnail ? (
            <img
              src={memory.thumbnail}
              alt={alt ?? memory.title}
              className={`${className} drive-media-preview`}
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
              onError={() => setFailed(true)}
            />
          ) : (
            <span className={`drive-preview-fallback ${className} drive-media-preview`}>
              <Play size={24} />
              <strong>{memory.title}</strong>
              <small>Video preview · click to load</small>
            </span>
          )}
          <span aria-hidden="true"><Play size={24} /></span>
        </span>
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
  if (memory.driveFileId) return memory.thumbnail ? [memory.thumbnail] : [];
  const thumbnail = memory.thumbnail;
  const resizedThumbnail = sharpenThumbnail(memory.thumbnail);
  const candidates = [
    thumbnail,
    resizedThumbnail,
    memory.type === 'photo' ? memory.url : '',
  ];
  return Array.from(new Set(candidates.filter(Boolean)));
};

const sharpenThumbnail = (url: string) => {
  if (!url) return '';
  return url
    .replace(/=s\d+(-[cp])?$/i, '=s960')
    .replace(/sz=w\d+/i, 'sz=w960');
};

export default DriveMediaPreview;
