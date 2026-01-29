import { initWorker } from './helpers/workers.js';
import { env } from './config/env.js';
import { extractScanParameters, replaceScanParameters } from './helpers/url.js';
import { type ChildProcess } from 'node:child_process';

const workers = new Map<string, ChildProcess>();

export function extractData(url: string, requestID: string) {
  const scanParameters = extractScanParameters(url);
  for (let i = 0; i < env.WORKERS; i++) {
    const name = `W_${i}`;
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
      console.log({ name, code, signal });
      workers.delete(name);
    });

    workers.set(name, worker);
  }
}
