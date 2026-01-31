import { initWorker, WorkerRequestMessage, WorkerResponseMessage } from './helpers/workers.js';
import { env } from './config/env.js';
import { extractScanParameters, replaceScanParameters } from './helpers/url.js';
import { type ChildProcess } from 'node:child_process';
import EventEmitter from 'node:events';
import { RedisClient } from './database/client.js';
import { createLogger } from './log/logger.js';

const log = createLogger();

class Service extends EventEmitter {
  private busyWorkers = new Map<string, ChildProcess>();
  private idleWorkers = new Map<string, ChildProcess>();
  private ongoing = new Map<string, number>();
  private database!: RedisClient;

  constructor() {
    super();
    this.initDatabase();
  }

  private async initDatabase() {
    this.database = new RedisClient();
    await this.database.connect();
    await this.initWorkers();
  }

  private async initWorkers() {
    for (let i = 0; i < env.WORKERS; i++) {
      const name = `Worker_${i}`;

      const worker = initWorker(name);

      worker.on('exit', (code, signal) => {
        // TODO: handle exit abnormal processes
        log.warn({ 'worker finished': name, code: code });
      });

      worker.on('error', (err) => log.error(err));

      worker.on('message', (msg: WorkerResponseMessage) => {
        const w = this.busyWorkers.get(msg.worker_name);
        if (!w) return;
        this.idleWorkers.set(msg.worker_name, w);
        this.busyWorkers.delete(msg.worker_name);
        switch (msg.type) {
          case 'scan_finish':
            let request = this.ongoing.get(msg.request_id);
            if (!request) return;
            request--;
            if (request == 0) {
              this.emit('scan_finish', {
                requestID: msg.request_id,
                result: this.database.read(msg.request_id),
              });
              this.ongoing.delete(msg.request_id);
            } else {
              this.ongoing.set(msg.request_id, request);
            }
            break;
          case 'scan_error':
            // TODO: handle error cases
            this.emit('error', msg.error);
            break;
        }
      });

      this.idleWorkers.set(name, worker);
    }
  }

  scanAllPages(url: string, requestID: string) {
    const step = this.idleWorkers.size;
    let offset = 0;

    while (this.idleWorkers.size > 0) {
      const workerEntry = this.idleWorkers.entries().next().value;
      if (!workerEntry) return;

      const [name, worker] = workerEntry;
      this.idleWorkers.delete(name);
      this.busyWorkers.set(name, worker);

      const scanParameters = extractScanParameters(url);
      const cursor = scanParameters.cursor + scanParameters.pageSize * offset;
      const listPage = scanParameters.listPage + offset;

      const msg: WorkerRequestMessage = {
        type: 'scan',
        request_id: requestID,
        url: replaceScanParameters(url, cursor, listPage, scanParameters.pageSize),
        step: step,
        batch: true,
      };

      let request = this.ongoing.get(requestID);
      request ? this.ongoing.set(requestID, ++request) : this.ongoing.set(requestID, 1);

      worker.send(msg);
      offset++;
    }
  }

  scanSinglePage(url: string, requestID: string) {
    const workerEntry = this.idleWorkers.entries().next().value;
    if (!workerEntry) return;

    const [name, worker] = workerEntry;
    this.idleWorkers.delete(name);
    this.busyWorkers.set(name, worker);

    const msg: WorkerRequestMessage = {
      type: 'scan',
      request_id: requestID,
      url: url,
      step: 1,
      batch: false,
    };
    worker.send(msg);

    let request = this.ongoing.get(requestID);
    request ? log.error('request not registered') : this.ongoing.set(requestID, 1);
  }

  isAvailable(): boolean {
    return this.idleWorkers.size > 0;
  }

  async shutdown() {
    for (const [name, worker] of this.idleWorkers) {
      worker.kill();
      this.idleWorkers.delete(name);
    }
    for (const [name, worker] of this.busyWorkers) {
      worker.kill();
      this.idleWorkers.delete(name);
    }
    await this.database.disconnect();
  }
}

const service = new Service();

export default service;
