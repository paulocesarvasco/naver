export function waitForEvent<T>(emitter: NodeJS.EventEmitter, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const onEvent = (value: T) => {
      emitter.off('error', onError);
      resolve(value);
    };

    const onError = (err: unknown) => {
      emitter.off(event, onEvent);
      reject(err);
    };

    emitter.once(event, onEvent);
    emitter.once('error', onError);
  });
}
