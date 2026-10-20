// Global concurrency limiter for heavy Drive media downloads.
// Without this, pages with many photos would fire dozens of full-res
// downloads at once, saturating the network and making the UI feel hung.

const MAX_CONCURRENT = 4;

let active = 0;
type QueueWaiter = {
  grant: () => void;
  reject: (error: Error) => void;
};

const waiters: QueueWaiter[] = [];

const cancelledError = () => {
  const error = new Error('Media request was cancelled.');
  error.name = 'AbortError';
  return error;
};

const release = () => {
  active -= 1;
  const next = waiters.shift();
  next?.grant();
};

const acquire = (signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancelledError());
      return;
    }

    let waiter: QueueWaiter;
    const onAbort = () => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      signal?.removeEventListener('abort', onAbort);
      reject(cancelledError());
    };
    const grant = () => {
      signal?.removeEventListener('abort', onAbort);
      active += 1;
      resolve();
    };
    waiter = { grant, reject };

    if (active < MAX_CONCURRENT) {
      grant();
      return;
    }
    waiters.push(waiter);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export const withMediaFetch = async <T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
  await acquire(signal);
  try {
    return await task();
  } finally {
    release();
  }
};
