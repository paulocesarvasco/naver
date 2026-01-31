import { App } from './src/app.js';

const app = new App();

process.once('SIGTERM', () => void app.shutdown('SIGTERM'));
process.once('SIGINT', () => void app.shutdown('SIGINT'));

process.on('uncaughtException', (err, origin) => {
  console.log({ 'Uncaught Exception': err });
  console.log({ 'Origin:': origin });
  process.exit(10);
});

app.start();
