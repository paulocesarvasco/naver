import { firefox, Browser, BrowserContext, Page } from 'playwright';
import { createOEPConfigCookie, createSessionCookie } from './helpers/cookies.js';
import { env } from './config/env.js';
import { extractScanParameters, replaceScanParameters } from './helpers/url.js';
import EventEmitter from 'events';
import { RedisClient } from './database/client.js';
import { createLogger } from './log/logger.js';

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
      step: number;
      requestID: string;
    },
  ) {
    super();
    this.step = options.step;
    this.requestID = options.requestID;

    this.database = new RedisClient();
  }

  async init() {
    this.browser = await firefox.launch({
      headless: this.options.headless ?? true,
      proxy: this.options.proxy,
    });

    this.browser.on('disconnected', () => log.error('browser disconnected'));
    await this.initContext();
    await this.database.connect();
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

    this.context = await this.browser.newContext({
      locale: this.options.locale ?? 'ko-KR',
      userAgent: this.options.userAgent,
    });

    this.context.on('close', () => {
      log.info('context closed');
    });
  }

  private attachListeners(page: Page) {
    page.on('response', async (res) => {
      await res.finished();

      if (res.request().resourceType() !== 'document') return;

      if (res.status() != 200 && res.status() != 407) {
        log.error({ request: res.request().url(), response: res.status() });
        process.exit(1);
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

        this.emit('next_request');
      } else {
        log.info({ method: 'response', request: res.request().url(), body: prod });
        await this.close();
      }
    });
  }

  async setCookies() {
    try {
      await this.context.addCookies([createSessionCookie(), createOEPConfigCookie()]);
    } catch (err) {
      log.error({ method: 'set cookies', request: this.targetUrl, error: err });
      this.emit('reset_proxy');
    }
  }

  async clearCookies() {
    try {
      await this.context.clearCookies();
    } catch (err) {
      log.error({ method: 'clear cookies', request: this.targetUrl, error: err });
      this.emit('reset_proxy');
    }
  }

  setScanParameters(url: string) {
    const scanParameters = extractScanParameters(url);
    this.targetUrl = url;
    this.cursor = scanParameters.cursor;
    this.listPage = scanParameters.listPage;
    this.pageSize = scanParameters.pageSize;
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
    const page = await this.context.newPage();
    this.attachListeners(page);
    try {
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
        return;
      }

      await page.close();
    }
  }

  async close() {
    await this.context.close();
    await this.browser.close();
    await this.database.disconnect();
  }
}

const args = process.argv;
const targetUrl = args[2];
const step = Number(args[3]);
const id = args[4];

const session = new Crawler({
  headless: true,
  proxy: {
    server: env.PROXY_ADDRESS,
    username: env.PROXY_USER,
    password: env.PROXY_PASS,
  },
  step: step,
  requestID: id,
});

session.on('next_request', async () => {
  await session.clearCookies();
  await session.setCookies();
  session.updateScanParameters();
  await session.goto();
});

session.on('reset_proxy', async () => {
  await session.initContext();
  session.emit('next_request');
});

await session.init();
await session.setCookies();
session.setScanParameters(targetUrl);
await session.goto();
