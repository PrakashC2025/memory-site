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
  onDimensions?: (dimensions: { width: number; height: number }) => void;
}

const DriveMediaPreview: React.FC<Props> = ({ memory, alt, className = '', eager, onDimensions }) => {
  const imageCandidates = useMemo(() => buildImageCandidates(memory), [memory]);
  const objectUrlRef = useRef('');
  const [imageIndex, setImageIndex] = useState(0);
  const [blobSrc, setBlobSrc] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [videoActive, setVideoActive] = useState(Boolean(eager));
  const authAttemptedRef = useRef(false);
  const cacheHydrationAttemptedRef = useRef(false);
  const cacheHydrationTimerRef = useRef<number | undefined>(undefined);

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
    cacheHydrationAttemptedRef.current = false;
    if (cacheHydrationTimerRef.current) window.clearTimeout(cacheHydrationTimerRef.current);
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = '';
    };
  }, [memory.id, memory.thumbnail, memory.url]);

  useEffect(() => {
    if (!memory.driveFileId || blobSrc || cacheHydrationAttemptedRef.current) return undefined;
    let cancelled = false;
    let attempt = 0;
    cacheHydrationAttemptedRef.current = true;
    const hydrateCachedMedia = async () => {
      const driveCached = await readCachedDriveMedia(memory.driveFileId!);
      const cached = driveCached?.blob || await readCachedStoryMedia(getStoryMediaCacheKey(memory));
      if (cancelled) return;
      if (!cached) {
        if (attempt < 3) {
          attempt += 1;
          cacheHydrationTimerRef.current = window.setTimeout(() => void hydrateCachedMedia(), attempt * 1500);
        }
        return;
      }
      const objectUrl = URL.createObjectURL(cached);
      objectUrlRef.current = objectUrl;
      setBlobSrc(objectUrl);
      setFailed(false);
    };
    void hydrateCachedMedia();
    return () => {
      cancelled = true;
      if (cacheHydrationTimerRef.current) window.clearTimeout(cacheHydrationTimerRef.current);
    };
  }, [blobSrc, memory.driveFileId, memory.id, memory.thumbnail, memory.url]);

  useEffect(() => {
    const canUseDriveMedia = Boolean(memory.authToken && memory.driveFileId);
    // Show Drive's thumbnail immediately. The original is only needed when a
    // thumbnail is missing/broken or when a video is explicitly opened. This
    // keeps a slow original download from replacing a perfectly good preview.
    const drivePreviewNeedsAuth = Boolean(
      memory.driveFileId
      && (!imageCandidates.length || failed || (memory.type === 'video' && videoActive)),
    );
    if (!canUseDriveMedia || fallbackLoading || blobSrc || authAttemptedRef.current || !drivePreviewNeedsAuth) return undefined;
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
        if (!cached) await writeCachedStoryMedia(cacheKey, blob, memory.mimeType || blob.type);
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
    ? blobSrc || (!memory.driveFileId ? memory.url : '')
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

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    setLoaded(true);
    const image = event.currentTarget;
    if (image.naturalWidth && image.naturalHeight) onDimensions?.({ width: image.naturalWidth, height: image.naturalHeight });
  };

  const handleVideoLoaded = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    setLoaded(true);
    const video = event.currentTarget;
    if (video.videoWidth && video.videoHeight) onDimensions?.({ width: video.videoWidth, height: video.videoHeight });
  };

  return (
    <span className="drive-media-preview-wrap">
      {memory.type === 'video' && !failed && src && (videoActive || !memory.thumbnail) ? (
        <>
          {!loaded && memory.thumbnail && (
            <img
              src={memory.thumbnail}
              alt={alt ?? memory.title}
              className="drive-preview-video-underlay"
              aria-hidden="true"
              onError={event => { event.currentTarget.style.display = 'none'; }}
            />
          )}
          <video
            src={src}
            className={`${className} drive-media-preview`}
            muted
            playsInline
            autoPlay={videoActive}
            loop
            preload="metadata"
            poster={memory.thumbnail || undefined}
            onLoadedData={handleVideoLoaded}
            onError={handleVideoError}
            style={loaded ? undefined : { opacity: 0 }}
          />
        </>
      ) : memory.type !== 'video' && !failed && src ? (
        <img
          src={src}
          alt={alt ?? memory.title}
          className={`${className} drive-media-preview`}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={handleImageLoad}
          onError={tryNextImage}
          style={loaded ? undefined : { opacity: 0 }}
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
              onLoad={handleImageLoad}
              style={loaded ? undefined : { opacity: 0 }}
              onError={() => {
                setFailed(true);
                setVideoActive(true);
              }}
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
      ) : fallbackLoading && memory.type === 'video' && memory.thumbnail ? (
        <span className={`drive-preview-fallback ${className} drive-media-preview`}>
          <Play size={24} />
          <strong>{memory.title}</strong>
          <small>Video preview will appear when ready</small>
        </span>
      ) : fallbackLoading ? (
        <span className={`drive-preview-fallback ${className} drive-media-preview`}>
          <Image size={24} />
          <strong>{memory.title}</strong>
          <small>Preview will appear when ready</small>
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
  // A Drive thumbnail is the fast, exact visual preview for the gallery. Do
  // not make the first paint wait for the much larger authenticated original.
  const thumbnail = memory.thumbnail;
  const resizedThumbnail = sharpenThumbnail(memory.thumbnail);
  if (memory.driveFileId) return Array.from(new Set([thumbnail, resizedThumbnail].filter(Boolean)));
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
