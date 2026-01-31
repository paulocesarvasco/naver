import { fork, ChildProcess } from 'node:child_process';
import path from 'node:path';

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
