import { firefox, Browser, BrowserContext, Response } from 'playwright';
import { createOEPConfigCookie, createSessionCookie } from '../helpers/cookies.js';
import { env } from '../config/env.js';
import { extractScanParameters, replaceScanParameters } from '../helpers/url.js';
import { RedisClient } from '../database/client.js';
import { createLogger } from '../log/logger.js';
import { delay } from '../helpers/timers.js';
import {
  WorkerRequestMessage,
  WorkerResponseMessage,
  IPInfo,
  PageResponse,
} from '../types/types.js';

import EventEmitter from 'events';

const log = createLogger();

const MAX_RETRIES = 3;
const DEFAULT_REFERER: string =
  'https://search.shopping.naver.com/ns/search?query=iphone&includedDeliveryFee=true&score=4.8%7C5';

export class Crawler extends EventEmitter {
  private browser!: Browser;
  private context!: BrowserContext;
  private cursor!: number;
  private listPage!: number;
  private pageSize!: number;
  private targetUrl!: string;
  private step!: number;
  private requestID!: string;
  private database!: RedisClient;
  private isBatchMode!: boolean;
  private retryCount!: number;
  private isRunning!: boolean;

  constructor(
    private readonly options?: {
      locale?: string;
      userAgent?: string;
    },
  ) {
    super();
    this.database = new RedisClient();
  }

  async init() {
    try {
      this.browser = await firefox.launch({
        headless: true,
        proxy: {
          server: env.PROXY_ADDRESS,
          username: env.PROXY_USER,
          password: env.PROXY_PASS,
        },
      });

      this.browser.on('disconnected', () => log.info('browser disconnected'));
      await this.initContext();
      await this.database.connect();
      this.enableCrawler();
      this.workerStarted();
    } catch (err) {
      log.error({ msg: 'crawler init failed', error: err });
      process.exit(1);
    }
  }

  async initContext() {
    if (!this.browser.isConnected()) {
      throw new Error('browser is not connected');
    }

    if (this.context) {
      try {
        for (const page of this.context.pages()) {
          await page.close();
        }
        await this.context.close();
      } catch (err) {
        log.warn({ err }, 'failed to close previous context');
      }
    }

    try {
      this.context = await this.browser.newContext({
        locale: this.options?.locale ?? 'ko-KR',
        userAgent: this.options?.userAgent ?? '',
      });

      this.context.on('close', () => {
        log.info('context closed');
      });

      await this.createProxySession();
    } catch (err) {
      const error = err as Error;
      log.error({ msg: 'failed to create context', error: error.message });
      await this.initContext();
    }
  }

