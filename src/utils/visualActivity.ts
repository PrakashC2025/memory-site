// Global switch for expensive *background* visuals.
//
// While a Story Mode reel is open it covers the viewport with a nearly opaque
// overlay, so the ambient canvases behind it (animated background and the
// splash cursor) are invisible - yet they kept animating at full speed. Because
// the overlay uses a backdrop blur, that hidden animation also forced the
// browser to re-blur the whole screen on every frame, which is what made phones
// run hot. Pausing those layers costs nothing visually and removes the heat.

type PauseListener = (paused: boolean) => void;

let pauseCount = 0;
const listeners = new Set<PauseListener>();

const notify = () => {
  const paused = pauseCount > 0;
  listeners.forEach(listener => listener(paused));
};

export const isHeavyVisualPaused = () => pauseCount > 0;

/**
 * Marks an expensive full-screen visual as hidden. Returns a release function;
 * nesting is counted so overlapping reels never resume the background early.
 */
export const beginHeavyVisualPause = () => {
  pauseCount += 1;
  if (pauseCount === 1) {
    // Reflect the state on the document so CSS can drop costly properties
    // (backdrop blur) for the duration.
    document.documentElement.classList.add('heavy-visual-paused');
    notify();
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    pauseCount = Math.max(0, pauseCount - 1);
    if (pauseCount === 0) {
      document.documentElement.classList.remove('heavy-visual-paused');
      notify();
    }
  };
};

export const onHeavyVisualPauseChange = (listener: PauseListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
