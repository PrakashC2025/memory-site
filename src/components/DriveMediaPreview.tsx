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
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [blobSrc, setBlobSrc] = useState('');
  const [imageIndex, setImageIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);

  // Only upgrade thumbnails to full quality when the image is close to the
  // viewport. Pages with many memories no longer download everything at once.
  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) {
      setVisible(true);
      return undefined;
    }
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '420px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setBlobSrc('');
    setImageIndex(0);
    setLoaded(false);
    setFailed(false);

    if (memory.type !== 'photo' || !visible) return undefined;

    let objectUrl = '';
    const controller = new AbortController();
    const loadFullPhoto = async () => {
      try {
        const cacheKey = getStoryMediaCacheKey(memory);
        const cachedBlob = await readCachedStoryMedia(cacheKey);
        if (cachedBlob) {
          objectUrl = URL.createObjectURL(cachedBlob);
          setBlobSrc(objectUrl);
          return;
        }

        if (!memory.authToken || !memory.driveFileId) return;

        const fileId = memory.driveFileId;
        const authToken = memory.authToken;
        const blob = await withMediaFetch(async () => {
          const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
            headers: { Authorization: `Bearer ${authToken}` },
            signal: controller.signal,
            cache: 'force-cache',
          });
          if (!response.ok) throw new Error(`Drive media failed ${response.status}`);
          return response.blob();
        });
        void writeCachedStoryMedia(cacheKey, blob, memory.mimeType || blob.type);
        objectUrl = URL.createObjectURL(blob);
        setBlobSrc(objectUrl);
      } catch {
        // Direct thumbnail candidates below still get a chance.
      }
    };

    void loadFullPhoto();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [memory.authToken, memory.driveFileId, memory.id, memory.type, visible]);

  const src = blobSrc || imageCandidates[imageIndex] || '';

  const tryNextImage = () => {
    if (blobSrc) {
      setBlobSrc('');
      return;
    }
    if (imageIndex + 1 < imageCandidates.length) {
      setImageIndex(index => index + 1);
      return;
    }
    setFailed(true);
  };

  return (
    <span ref={wrapperRef} className="drive-media-preview-wrap">
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
          style={loaded ? undefined : { opacity: 0.01 }}
        />
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
  const thumbnail = sharpenThumbnail(memory.thumbnail);
  const candidates = [
    thumbnail,
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