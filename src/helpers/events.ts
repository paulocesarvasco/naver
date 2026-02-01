type WaitForEventOptions<T> = {
  timeout?: number;
  filter: (value: T) => boolean;
};

export class TimeoutError extends Error {
  public readonly name = 'TimeoutError';
  constructor() {
    super();
  }
}

export function waitForEvent<T>(
  emitter: NodeJS.EventEmitter,
  event: string,
  opts: WaitForEventOptions<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = opts.timeout ?? 0;
    let timer: NodeJS.Timeout | undefined;

    const onEvent = (value: T) => {
      if (!opts.filter(value)) return;
      cleanup();
      resolve(value);
    };

    const onError = (value: T, err: unknown) => {
      if (!opts.filter(value)) return;
      cleanup();
      reject(err);
    };

    const onTimeout = () => {
      emitter.emit('timeout', opts.filter);
      cleanup();
      reject(new TimeoutError());
    };

    function cleanup() {
      if (timer) clearTimeout(timer);
      emitter.removeListener(event, onEvent);
      emitter.removeListener('error', onError);
    }

    emitter.on(event, onEvent);
    emitter.on('error', onError);

    if (timeout > 0) {
      timer = setTimeout(onTimeout, timeout);
      timer.unref?.();
    }
  });
}
