import { fork, ChildProcess } from 'node:child_process';
import path from 'node:path';

export function initWorker(
  workerName: string,
  targetUrl: string,
  step: string,
  id: string,
): ChildProcess {
  const absoluteScriptPath = path.resolve(new URL('../crawler.js', import.meta.url).pathname);
  const worker = fork(absoluteScriptPath, [workerName, targetUrl, step, id], {
    cwd: process.cwd(),
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });

  return worker;
}
