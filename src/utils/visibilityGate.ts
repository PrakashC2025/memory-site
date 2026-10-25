// Shared near-viewport detection for heavy media work.
//
// A library with hundreds of photos mounts hundreds of preview components at
// once. If every one of them immediately reads IndexedDB and queues a Drive
// download, the media queue (4 slots) is filled with work for images that are
// far off screen, and the photos the person is actually looking at never
// arrive. Gating that work on an IntersectionObserver keeps the queue focused
// on what is visible.

type VisibilityListener = () => void;

const listeners = new Map<Element, VisibilityListener>();
let observer: IntersectionObserver | undefined;

const getObserver = () => {
  if (observer || typeof IntersectionObserver === 'undefined') return observer;
  observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const listener = listeners.get(entry.target);
      if (!listener) return;
      // One-shot: once an element has been near the viewport, its media should
      // stay loaded even if it scrolls away again.
      listeners.delete(entry.target);
      observer?.unobserve(entry.target);
      listener();
    });
  }, { rootMargin: '800px 0px' });
  return observer;
};

/**
 * Runs `onVisible` the first time `element` comes within ~800px of the
 * viewport. Falls back to running immediately when IntersectionObserver is
 * unavailable (older TV browsers), so behaviour never regresses to "no image".
 * Returns a cleanup function.
 */
export const observeNearViewport = (element: Element, onVisible: VisibilityListener) => {
  const activeObserver = getObserver();
  if (!activeObserver) {
    onVisible();
    return () => undefined;
  }
  listeners.set(element, onVisible);
  activeObserver.observe(element);
  return () => {
    listeners.delete(element);
    activeObserver.unobserve(element);
  };
};
