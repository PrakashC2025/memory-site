/* Small, dependency-free fallbacks for older Android TV Chromium builds. */

export const isLegacyTvUserAgent = (userAgent: string) => {
  const androidVersion = userAgent.match(/Android\s+(\d+)/i)?.[1];
  const chromeVersion = userAgent.match(/(?:Chrome|Chromium)\/(\d+)/i)?.[1];
  const oldNonMobileAndroid = Boolean(androidVersion && Number(androidVersion) <= 9 && !/Mobile/i.test(userAgent));
  const oldChromiumTv = Boolean(chromeVersion && Number(chromeVersion) <= 66 && !/Mobile/i.test(userAgent));
  // Do not classify modern Android TV or Google TV as legacy: those devices
  // should keep the full effects and visual treatment. Only old Android TV
  // WebViews, old Chromium builds, and known store-browser UAs use the safe
  // compatibility surface.
  return oldNonMobileAndroid
    || oldChromiumTv
    || /(?:geestar|geestart|gobrowser|go browser)/i.test(userAgent);
};

export const isLegacyTvBrowser = () => {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  return isLegacyTvUserAgent(userAgent);
};

export const installLegacyBrowserSupport = () => {
  const browserWindow = window as Window & {
    queueMicrotask?: (callback: VoidFunction) => void;
    IntersectionObserver?: typeof IntersectionObserver;
    ResizeObserver?: typeof ResizeObserver;
    AbortController?: typeof AbortController;
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

  if (!browserWindow.AbortController) {
    class LegacyAbortController {
      signal = {
        aborted: false,
        listeners: [] as Array<() => void>,
        addEventListener: (_type: string, listener: () => void) => {
          this.signal.listeners.push(listener);
        },
        removeEventListener: (_type: string, listener: () => void) => {
          this.signal.listeners = this.signal.listeners.filter(item => item !== listener);
        },
      };

      abort() {
        if (this.signal.aborted) return;
        this.signal.aborted = true;
        this.signal.listeners.slice().forEach(listener => listener());
      }
    }
    Object.defineProperty(browserWindow, 'AbortController', {
      configurable: true,
      value: LegacyAbortController,
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

  if (!String.prototype.padStart) {
    String.prototype.padStart = function (targetLength: number, padString = ' ') {
      const value = String(this);
      if (value.length >= targetLength) return value;
      const fill = String(padString || ' ');
      const needed = targetLength - value.length;
      return fill.repeat(Math.ceil(needed / fill.length)).slice(0, needed) + value;
    };
  }

  const rafWindow = browserWindow as Window & {
    requestAnimationFrame?: (callback: FrameRequestCallback) => number;
    cancelAnimationFrame?: (handle: number) => void;
  };
  if (!rafWindow.requestAnimationFrame) {
    rafWindow.requestAnimationFrame = callback => window.setTimeout(() => callback(Date.now()), 16) as unknown as number;
    rafWindow.cancelAnimationFrame = handle => window.clearTimeout(handle as unknown as number);
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
