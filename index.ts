import { App } from './src/app.js';
import service from './src/service.js';

const app = new App();

process.once('SIGTERM', () => void app.shutdown('SIGTERM'));
process.once('SIGINT', () => void app.shutdown('SIGINT'));

process.on('uncaughtException', (err, origin) => {
  console.log({ 'Uncaught Exception': err });
  console.log({ 'Origin:': origin });
  process.exit(10);
});

service.once('service_started', () => {
  app.start();
});
