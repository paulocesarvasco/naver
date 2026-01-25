import { buildApp } from "./app.js";

const port = 3000;
const host = "0.0.0.0";

const app = buildApp();

async function start() {
  try {
    await app.listen({ port, host });
  } catch (err) {
    app.log.error(err, "failed to start server");
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  app.log.info({ signal }, "received shutdown signal");

  try {
    await app.close();
    app.log.info("server closed gracefully");
    process.exit(0);
  } catch (err) {
    app.log.error(err, "error during shutdown");
    process.exit(1);
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start();
