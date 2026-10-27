export type MediaFrameKind = 'portrait' | 'square' | 'landscape';

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export const normalizeMediaAspect = (width?: number, height?: number, rotation = 0, fallback = 1) => {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight) || safeWidth <= 0 || safeHeight <= 0) return fallback;
  const rawAspect = safeWidth / safeHeight;
  const numericRotation = Number(rotation);
  const quarterTurn = Number.isFinite(numericRotation) && Math.round(numericRotation / 90) % 2 !== 0;
  return clamp(quarterTurn ? 1 / rawAspect : rawAspect, 0.3, 3.2);
};

export const getMediaFrameKind = (aspect: number): MediaFrameKind => {
  if (aspect < 0.9) return 'portrait';
  if (aspect > 1.15) return 'landscape';
  return 'square';
};

export const getMediaFrameSize = (aspect: number) => {
  const safeAspect = clamp(Number.isFinite(aspect) && aspect > 0 ? aspect : 1.5, 0.3, 3.2);
  const maxWidth = 560;
  const maxHeight = 440;
  let width = maxWidth;
  let height = width / safeAspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * safeAspect;
  }
  return { width: Math.round(width), height: Math.round(height) };
};
