import { useCallback, useEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { useGesture } from '@use-gesture/react';
import './DomeGallery.css';

type DomeGalleryImage = string | { src: string; alt?: string };

interface DomeGalleryProps {
  images?: DomeGalleryImage[];
  fit?: number;
  fitBasis?: 'auto' | 'min' | 'max' | 'width' | 'height';
  minRadius?: number;
  maxRadius?: number;
  padFactor?: number;
  overlayBlurColor?: string;
  maxVerticalRotationDeg?: number;
  dragSensitivity?: number;
  enlargeTransitionMs?: number;
  segments?: number;
  dragDampening?: number;
  openedImageWidth?: string;
  openedImageHeight?: string;
  imageBorderRadius?: string;
  openedImageBorderRadius?: string;
  grayscale?: boolean;
}

type DomeItem = {
  x: number;
  y: number;
  sizeX: number;
  sizeY: number;
  src: string;
  alt: string;
};

const DEFAULT_IMAGES: DomeGalleryImage[] = [
  {
    src: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200&q=90',
    alt: 'Campus memory',
  },
  {
    src: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=90',
    alt: 'Beach memory',
  },
  {
    src: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=90',
    alt: 'Celebration memory',
  },
  {
    src: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=90',
    alt: 'Adventure memory',
  },
  {
    src: 'https://images.unsplash.com/photo-1627556704283-84937f919b3f?w=1200&q=90',
    alt: 'Graduation memory',
  },
];

const DEFAULTS = {
  maxVerticalRotationDeg: 5,
  dragSensitivity: 20,
  enlargeTransitionMs: 300,
  segments: 35,
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const normalizeAngle = (degrees: number) => ((degrees % 360) + 360) % 360;
const wrapAngleSigned = (degrees: number) => {
  const angle = (((degrees + 180) % 360) + 360) % 360;
  return angle - 180;
};
const getDataNumber = (el: HTMLElement, name: string, fallback: number) => {
  const attr = el.dataset[name] ?? el.getAttribute(`data-${name}`);
  const number = attr == null ? NaN : parseFloat(attr);
  return Number.isFinite(number) ? number : fallback;
};

function buildItems(pool: DomeGalleryImage[], segments: number): DomeItem[] {
  const segmentCount = Math.max(8, Math.round(segments));
  const xCols = Array.from({ length: segmentCount }, (_, i) => -37 + i * 2);
  const evenYs = [-4, -2, 0, 2, 4];
  const oddYs = [-3, -1, 1, 3, 5];

  const coords = xCols.flatMap((x, col) => {
    const ys = col % 2 === 0 ? evenYs : oddYs;
    return ys.map(y => ({ x, y, sizeX: 2, sizeY: 2 }));
  });

  const normalizedImages = pool
    .map(image => (typeof image === 'string' ? { src: image, alt: '' } : { src: image.src || '', alt: image.alt || '' }))
    .filter(image => image.src);

  if (normalizedImages.length === 0) {
    return coords.map(coord => ({ ...coord, src: '', alt: '' }));
  }

  if (normalizedImages.length > coords.length) {
    console.warn(
      `[DomeGallery] Provided image count (${normalizedImages.length}) exceeds available tiles (${coords.length}). Some images will not be shown.`,
    );
  }

  const usedImages = Array.from({ length: coords.length }, (_, i) => normalizedImages[i % normalizedImages.length]);

  for (let i = 1; i < usedImages.length; i += 1) {
    if (usedImages[i].src === usedImages[i - 1].src) {
      for (let j = i + 1; j < usedImages.length; j += 1) {
        if (usedImages[j].src !== usedImages[i].src) {
          [usedImages[i], usedImages[j]] = [usedImages[j], usedImages[i]];
          break;
        }
      }
    }
  }

  return coords.map((coord, i) => ({
    ...coord,
    src: usedImages[i].src,
    alt: usedImages[i].alt,
  }));
}

function computeItemBaseRotation(offsetX: number, offsetY: number, sizeX: number, sizeY: number, segments: number) {
  const unit = 360 / segments / 2;
  const rotateY = unit * (offsetX + (sizeX - 1) / 2);
  const rotateX = unit * (offsetY - (sizeY - 1) / 2);
  return { rotateX, rotateY };
}

export default function DomeGallery({
  images = DEFAULT_IMAGES,
  fit = 0.5,
  fitBasis = 'auto',
  minRadius = 600,
  maxRadius = Infinity,
  padFactor = 0.25,
  overlayBlurColor = '#120F17',
  maxVerticalRotationDeg = DEFAULTS.maxVerticalRotationDeg,
  dragSensitivity = DEFAULTS.dragSensitivity,
  enlargeTransitionMs = DEFAULTS.enlargeTransitionMs,
  segments = DEFAULTS.segments,
  dragDampening = 2,
  openedImageWidth = '250px',
  openedImageHeight = '350px',
  imageBorderRadius = '30px',
  openedImageBorderRadius = '30px',
  grayscale = true,
}: DomeGalleryProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const sphereRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const focusedElRef = useRef<HTMLDivElement | null>(null);
  const originalTilePositionRef = useRef<DOMRect | null>(null);

  const rotationRef = useRef({ x: 0, y: 0 });
  const startRotRef = useRef({ x: 0, y: 0 });
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const inertiaRAF = useRef<number | null>(null);
  const openingRef = useRef(false);
  const openStartedAtRef = useRef(0);
  const lastDragEndAt = useRef(0);
  const scrollLockedRef = useRef(false);
  const segmentCount = Math.max(8, Math.round(segments));

  const lockScroll = useCallback(() => {
    if (scrollLockedRef.current) return;
    scrollLockedRef.current = true;
    document.body.classList.add('dg-scroll-lock');
  }, []);

  const unlockScroll = useCallback(() => {
    if (!scrollLockedRef.current) return;
    if (rootRef.current?.getAttribute('data-enlarging') === 'true') return;
    scrollLockedRef.current = false;
    document.body.classList.remove('dg-scroll-lock');
  }, []);

  const items = useMemo(() => buildItems(images, segmentCount), [images, segmentCount]);

  const applyTransform = useCallback((xDeg: number, yDeg: number) => {
    const el = sphereRef.current;
    if (el) {
      el.style.transform = `translateZ(calc(var(--radius) * -1)) rotateX(${xDeg}deg) rotateY(${yDeg}deg)`;
    }
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const resizeObserver = new ResizeObserver(entries => {
      const cr = entries[0].contentRect;
      const width = Math.max(1, cr.width);
      const height = Math.max(1, cr.height);
      const minDim = Math.min(width, height);
      const maxDim = Math.max(width, height);
      const aspect = width / height;
      let basis: number;

      switch (fitBasis) {
        case 'min':
          basis = minDim;
          break;
        case 'max':
          basis = maxDim;
          break;
        case 'width':
          basis = width;
          break;
        case 'height':
          basis = height;
          break;
        default:
          basis = aspect >= 1.3 ? width : minDim;
      }

      const heightGuard = height * 1.35;
      const radius = Math.round(clamp(Math.min(basis * fit, heightGuard), minRadius, maxRadius));
      const viewerPad = Math.max(8, Math.round(minDim * padFactor));

      root.style.setProperty('--radius', `${radius}px`);
      root.style.setProperty('--viewer-pad', `${viewerPad}px`);
      root.style.setProperty('--overlay-blur-color', overlayBlurColor);
      root.style.setProperty('--tile-radius', imageBorderRadius);
      root.style.setProperty('--enlarge-radius', openedImageBorderRadius);
      root.style.setProperty('--image-filter', grayscale ? 'grayscale(1)' : 'none');
      applyTransform(rotationRef.current.x, rotationRef.current.y);

      const enlargedOverlay = viewerRef.current?.querySelector<HTMLDivElement>('.dg-enlarge');
      if (enlargedOverlay && frameRef.current && mainRef.current) {
        const frameR = frameRef.current.getBoundingClientRect();
        const mainR = mainRef.current.getBoundingClientRect();
        const tempDiv = document.createElement('div');
        tempDiv.style.cssText = `position: absolute; width: ${openedImageWidth}; height: ${openedImageHeight}; visibility: hidden;`;
        document.body.appendChild(tempDiv);
        const tempRect = tempDiv.getBoundingClientRect();
        document.body.removeChild(tempDiv);
        enlargedOverlay.style.left = `${frameR.left - mainR.left + (frameR.width - tempRect.width) / 2}px`;
        enlargedOverlay.style.top = `${frameR.top - mainR.top + (frameR.height - tempRect.height) / 2}px`;
      }
    });

    resizeObserver.observe(root);
    return () => resizeObserver.disconnect();
  }, [
    applyTransform,
    fit,
    fitBasis,
    grayscale,
    imageBorderRadius,
    maxRadius,
    minRadius,
    openedImageBorderRadius,
    openedImageHeight,
    openedImageWidth,
    overlayBlurColor,
    padFactor,
  ]);

  const stopInertia = useCallback(() => {
    if (inertiaRAF.current) {
      cancelAnimationFrame(inertiaRAF.current);
      inertiaRAF.current = null;
    }
  }, []);

  const startInertia = useCallback(
    (vx: number, vy: number) => {
      const maxVelocity = 1.4;
      let vX = clamp(vx, -maxVelocity, maxVelocity) * 80;
      let vY = clamp(vy, -maxVelocity, maxVelocity) * 80;
      let frames = 0;
      const dampening = clamp(dragDampening ?? 0.6, 0, 1);
      const frictionMul = 0.94 + 0.055 * dampening;
      const stopThreshold = 0.015 - 0.01 * dampening;
      const maxFrames = Math.round(90 + 270 * dampening);

      const step = () => {
        vX *= frictionMul;
        vY *= frictionMul;
        if ((Math.abs(vX) < stopThreshold && Math.abs(vY) < stopThreshold) || frames > maxFrames) {
          inertiaRAF.current = null;
          return;
        }

        frames += 1;
        const nextX = clamp(rotationRef.current.x - vY / 200, -maxVerticalRotationDeg, maxVerticalRotationDeg);
        const nextY = wrapAngleSigned(rotationRef.current.y + vX / 200);
        rotationRef.current = { x: nextX, y: nextY };
        applyTransform(nextX, nextY);
        inertiaRAF.current = requestAnimationFrame(step);
      };

      stopInertia();
      inertiaRAF.current = requestAnimationFrame(step);
    },
    [applyTransform, dragDampening, maxVerticalRotationDeg, stopInertia],
  );

  useGesture(
    {
      onDragStart: ({ event }) => {
        if (focusedElRef.current) return;
        stopInertia();
        const pointerEvent = event as PointerEvent;
        draggingRef.current = true;
        movedRef.current = false;
        startRotRef.current = { ...rotationRef.current };
        startPosRef.current = { x: pointerEvent.clientX, y: pointerEvent.clientY };
      },
      onDrag: ({ event, last, velocity = [0, 0], direction = [0, 0], movement }) => {
        if (focusedElRef.current || !draggingRef.current || !startPosRef.current) return;
        const pointerEvent = event as PointerEvent;
        const dxTotal = pointerEvent.clientX - startPosRef.current.x;
        const dyTotal = pointerEvent.clientY - startPosRef.current.y;

        if (!movedRef.current && dxTotal * dxTotal + dyTotal * dyTotal > 16) movedRef.current = true;

        const nextX = clamp(startRotRef.current.x - dyTotal / dragSensitivity, -maxVerticalRotationDeg, maxVerticalRotationDeg);
        const nextY = wrapAngleSigned(startRotRef.current.y + dxTotal / dragSensitivity);
        if (rotationRef.current.x !== nextX || rotationRef.current.y !== nextY) {
          rotationRef.current = { x: nextX, y: nextY };
          applyTransform(nextX, nextY);
        }

        if (last) {
          draggingRef.current = false;
          const [vMagX, vMagY] = velocity;
          const [dirX, dirY] = direction;
          let vx = vMagX * dirX;
          let vy = vMagY * dirY;

          if (Math.abs(vx) < 0.001 && Math.abs(vy) < 0.001 && Array.isArray(movement)) {
            const [mx, my] = movement;
            vx = clamp((mx / dragSensitivity) * 0.02, -1.2, 1.2);
            vy = clamp((my / dragSensitivity) * 0.02, -1.2, 1.2);
          }

          if (Math.abs(vx) > 0.005 || Math.abs(vy) > 0.005) startInertia(vx, vy);
          if (movedRef.current) lastDragEndAt.current = performance.now();
          movedRef.current = false;
        }
      },
    },
    { target: mainRef, eventOptions: { passive: true } },
  );

  const closeFocusedItem = useCallback(() => {
    if (performance.now() - openStartedAtRef.current < 250) return;
    const el = focusedElRef.current;
    const root = rootRef.current;
    if (!el || !root) return;

    const parent = el.parentElement as HTMLElement;
    const overlay = viewerRef.current?.querySelector<HTMLDivElement>('.dg-enlarge');
    const refDiv = parent.querySelector<HTMLElement>('.dg-item__image--reference');
    const originalPos = originalTilePositionRef.current;
    if (!overlay || !originalPos) {
      overlay?.remove();
      refDiv?.remove();
      parent.style.setProperty('--rot-y-delta', '0deg');
      parent.style.setProperty('--rot-x-delta', '0deg');
      el.style.visibility = '';
      focusedElRef.current = null;
      root.removeAttribute('data-enlarging');
      openingRef.current = false;
      unlockScroll();
      return;
    }

    const currentRect = overlay.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const animatingOverlay = document.createElement('div');
    animatingOverlay.className = 'dg-enlarge-closing';
    animatingOverlay.style.cssText = `position:absolute;left:${currentRect.left - rootRect.left}px;top:${currentRect.top - rootRect.top}px;width:${currentRect.width}px;height:${currentRect.height}px;z-index:9999;border-radius:var(--enlarge-radius, 32px);overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.35);transition:all ${enlargeTransitionMs}ms ease-out;pointer-events:none;margin:0;transform:none;`;

    const originalImg = overlay.querySelector('img');
    if (originalImg) {
      const img = originalImg.cloneNode() as HTMLImageElement;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      animatingOverlay.appendChild(img);
    }

    overlay.remove();
    root.appendChild(animatingOverlay);
    void animatingOverlay.getBoundingClientRect();
    requestAnimationFrame(() => {
      animatingOverlay.style.left = `${originalPos.left - rootRect.left}px`;
      animatingOverlay.style.top = `${originalPos.top - rootRect.top}px`;
      animatingOverlay.style.width = `${originalPos.width}px`;
      animatingOverlay.style.height = `${originalPos.height}px`;
      animatingOverlay.style.opacity = '0';
    });

    const cleanup = () => {
      animatingOverlay.remove();
      originalTilePositionRef.current = null;
      refDiv?.remove();
      parent.style.transition = 'none';
      el.style.transition = 'none';
      parent.style.setProperty('--rot-y-delta', '0deg');
      parent.style.setProperty('--rot-x-delta', '0deg');
      requestAnimationFrame(() => {
        el.style.visibility = '';
        el.style.opacity = '0';
        focusedElRef.current = null;
        root.removeAttribute('data-enlarging');
        requestAnimationFrame(() => {
          parent.style.transition = '';
          el.style.transition = 'opacity 300ms ease-out';
          requestAnimationFrame(() => {
            el.style.opacity = '1';
            window.setTimeout(() => {
              el.style.transition = '';
              el.style.opacity = '';
              openingRef.current = false;
              unlockScroll();
            }, 300);
          });
        });
      });
    };

    animatingOverlay.addEventListener('transitionend', cleanup, { once: true });
  }, [enlargeTransitionMs, unlockScroll]);

  useEffect(() => {
    const scrim = scrimRef.current;
    if (!scrim) return undefined;

    const onKey = (event: Event) => {
      if ((event as unknown as { key?: string }).key === 'Escape') closeFocusedItem();
    };

    scrim.addEventListener('click', closeFocusedItem);
    window.addEventListener('keydown', onKey);
    return () => {
      scrim.removeEventListener('click', closeFocusedItem);
      window.removeEventListener('keydown', onKey);
    };
  }, [closeFocusedItem]);

  const openItemFromElement = useCallback(
    (el: HTMLDivElement) => {
      if (openingRef.current) return;
      const parent = el.parentElement as HTMLElement | null;
      const main = mainRef.current;
      const frame = frameRef.current;
      const viewer = viewerRef.current;
      if (!parent || !main || !frame || !viewer) return;

      openingRef.current = true;
      openStartedAtRef.current = performance.now();
      lockScroll();
      focusedElRef.current = el;
      el.setAttribute('data-focused', 'true');

      const offsetX = getDataNumber(parent, 'offsetX', 0);
      const offsetY = getDataNumber(parent, 'offsetY', 0);
      const sizeX = getDataNumber(parent, 'sizeX', 2);
      const sizeY = getDataNumber(parent, 'sizeY', 2);
      const parentRot = computeItemBaseRotation(offsetX, offsetY, sizeX, sizeY, segmentCount);
      const parentY = normalizeAngle(parentRot.rotateY);
      const globalY = normalizeAngle(rotationRef.current.y);
      let rotY = -(parentY + globalY) % 360;
      if (rotY < -180) rotY += 360;
      const rotX = -parentRot.rotateX - rotationRef.current.x;

      parent.style.setProperty('--rot-y-delta', `${rotY}deg`);
      parent.style.setProperty('--rot-x-delta', `${rotX}deg`);

      const refDiv = document.createElement('div');
      refDiv.className = 'dg-item__image dg-item__image--reference';
      refDiv.style.opacity = '0';
      refDiv.style.transform = `rotateX(${-parentRot.rotateX}deg) rotateY(${-parentRot.rotateY}deg)`;
      parent.appendChild(refDiv);
      void refDiv.offsetHeight;

      const tileR = refDiv.getBoundingClientRect();
      const mainR = main.getBoundingClientRect();
      const frameR = frame.getBoundingClientRect();
      if (tileR.width <= 0 || tileR.height <= 0) {
        openingRef.current = false;
        focusedElRef.current = null;
        refDiv.remove();
        unlockScroll();
        return;
      }

      originalTilePositionRef.current = tileR;
      el.style.visibility = 'hidden';
      const overlay = document.createElement('div');
      overlay.className = 'dg-enlarge';
      overlay.style.position = 'absolute';
      overlay.style.left = `${frameR.left - mainR.left}px`;
      overlay.style.top = `${frameR.top - mainR.top}px`;
      overlay.style.width = `${frameR.width}px`;
      overlay.style.height = `${frameR.height}px`;
      overlay.style.opacity = '0';
      overlay.style.zIndex = '30';
      overlay.style.willChange = 'transform, opacity';
      overlay.style.transformOrigin = 'top left';
      overlay.style.transition = `transform ${enlargeTransitionMs}ms ease, opacity ${enlargeTransitionMs}ms ease`;

      const img = document.createElement('img');
      img.src = parent.dataset.src || el.querySelector('img')?.src || '';
      img.alt = el.getAttribute('aria-label') || '';
      overlay.appendChild(img);
      viewer.appendChild(overlay);

      const tx0 = tileR.left - frameR.left;
      const ty0 = tileR.top - frameR.top;
      const sx0 = tileR.width / frameR.width;
      const sy0 = tileR.height / frameR.height;
      overlay.style.transform = `translate(${tx0}px, ${ty0}px) scale(${Number.isFinite(sx0) && sx0 > 0 ? sx0 : 1}, ${Number.isFinite(sy0) && sy0 > 0 ? sy0 : 1})`;

      window.setTimeout(() => {
        if (!overlay.parentElement) return;
        overlay.style.opacity = '1';
        overlay.style.transform = 'translate(0px, 0px) scale(1, 1)';
        rootRef.current?.setAttribute('data-enlarging', 'true');
      }, 16);

      const onFirstEnd = (event: TransitionEvent) => {
        if (event.propertyName !== 'transform') return;
        overlay.removeEventListener('transitionend', onFirstEnd);
        const prevTransition = overlay.style.transition;
        overlay.style.transition = 'none';
        overlay.style.width = openedImageWidth;
        overlay.style.height = openedImageHeight;
        const newRect = overlay.getBoundingClientRect();
        overlay.style.width = `${frameR.width}px`;
        overlay.style.height = `${frameR.height}px`;
        void overlay.offsetWidth;
        overlay.style.transition = `left ${enlargeTransitionMs}ms ease, top ${enlargeTransitionMs}ms ease, width ${enlargeTransitionMs}ms ease, height ${enlargeTransitionMs}ms ease`;
        overlay.style.left = `${frameR.left - mainR.left + (frameR.width - newRect.width) / 2}px`;
        overlay.style.top = `${frameR.top - mainR.top + (frameR.height - newRect.height) / 2}px`;
        overlay.style.width = openedImageWidth;
        overlay.style.height = openedImageHeight;
        const cleanupSecond = () => {
          overlay.removeEventListener('transitionend', cleanupSecond);
          overlay.style.transition = prevTransition;
        };
        overlay.addEventListener('transitionend', cleanupSecond, { once: true });
      };
      overlay.addEventListener('transitionend', onFirstEnd);
    },
    [enlargeTransitionMs, lockScroll, openedImageHeight, openedImageWidth, segmentCount, unlockScroll],
  );

  const onTileClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (draggingRef.current || movedRef.current || performance.now() - lastDragEndAt.current < 80 || openingRef.current) return;
      openItemFromElement(event.currentTarget);
    },
    [openItemFromElement],
  );

  const onTilePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        event.pointerType !== 'touch' ||
        draggingRef.current ||
        movedRef.current ||
        performance.now() - lastDragEndAt.current < 80 ||
        openingRef.current
      ) {
        return;
      }
      openItemFromElement(event.currentTarget);
    },
    [openItemFromElement],
  );

  const onTileKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openItemFromElement(event.currentTarget);
    },
    [openItemFromElement],
  );

  useEffect(() => {
    return () => {
      stopInertia();
      document.body.classList.remove('dg-scroll-lock');
    };
  }, [stopInertia]);

  return (
    <div
      ref={rootRef}
      className="dg-sphere-root"
      style={
        {
          '--segments-x': segmentCount,
          '--segments-y': segmentCount,
          '--overlay-blur-color': overlayBlurColor,
          '--tile-radius': imageBorderRadius,
          '--enlarge-radius': openedImageBorderRadius,
          '--image-filter': grayscale ? 'grayscale(1)' : 'none',
        } as CSSProperties
      }
    >
      <main ref={mainRef} className="dg-sphere-main" aria-label="Interactive photo dome">
        <div className="dg-stage">
          <div ref={sphereRef} className="dg-sphere">
            {items.map((item, index) => (
              <div
                key={`${item.x},${item.y},${index}`}
                className="dg-item"
                data-src={item.src}
                data-offset-x={item.x}
                data-offset-y={item.y}
                data-size-x={item.sizeX}
                data-size-y={item.sizeY}
                style={
                  {
                    '--offset-x': item.x,
                    '--offset-y': item.y,
                    '--item-size-x': item.sizeX,
                    '--item-size-y': item.sizeY,
                  } as CSSProperties
                }
              >
                <div
                  className="dg-item__image"
                  role="button"
                  tabIndex={0}
                  aria-label={item.alt || 'Open image'}
                  onClick={onTileClick}
                  onKeyDown={onTileKeyDown}
                  onPointerUp={onTilePointerUp}
                >
                  {item.src ? <img src={item.src} draggable={false} alt={item.alt} referrerPolicy="no-referrer" /> : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="dg-overlay" />
        <div className="dg-overlay dg-overlay--blur" />
        <div className="dg-edge-fade dg-edge-fade--top" />
        <div className="dg-edge-fade dg-edge-fade--bottom" />

        <div className="dg-viewer" ref={viewerRef}>
          <div ref={scrimRef} className="dg-scrim" />
          <div ref={frameRef} className="dg-frame" />
        </div>
      </main>
    </div>
  );
}
