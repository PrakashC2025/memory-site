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
  const candidates = useMemo(() => buildImageCandidates(memory), [memory]);
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl = '';
    const controller = new AbortController();
    setSrc('');
    setFailed(false);

    const load = async () => {
      for (const candidate of candidates) {
        try {
          if (!memory.authToken || candidate.startsWith('blob:') || !candidate.startsWith('http')) {
            setSrc(candidate);
            return;
          }

          const response = await fetch(candidate, {
            headers: { Authorization: `Bearer ${memory.authToken}` },
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Preview failed ${response.status}`);
          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
          return;
        } catch {
          // Try next candidate.
        }
      }
      setFailed(true);
    };

    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [candidates, memory.authToken]);

  if (failed || !src) {
    return (
      <span className={`drive-preview-fallback ${className}`}>
        {memory.type === 'video' ? <Play size={24} /> : <Image size={24} />}
        <strong>{memory.title}</strong>
        <small>{memory.type === 'video' ? 'Video from Drive' : 'Photo from Drive'}</small>
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt ?? memory.title}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
};

const buildImageCandidates = (memory: Memory) => {
  const id = memory.driveFileId ? encodeURIComponent(memory.driveFileId) : '';
  const thumb = memory.thumbnail;
  const size = 1600;

  return Array.from(new Set([
    thumb,
    id ? `https://drive.google.com/thumbnail?id=${id}&sz=w${size}` : '',
    id ? `https://lh3.googleusercontent.com/d/${id}=w${size}` : '',
    memory.type === 'photo' ? memory.url : '',
  ].filter(Boolean)));
};

export default DriveMediaPreview;
