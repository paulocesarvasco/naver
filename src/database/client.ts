import { createClient, RedisClientType } from 'redis';
import { env } from '../config/env.js';

export class RedisClient {
  private client: RedisClientType;
  private connected = false;

  constructor(url = `${env.DB_HOST}:${env.DB_PORT}`) {
    this.client = createClient({ url });

    this.client.on('error', (err) => {
      console.error('[Redis] error:', err);
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

  // async read(streamKey: string, count = 100): Promise<unknown[]> {
  async read(streamKey: string, count = 100) {
    const entries = await this.client.xRange(streamKey, '-', '+', { COUNT: count });

    console.log(entries);

    // return entries.map((e) => JSON.parse(fields.json));
  }
}
