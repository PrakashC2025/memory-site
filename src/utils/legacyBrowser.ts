/* Small, dependency-free fallbacks for older Android TV Chromium builds.
   These are intentionally conservative: they keep the app renderable when a
   browser lacks an optional observer or Array helper. */

export const installLegacyBrowserSupport = () => {
  const browserWindow = window as Window & {
    queueMicrotask?: (callback: VoidFunction) => void;
    IntersectionObserver?: typeof IntersectionObserver;
    ResizeObserver?: typeof ResizeObserver;
  };

  // Android 9 TV WebView (Chromium 66) does not expose queueMicrotask,
  // which modern React/runtime code may call during the first render.
  if (!browserWindow.queueMicrotask) {
    Object.defineProperty(browserWindow, 'queueMicrotask', {
      configurable: true,
      value: (callback: VoidFunction) => Promise.resolve().then(callback),
    });
  }

  if (!Array.prototype.flatMap) {
    Object.defineProperty(Array.prototype, 'flatMap', {
      configurable: true,
      writable: true,
      value: function <T, U>(this: T[], mapper: (value: T, index: number, array: T[]) => U | U[], thisArg?: unknown) {
        return this.reduce<U[]>((result, value, index, array) => {
          const mapped = mapper.call(thisArg, value, index, array);
          return result.concat(mapped as U | U[]);
        }, []);
      },
    });
  }

  if (!browserWindow.IntersectionObserver) {
    Object.defineProperty(browserWindow, 'IntersectionObserver', {
      configurable: true,
      value: class LegacyIntersectionObserver {
        constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
        observe(_target: Element) {}
        unobserve(_target: Element) {}
        disconnect() {}
        takeRecords(): IntersectionObserverEntry[] { return []; }
      },
    });
  }

  if (!browserWindow.ResizeObserver) {
    Object.defineProperty(browserWindow, 'ResizeObserver', {
      configurable: true,
      value: class LegacyResizeObserver {
        constructor(_callback: ResizeObserverCallback) {}
        observe(_target: Element) {}
        unobserve(_target: Element) {}
        disconnect() {}
      },
    });
  }
};
