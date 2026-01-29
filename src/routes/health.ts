import type { FastifyPluginAsync } from 'fastify';
import { extractData } from '../service.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    return { ok: true };
  });
};

export const scan: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    extractData(
      'https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?cursor=1&pageSize=50&query=iphone&listPage=1',
      '11d9ac64-8868-4583-971f-944b9247436a',
    );
  });
};
