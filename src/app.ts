import { newServer } from './server.js';
import { env } from './config/env.js';

const server = newServer();

async function start() {
  try {
    await server.listen({ port: env.SERVER_PORT, host: env.SERVER_HOST });
  } catch (err) {
    server.log.error(err, 'failed to start server');
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  server.log.info({ signal }, 'received shutdown signal');

  try {
    await server.close();
    server.log.info('server closed gracefully');
    process.exit(0);
  } catch (err) {
    server.log.error(err, 'error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
