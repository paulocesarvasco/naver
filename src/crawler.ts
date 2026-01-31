import { firefox, Browser, BrowserContext, Page } from 'playwright';
import { createOEPConfigCookie, createSessionCookie } from './helpers/cookies.js';
import { env } from './config/env.js';
import { extractScanParameters, replaceScanParameters } from './helpers/url.js';
import EventEmitter from 'events';
import { RedisClient } from './database/client.js';
import { createLogger } from './log/logger.js';
import { WorkerRequestMessage, WorkerResponseMessage } from './helpers/workers.js';

const log = createLogger();
log.info('worker started');

const referer =
  'https://search.shopping.naver.com/ns/search?query=iphone&includedDeliveryFee=true&score=4.8%7C5';

export function delay(ms: number, jitterMs: number = 0): Promise<void> {
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;

  return new Promise((resolve) => setTimeout(resolve, ms + jitter));
}

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
  private hasActiveContext!: boolean;

  constructor(
    private readonly options: {
      proxy?: {
        server: string;
        username?: string;
        password?: string;
      };
      locale?: string;
      userAgent?: string;
      headless?: boolean;
    },
  ) {
    super();
    this.database = new RedisClient();
  }

  async init() {
    try {
      this.browser = await firefox.launch({
        headless: this.options.headless ?? true,
        proxy: this.options.proxy,
        env: {
          ...process.env,
          MOZ_REMOTE_SETTINGS_DEVTOOLS: '1',
        },
      });

      this.browser.on('disconnected', () => log.info('browser disconnected'));
      while (!this.browser.isConnected()) {}
      await this.initContext();
      await this.database.connect();
    } catch (err) {
      log.error({ msg: 'crawler init failed', error: err });
    }
  }

  async initContext() {
    if (!this.browser.isConnected()) {
      throw new Error('browser is not connected');
    }

    if (this.context) {
      try {
        await this.context.close();
      } catch (err) {
        log.warn({ err }, 'failed to close previous context');
      }
    }

    try {
      this.context = await this.browser.newContext({
        locale: this.options.locale ?? 'ko-KR',
        userAgent: this.options.userAgent,
      });

      this.context.on('close', () => {
        log.info('context closed');
        this.hasActiveContext = false;
      });

      this.hasActiveContext = true;
    } catch (err) {
      log.error({ msg: 'failed to close previous context', error: err });
    }
  }

  private attachListeners(page: Page) {
    page.on('close', () => log.info('page close'));

    page.on('pageerror', (err) => {
      log.error(`Page Error: ${err.message}`);
    });

    page.on('response', async (res) => {
      try {
        await res.finished();

        if (res.request().resourceType() !== 'document') return;

        if (res.status() != 200 && res.status() != 407) {
          log.error({ request: res.request().url(), response: res.status() });
          process.exit(1); //TODO: improve handling detection
        }

        const headers = res.headers();

        if (!headers['content-type']?.includes('application/json')) return;

        const prod = await res.json();
        if (prod.data.hasMore) {
          this.cursor += this.pageSize * this.step;
          this.listPage += this.step;

          await this.database.save(this.requestID, prod.data.data);

          log.debug({
            request: res.request().url(),
            response: res.status(),
            responseTime: res.request().timing().responseEnd - res.request().timing().requestStart,
          });

          this.isBatchMode ? this.emit('next_request') : await this.requestFinished();
        } else {
          this.requestFinished();
          log.debug({ method: 'response', request: res.request().url(), body: prod });
        }
      } catch (err) {
        log.error({ msg: 'unexpected error handling page response', error: err });
      }
    });
  }

  async setCookies() {
    try {
      await this.context.addCookies([createSessionCookie(), createOEPConfigCookie()]);
    } catch (err) {
      log.error({ method: 'set cookies', request: this.targetUrl, error: err });
      this.emit('reset_context');
    }
  }

  async clearCookies() {
    try {
      await this.context.clearCookies();
    } catch (err) {
      log.error({ method: 'clear cookies', request: this.targetUrl, error: err });
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
    if (!this.hasActiveContext) {
      log.warn({ method: 'goto', request: this.targetUrl, message: 'context not active' });
      return;
    }
    try {
      const page = await this.context.newPage();
      this.attachListeners(page);
      await page.goto(this.targetUrl, {
        referer,
        waitUntil: 'domcontentloaded',
      });
      await page.close();
    } catch (err) {
      const error = err as Error;
      log.error({ method: 'goto', request: this.targetUrl, error: err, message: error.message });

      const isClosed = /Target page, context or browser has been closed/.test(error.message);
      if (!isClosed) {
        this.emit('next_request');
      }
    }
  }

  private requestFinished() {
    const res: WorkerResponseMessage = {
      type: 'scan_finish',
      request_id: this.requestID,
      worker_name: process.env.WORKER_ID || '',
    };
    process.send?.(res);
  }

  async terminate() {
    try {
      await this.browser.close();
      await delay(200);
      await this.database.disconnect();
    } catch (err) {
      const error = err as Error;
      log.error({ msg: 'unexpected error terminating crawler', error: error.message });
    }
  }
}

process.on('message', async (msg: WorkerRequestMessage) => {
  switch (msg.type) {
    case 'scan':
      const targetUrl = msg.url;
      const step = msg.step;
      const requestID = msg.request_id;
      const isBatchMode = msg.batch;

      try {
        // await crawler.initContext();
        await crawler.setCookies();
        crawler.setScanParameters(targetUrl, step, requestID, isBatchMode);
        await crawler.goto();
      } catch (err) {
        log.error({ msg: 'unexpected error starting scan', error: err });
      }
  }
});

const crawler = new Crawler({
  headless: true,
  proxy: {
    server: env.PROXY_ADDRESS,
    username: env.PROXY_USER,
    password: env.PROXY_PASS,
  },
});

crawler.on('next_request', async () => {
  try {
    await crawler.clearCookies();
    await crawler.setCookies();
    crawler.updateScanParameters();
    await crawler.goto();
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
  process.exit(10);
});

process.on('SIGTERM', async () => {
  await crawler.terminate();
  process.exit(0);
});

try {
  crawler.init();
} catch (err) {
  log.error({ msg: 'unexpected error booting crawler', error: err });
}
