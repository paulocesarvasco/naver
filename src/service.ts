import { firefox, Browser, BrowserContext, Page } from 'playwright';
import { createOEPConfigCookie, createSessionCookie } from './helpers/cookies';
import { env } from './config/env';

const referer =
  'https://search.shopping.naver.com/ns/search?query=iphone&includedDeliveryFee=true&score=4.8%7C5';
const url =
  'https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?cursor=50&pageSize=50&query=iphone&searchMethod=all.basic&isFreshCategory=false&isOriginalQuerySearch=false&isCatalogDiversifyOff=false&listPage=1&categoryIdsForPromotions=50000204&categoryIdsForPromotions=50000205&hiddenNonProductCard=true&hasMoreAd=true&hasMore=true&score=4.8|';

export class BrowserSession {
  private browser!: Browser;
  private context!: BrowserContext;
  private page!: Page;

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
  ) {}

  async init() {
    this.browser = await firefox.launch({
      headless: this.options.headless ?? true,
      proxy: this.options.proxy,
    });

    this.context = await this.browser.newContext({
      locale: this.options.locale ?? 'ko-KR',
      userAgent: this.options.userAgent,
    });

    this.page = await this.context.newPage();
    this.attachListeners();
  }

  private attachListeners() {
    this.page.on('request', (req) => {
      if (req.resourceType() === 'document') {
        console.log('➡️ DOCUMENT REQUEST', req.url());
        console.log('Headers:', req.headers());
      }
    });

    this.page.on('response', async (res) => {
      if (res.request().resourceType() !== 'document') return;

      console.log('⬅️ DOCUMENT RESPONSE', res.status());

      const headers = res.headers();

      if (!headers['content-type']?.includes('application/json')) return;

      const prod = await res.json();
      console.log(prod.data.data[0].card.product);
    });
  }

  async setCookies() {
    await this.context.addCookies([createSessionCookie(), createOEPConfigCookie()]);
  }

  async goto(url: string, referer?: string) {
    await this.page.goto(url, {
      referer,
      waitUntil: 'domcontentloaded',
    });
  }

  async close() {
    await this.browser?.close();
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

await session.init();
await session.setCookies();
await session.goto(url, referer);
await session.close();
