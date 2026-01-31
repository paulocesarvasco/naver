import { env } from '../config/env.js';
import service from '../service.js';
import { type ResponsePayload } from './types.js';

type Task<T> = {
  run: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};

export class AwaitQueue<T> {
  private running = 0;
  private q: Task<T>[] = [];

  pending() {
    return this.q.length;
  }

  push(run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.q.push({ run, resolve, reject });
      this.pump();
    });
  }

  private pump() {
    while (
      this.running <= service.operationalWorks() &&
      service.isAvailable() &&
      this.q.length > 0
    ) {
      const t = this.q.shift()!;
      this.running++;

      t.run()
        .then(t.resolve)
        .catch(t.reject)
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }
}

const requestQueue = new AwaitQueue<ResponsePayload>();

export default requestQueue;
