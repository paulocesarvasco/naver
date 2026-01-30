import { initWorker } from './helpers/workers.js';
import { env } from './config/env.js';
import { extractScanParameters, replaceScanParameters } from './helpers/url.js';
import { type ChildProcess } from 'node:child_process';
import EventEmitter from 'node:events';
import { RedisClient } from './database/client.js';
import { createLogger } from './log/logger.js';

const log = createLogger();

class Service extends EventEmitter {
  private workers = new Map<string, ChildProcess>();
  private database!: RedisClient;

  constructor() {
    super();
    this.initDatabase();
  }

  private async initDatabase() {
    this.database = new RedisClient();
    await this.database.connect();
  }

  extractData(url: string, requestID: string) {
    const scanParameters = extractScanParameters(url);
    for (let i = 0; i < env.WORKERS; i++) {
      const name = `Worker_${i}`;
      const step = String(env.WORKERS);
      const cursor = scanParameters.cursor + scanParameters.pageSize * i;
      const listPage = scanParameters.listPage + i;

      const worker = initWorker(
        name,
        replaceScanParameters(url, cursor, listPage, scanParameters.pageSize),
        step,
        requestID,
      );

      worker.once('exit', (code, signal) => {
        log.info({ 'worker finished': name, code: code });
        this.workers.delete(name);

        if (this.workers.size == 0) {
          this.emit('finish_scan', this.database.read(requestID));
        }
      });

      this.workers.set(name, worker);
    }
  }
}

const service = new Service();

export default service;
