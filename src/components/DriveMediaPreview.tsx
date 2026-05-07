import React, { useEffect, useMemo, useState } from 'react';
import { Image, Play } from 'lucide-react';
import type { Memory } from '../data/memories';

interface Props {
  memory: Memory;
  alt?: string;
  className?: string;
  eager?: boolean;
}

const DriveMediaPreview: React.FC<Props> = ({ memory, alt, className = '', eager }) => {
  const imageCandidates = useMemo(() => buildImageCandidates(memory), [memory]);
  const [blobSrc, setBlobSrc] = useState('');
  const [imageIndex, setImageIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setBlobSrc('');
    setImageIndex(0);
    setLoaded(false);
    setFailed(false);

    if (memory.type !== 'photo' || !memory.authToken || !memory.driveFileId) return undefined;

    let objectUrl = '';
    const controller = new AbortController();
    const loadFullPhoto = async () => {
      try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(memory.driveFileId || '')}?alt=media`, {
          headers: { Authorization: `Bearer ${memory.authToken}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Drive media failed ${response.status}`);
        const blob = await response.blob();
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
  }, [memory.authToken, memory.driveFileId, memory.id, memory.type]);

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

  if (!failed && src) {
    return (
      <img
        src={src}
        alt={alt ?? memory.title}
        className={className}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={tryNextImage}
        style={loaded ? undefined : { opacity: 0.01 }}
      />
    );
  }

  return (
    <span className={`drive-preview-fallback ${className}`}>
      {memory.type === 'video' ? <Play size={24} /> : <Image size={24} />}
      <strong>{memory.title}</strong>
      <small>{memory.type === 'video' ? 'Video from Drive' : 'Photo from Drive'}</small>
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
