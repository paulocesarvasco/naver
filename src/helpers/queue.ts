import service from '../service.js';
import type { ResponsePayload, Task } from '../types/types.js';

export class AwaitQueue<T> {
  private running = 0;
  private q: Task<T>[] = [];

  pending() {
    return this.q.length;
  }

  push(run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.q.push({ run, resolve, reject });
      this.pop();
    });
  }

  private pop() {
    while (
      this.running <= service.operationalWorkers() &&
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
          this.pop();
        });
    }
  }
}

const requestQueue = new AwaitQueue<ResponsePayload>();

export default requestQueue;
