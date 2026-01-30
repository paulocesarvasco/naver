import pino from 'pino';

export function createLogger(bindings = {}) {
  // LOG_LEVEL=info|debug|warn|error
  const level = process.env.LOG_LEVEL || 'info';

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
