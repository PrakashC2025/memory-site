// Global concurrency limiter for heavy Drive media downloads.
// Without this, pages with many photos would fire dozens of full-res
// downloads at once, saturating the network and making the UI feel hung.

const MAX_CONCURRENT = 4;

let active = 0;
const waiters: Array<() => void> = [];

const release = () => {
  active -= 1;
  const next = waiters.shift();
  if (next) {
    active += 1;
    next();
  }
};

const acquire = () =>
  new Promise<void>(resolve => {
    if (active < MAX_CONCURRENT) {
      active += 1;
      resolve();
      return;
    }
    waiters.push(resolve);
  });

export const withMediaFetch = async <T>(task: () => Promise<T>): Promise<T> => {
  await acquire();
  try {
    return await task();
  } finally {
    release();
  }
};