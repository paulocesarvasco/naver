import Fastify, { type FastifyInstance } from 'fastify';
import { healthRoutes, scan } from './routes/health.js';

export function newServer(): FastifyInstance {
  const server = Fastify({
    logger: true,
  });

  server.register(healthRoutes, { prefix: '/health' });
  server.register(scan, { prefix: '/scan' });

  server.setErrorHandler((err, _req, reply) => {
    server.log.error(err);

    const statusCode = typeof (err as any).statusCode === 'number' ? (err as any).statusCode : 500;

    reply.code(statusCode).send({
      error: statusCode === 500 ? 'internal_error' : 'request_error',
      message: err.message,
    });
  });

  return server;
}
