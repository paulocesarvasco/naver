import { firefox, Browser, BrowserContext, Page } from 'playwright';
import { createOEPConfigCookie, createSessionCookie } from './helpers/cookies';
import { env } from './config/env';
import { extractScanParameters, replaceScanParameters } from './helpers/url';
import EventEmitter from 'events';

const referer =
  'https://search.shopping.naver.com/ns/search?query=iphone&includedDeliveryFee=true&score=4.8%7C5';

export function delay(ms: number, jitterMs: number = 0): Promise<void> {
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;

  return new Promise((resolve) => setTimeout(resolve, ms + jitter));
}

export class BrowserSession extends EventEmitter {
  private browser!: Browser;
  private context!: BrowserContext;
  private cursor!: number;
  private listPage!: number;
  private pageSize!: number;
  private targetUrl!: string;

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
  }

  async init() {
    this.browser = await firefox.launch({
      headless: this.options.headless ?? true,
      proxy: this.options.proxy,
    });

    this.context = await this.browser.newContext({
      locale: this.options.locale ?? 'ko-KR',
      userAgent: this.options.userAgent,
    });
  }

  private attachListeners(page: Page) {
    page.on('request', (req) => {
      if (req.resourceType() === 'document') {
        console.log('DOCUMENT REQUEST: ', req.url());
        // console.log('Headers:', req.headers());
      }
    });

    page.on('response', async (res) => {
      if (res.request().resourceType() !== 'document') return;

      console.log('DOCUMENT RESPONSE: ', res.status());

      if (res.status() != 200 && res.status() != 407) {
        process.exit(1);
      }

      const headers = res.headers();

      if (!headers['content-type']?.includes('application/json')) return;

      const prod = await res.json();
      if (prod.data.hasMore) {
        this.cursor += this.pageSize;
        if (this.cursor >= this.pageSize * this.listPage * 2) {
          this.listPage++;
        }
        await res.finished();
        this.emit('next_request');
      } else {
        await this.close();
      }
    });
  }

  async setCookies() {
    await this.context.addCookies([createSessionCookie(), createOEPConfigCookie()]);
  }

  async clearCookies() {
    await this.context.clearCookies();
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

  async goto(referer?: string) {
    try {
      const page = await this.context.newPage();
      this.attachListeners(page);
      await page.goto(this.targetUrl, {
        referer,
        waitUntil: 'domcontentloaded',
      });
      await page.close();
    } catch (err) {
      console.log(err);
      this.emit('reset_proxy');
    }
  }

  async close() {
    await this.context.close();
    await this.browser.close();
  }
}

const session = new BrowserSession({
  headless: true,
  proxy: {
    server: env.PROXY_ADDRESS,
    username: env.PROXY_USER,
    password: env.PROXY_PASS,
  },
});

session.on('next_request', async () => {
  // await delay(100, 2000);
  await session.clearCookies();
  await session.setCookies();
  session.updateScanParameters();
  await session.goto(referer);
});

session.on('reset_proxy', () => {
  session.init();
  session.emit('next_request');
});

await session.init();
await session.setCookies();
session.setScanParameters(
  'https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?cursor=1&pageSize=50&query=iphone&listPage=1',
);
await session.goto(referer);
