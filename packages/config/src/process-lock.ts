type QueueEntry = {
  grant: () => void;
  isCancelled: boolean;
};

export class Mutex {
  isLocked = false;
  queue: QueueEntry[] = [];

  async acquire(acquireTimeout: number, name: string): Promise<void> {
    if (!this.isLocked) {
      this.isLocked = true;
      return;
    }

    if (acquireTimeout === 0) {
      throw new Error(
        `Acquiring lock "${name}" failed immediately as it is already held`,
      );
    }

    return new Promise<void>((resolve, reject) => {
      const entry: QueueEntry = {
        grant: () => {},
        isCancelled: false,
      };

      let timer: ReturnType<typeof setTimeout> | undefined;

      if (acquireTimeout > 0) {
        timer = setTimeout(() => {
          entry.isCancelled = true;
          const idx = this.queue.indexOf(entry);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
          }
          reject(
            new Error(
              `Timeout acquiring client lock "${name}" after ${acquireTimeout}ms`,
            ),
          );
        }, acquireTimeout);
      }

      entry.grant = () => {
        if (timer) clearTimeout(timer);
        resolve();
      };

      this.queue.push(entry);
    });
  }

  release(): void {
    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (!next.isCancelled) {
        next.grant();
        return;
      }
    }
    this.isLocked = false;
  }
}

const locks = new Map<string, Mutex>();

export const processLock = async <R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> => {
  let mutex = locks.get(name);
  if (!mutex) {
    mutex = new Mutex();
    locks.set(name, mutex);
  }

  await mutex.acquire(acquireTimeout, name);
  try {
    return await fn();
  } finally {
    mutex.release();
    if (!mutex.isLocked && mutex.queue.length === 0) {
      locks.delete(name);
    }
  }
};
