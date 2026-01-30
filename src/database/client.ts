import { createClient, RedisClientType } from 'redis';
import { env } from '../config/env.js';

import { createLogger } from '../log/logger.js';

const log = createLogger();

export class RedisClient {
  private client: RedisClientType;
  private connected = false;

  constructor(url = `${env.DB_HOST}:${env.DB_PORT}`) {
    this.client = createClient({ url });
    this.registerListeners();
  }

  private registerListeners() {
    this.client.on('connect', () => {
      log.info('database connected');
    });

    this.client.on('ready', () => {
      log.info('database client ready');
    });

    this.client.on('reconnecting', () => {
      log.warn('database reconnecting');
    });

    this.client.on('end', () => {
      log.warn('database connection closed');
    });

    this.client.on('error', (err) => {
      log.error('database error', err);
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    await this.client.connect();

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    await this.client.quit();
    this.connected = false;
  }

  async save(streamKey: string, data: unknown): Promise<string> {
    return this.client.xAdd(streamKey, '*', { json: JSON.stringify(data) });
  }

  async read(streamKey: string): Promise<Object[]> {
    const entries = await this.client.xRange(streamKey, '-', '+');

    return entries
      .map((e) => {
        return JSON.parse(e.message.json);
      })
      .flat();
  }
}
