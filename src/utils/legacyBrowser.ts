/* Small, dependency-free fallbacks for older Android TV Chromium builds. */

export const isLegacyTvBrowser = () => {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  // The Android TV emulator and several real TVs identify themselves as
  // `sdk_google_atv` without including the words "Android TV". Keep mobile
  // Android WebViews out of this path unless they advertise a TV platform.
  return /Android\s+\d[^)]*(?:sdk_google_atv|google_atv|android\s*tv|smart[- ]?tv|hbbtv)|GoogleTV|AFT[BSM]|BRAVIA|SHIELD/i.test(userAgent);
};

export const installLegacyBrowserSupport = () => {
  const browserWindow = window as Window & {
    queueMicrotask?: (callback: VoidFunction) => void;
    IntersectionObserver?: typeof IntersectionObserver;
    ResizeObserver?: typeof ResizeObserver;
  };

  // Tailwind v4 emits its utilities inside @layer blocks. Chromium 66 (used
  // by several Android TV devices) ignores those blocks, so add a marker that
  // lets the plain-CSS compatibility rules restore the essential layout.
  if (isLegacyTvBrowser()) {
    document.documentElement.classList.add('legacy-tv-browser');
  }

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
