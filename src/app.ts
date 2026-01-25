import Fastify, { type FastifyInstance } from "fastify";
import { healthRoutes } from "./routes/health.js";


export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true
  });

  app.register(healthRoutes, { prefix: "/health" });

  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err);

    const statusCode = typeof (err as any).statusCode === "number" ? (err as any).statusCode : 500;

    reply.code(statusCode).send({
      error: statusCode === 500 ? "internal_error" : "request_error",
      message: err.message
    });
  });

  return app;
}
