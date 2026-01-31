import { newServer } from './server.js';
import { env } from './config/env.js';
import service from './service.js';
import { FastifyInstance } from 'fastify';

type ShutdownSignal = 'SIGTERM' | 'SIGINT';

export class App {
  private server!: FastifyInstance;

  constructor() {
    this.server = newServer();
  }

  async start(): Promise<void> {
    try {
      await this.server.listen({ port: env.SERVER_PORT, host: env.SERVER_HOST });
    } catch (err) {
      this.server.log.error(err, 'failed to start server');
      process.exitCode = 1;
    }
  }

  async shutdown(signal: ShutdownSignal): Promise<void> {
    this.server.log.info({ signal }, 'received shutdown signal');

    try {
      await service.shutdown();
      this.server.log.info('server closed gracefully');
      await this.server.close();
    } catch (err) {
      this.server.log.error(err, 'error shutdown application');
      process.exit(1);
    }
  }
}
