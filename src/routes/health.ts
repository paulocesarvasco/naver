import type { FastifyPluginAsync } from 'fastify';
// import service from '../service.js';
// import { waitForEvent } from '../helpers/events.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', () => {
    return { ok: true };
  });
};

// export const scan: FastifyPluginAsync = async (app) => {
//   app.get('/', async () => {
//     service.extractData(
//       'https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?cursor=1&pageSize=50&query=iphone&listPage=1',
//       '11d9ac64-8868-4583-971f-944b9247436a',
//     );
//     const results = await waitForEvent<any>(service, 'finish_scan');
//     return results;
//   });
// };
