type WaitForEventOptions<T> = {
  /** Reject if no matching event arrives within this time */
  timeoutMs?: number;
  /** Only resolve when this returns true */
  filter: (value: T) => boolean;
  /** Abort/cancel waiting (e.g. on client disconnect) */
  signal?: AbortSignal;
  /** Which event should be treated as an error (default: "error") */
  errorEvent?: string;
};

export function waitForEvent<T>(
  emitter: NodeJS.EventEmitter,
  event: string,
  opts: WaitForEventOptions<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const onEvent = (value: T) => {
      if (!opts.filter(value)) return;
      resolve(value);
    };

    const onError = (err: unknown) => {
      reject(err);
    };

    emitter.on(event, onEvent);
    emitter.on('error', onError);
  });
}
