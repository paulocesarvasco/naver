import pino from 'pino';

export function createLogger(bindings = {}) {
  const level = process.env.LOG_LEVEL || 'debug';

  return pino({
    level,
    base: {
      pid: process.pid,
      service: process.env.WORKER_ID || 'CRAWLER',
      ...bindings,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
