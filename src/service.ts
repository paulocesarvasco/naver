import { initWorker } from './/crawler/workers.js';
import { RequestInfo, WorkerRequestMessage, WorkerResponseMessage } from './types/types.js';
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
  private ongoing = new Map<string, RequestInfo>();
  private database!: RedisClient;
  private activeWorkers = 0;

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
        if (code != 0) {
          log.warn({ 'worker down': name, code: code });
        } else {
          log.info({ 'worker finished': name, code: code });
        }
        this.busyWorkers.delete(name);
        this.idleWorkers.delete(name);
        this.activeWorkers--;
      });

      worker.on('error', (err) => log.error(err));

      worker.on('message', async (msg: WorkerResponseMessage) => {
        let requestInfo: RequestInfo | undefined;
        switch (msg.type) {
          case 'scan_finish':
            requestInfo = this.ongoing.get(msg.request_id);
            if (!requestInfo) return;
            requestInfo.ongoingRequests--;
            if (requestInfo.ongoingRequests == 0) {
              this.emit('scan_finish', {
                requestID: msg.request_id,
                result: await this.database.read(msg.request_id),
              });
              this.ongoing.delete(msg.request_id);
              this.database
                .delete(msg.request_id)
                .catch((err) => log.error({ msg: 'failed to remove events', error: err }));
              requestInfo.workers.forEach((worker) => this.swapWorkerState(worker));
            } else {
              this.ongoing.set(msg.request_id, requestInfo);
            }
            break;
          case 'scan_error':
            requestInfo = this.ongoing.get(msg.request_id);
            if (!requestInfo) return;
            requestInfo.ongoingRequests--;
            if (requestInfo.ongoingRequests == 0) {
              this.emit('error', {
                requestID: msg.request_id,
                error: msg.error,
              });
              this.ongoing.delete(msg.request_id);
              this.database
                .delete(msg.request_id)
                .catch((err) => log.error({ msg: 'failed to remove events', error: err }));
              this.swapWorkerState(msg.worker_name);
            } else {
              this.ongoing.set(msg.request_id, requestInfo);
            }
            break;
          case 'worker_started':
            log.info(`${msg.worker_name} started`);
            this.activeWorkers++;
            if (this.activeWorkers == env.WORKERS) this.emit('service_started');
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
      this.swapWorkerState(name);

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

      let requestInfo = this.ongoing.get(requestID);
      if (requestInfo) {
        requestInfo.workers.push(name);
        requestInfo.ongoingRequests++;
        this.ongoing.set(requestID, requestInfo);
      } else {
        const requestInfo: RequestInfo = {
          workers: [name],
          ongoingRequests: 1,
        };
        this.ongoing.set(requestID, requestInfo);
      }

      worker.send(msg);
      offset++;
    }
  }

  scanSinglePage(url: string, requestID: string) {
    const workerEntry = this.idleWorkers.entries().next().value;
    if (!workerEntry) return;

    const [name, worker] = workerEntry;
    this.swapWorkerState(name);

    const msg: WorkerRequestMessage = {
      type: 'scan',
      request_id: requestID,
      url: url,
      step: 1,
      batch: false,
    };

    const requestInfo: RequestInfo = {
      workers: [name],
      ongoingRequests: 1,
    };
    this.ongoing.set(requestID, requestInfo);

    worker.send(msg);
  }

  isAvailable(): boolean {
    return this.idleWorkers.size > 0;
  }

  operationalWorkers(): number {
    return this.activeWorkers;
  }

  async shutdown() {
    await this.database.disconnect();
    for (const [name, worker] of this.idleWorkers) {
      worker.kill();
      this.idleWorkers.delete(name);
    }
    for (const [name, worker] of this.busyWorkers) {
      worker.kill();
      this.idleWorkers.delete(name);
    }
  }

  cancelRequest(requestID: string) {
    const requestInfo = this.ongoing.get(requestID);
    if (!requestInfo) {
      log.warn({ msg: 'request not found', request_id: requestID });
      return;
    }

    requestInfo.workers.forEach((workerName) => {
      const worker = this.busyWorkers.get(workerName);
      if (!worker) {
        log.warn({ msg: 'worker not active', worker: workerName });
        return;
      }
      worker.send(<WorkerRequestMessage>{ type: 'cancel' });
      this.swapWorkerState(workerName);
    });
    this.ongoing.delete(requestID);
  }

  private swapWorkerState(workerName: string) {
    let worker = this.busyWorkers.get(workerName);
    if (worker) {
      this.busyWorkers.delete(workerName);
      this.idleWorkers.set(workerName, worker);
    } else {
      worker = this.idleWorkers.get(workerName);
      if (!worker) {
        log.warn({ msg: 'worker not found', name: workerName });
        return;
      }
      this.idleWorkers.delete(workerName);
      this.busyWorkers.set(workerName, worker);
    }
  }
}

const service = new Service();

export default service;