  private async createProxySession() {
    const page = await this.context.newPage();

    try {
      await page.goto('https://ipinfo.thordata.com', {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      const data: IPInfo = await page.evaluate(() => {
        return JSON.parse(document.body.innerText);
      });

      log.info({ msg: 'proxy connected', info: data });
    } finally {
      await page.close();
    }
  }

  async resetContext() {
    try {
      await this.context.clearCookies();
      await this.context.addCookies([createSessionCookie(), createOEPConfigCookie()]);
    } catch (err) {
      const error = err as Error;
      log.error({ method: 'reset context', request: this.targetUrl, error: error.message });
      this.emit('reset_context');
    }
  }

  setScanParameters(url: string, step: number, requestID: string, isBatchMode: boolean) {
    const scanParameters = extractScanParameters(url);
    this.targetUrl = url;
    this.cursor = scanParameters.cursor;
    this.listPage = scanParameters.listPage;
    this.pageSize = scanParameters.pageSize;

    this.step = step;
    this.requestID = requestID;
    this.isBatchMode = isBatchMode;
  }

  updateScanParameters() {
    this.targetUrl = replaceScanParameters(
      this.targetUrl,
      this.cursor,
      this.listPage,
      this.pageSize,
    );
  }

  async goto() {
    try {
      const page = await this.context.newPage();
      page.on('close', () => log.debug({ msg: 'page closed', request_id: this.requestID }));

      page
        .goto(this.targetUrl, {
          referer: DEFAULT_REFERER,
          waitUntil: 'domcontentloaded',
          timeout: 3000,
        })
        .then((res) => this.responseHandler(res))
        .catch((err) => {
          const error = err as Error;
          log.error({
            method: 'goto page',
            request: this.targetUrl,
            error: err,
            message: error.message,
            request_id: this.requestID,
          });

          if (this.retryCount < MAX_RETRIES) {
            this.retryCount++;
            this.emit('next_request');
          } else if (this.isBatchMode) {
            // TODO: update query parameters
            log.error({ msg: 'request reached max retries', url: this.targetUrl });
            this.retryCount = 0;
            this.emit('next_request');
          } else {
            this.requestError(err);
          }
        })
        .finally(() => {
          if (!page.isClosed()) {
            page.close().catch((err) => {
              const error = err as Error;
              log.error({
                method: 'close page',
                request: this.targetUrl,
                error: err,
                message: error.message,
                request_id: this.requestID,
              });
            });
          }
        });
    } catch (err) {
      const error = err as Error;
      log.error({
        method: 'goto',
        request: this.targetUrl,
        error: err,
        message: error.message,
        request_id: this.requestID,
      });
    }
  }

  private responseHandler(res: Response | null) {
    if (!res) return;

    if (res.request().resourceType() !== 'document') return;

    if (res.status() != 200 && res.status() != 407) {
      log.error({
        request: res.request().url(),
        response: res.status(),
        request_id: this.requestID,
      });

      this.requestError(res.statusText());
    }

    const headers = res.headers();

    if (!headers['content-type']?.includes('application/json')) return;

    res
      .json()
      .then(async (prod: PageResponse) => {
        if (prod.data.data.length > 0) {
          await this.database.save(this.requestID, prod.data.data);
          // .catch((err) => log.error({ msg: 'failed to persist response', error: err }));
        }

        if (prod.data.hasMore && this.isBatchMode) {
          this.cursor += this.pageSize * this.step;
          this.listPage += this.step;
          this.emit('next_request');
        } else {
          this.requestFinished();
        }

        log.debug({
          request: res.request().url(),
          items: prod.data.data.length,
          response: res.status(),
          responseTime: res.request().timing().responseEnd - res.request().timing().requestStart,
          request_id: this.requestID,
        });
      })
      .catch((err) => {
        const error = err as Error;
        log.error({
          method: 'parse response',
          request: this.targetUrl,
          message: error.message,
          request_id: this.requestID,
        });
      });
  }

  private requestFinished() {
    this.disableCrawler();
    const res: WorkerResponseMessage = {
      type: 'scan_finish',
      request_id: this.requestID,
      worker_name: process.env.WORKER_ID || '',
    };
    process.send?.(res);
  }

  private workerStarted() {
    const msg: WorkerResponseMessage = {
      type: 'worker_started',
      worker_name: process.env.WORKER_ID || '',
    };
    process.send?.(msg);
  }

  private requestError(msg: string) {
    const res: WorkerResponseMessage = {
      type: 'scan_error',
      request_id: this.requestID,
      worker_name: process.env.WORKER_ID || '',
      error: msg,
    };
    process.send?.(res);
  }

  enableCrawler() {
    this.retryCount = 0;
    this.isRunning = true;
  }

  disableCrawler() {
    this.isRunning = false;
  }

  isEnabled() {
    return this.isRunning;
  }

  async terminate() {
    try {
      await this.browser.close();
      await this.database.disconnect();
    } catch (err) {
      const error = err as Error;
      log.error({ msg: 'unexpected error terminating crawler', error: error.message });
    }
    process.exit(0);
  }
}

process.on('message', async (msg: WorkerRequestMessage) => {
  try {
    switch (msg.type) {
      case 'scan':
        const targetUrl = msg.url;
        const step = msg.step;
        const requestID = msg.request_id;
        const isBatchMode = msg.batch;

        crawler.enableCrawler();
        await crawler.resetContext();
        crawler.setScanParameters(targetUrl, step, requestID, isBatchMode);
        crawler.goto();
        break;
      case 'cancel':
        crawler.disableCrawler();
        await crawler.initContext();
        break;
    }
  } catch (err) {
    log.error({
      msg: 'unexpected error processing crawler message',
      received_msg: msg,
      error: err,
    });
  }
});

const crawler = new Crawler();

crawler.on('next_request', async () => {
  try {
    if (!crawler.isEnabled()) return;
    await crawler.resetContext();
    crawler.updateScanParameters();
    await delay(0, 500);
    crawler.goto();
  } catch (err) {
    log.error({ msg: 'unexpected error processing next request', error: err });
  }
});

crawler.on('reset_context', async () => {
  try {
    await crawler.initContext();
    crawler.emit('next_request');
  } catch (err) {
    log.error({ msg: 'unexpected error to reset context', error: err });
  }
});

process.on('uncaughtException', (err, origin) => {
  log.error({ 'Uncaught Exception': err });
  log.error({ 'Origin:': origin });
  process.exit(2);
});

process.on('SIGTERM', async () => {
  await crawler.terminate();
});

try {
  await crawler.init();
} catch (err) {
  log.error({ msg: 'unexpected error booting crawler', error: err });
}
