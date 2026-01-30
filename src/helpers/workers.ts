import { fork, ChildProcess } from 'node:child_process';
import path from 'node:path';

export type WorkerRequestMessage =
  | { type: 'scan'; request_id: string; url: string; step: number; batch: boolean }
  | { type: 'shutdown' };

export type WorkerResponseMessage =
  | { type: 'scan_finish'; request_id: string; worker_name: string }
  | { type: 'scan_error'; error: string; worker_name: string };

export function initWorker(workerName: string): ChildProcess {
  const absoluteScriptPath = path.resolve(new URL('../crawler.js', import.meta.url).pathname);
  const worker = fork(absoluteScriptPath, [], {
    cwd: process.cwd(),
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env: {
      ...process.env,
      WORKER_ID: workerName,
    },
  });

  return worker;
}
