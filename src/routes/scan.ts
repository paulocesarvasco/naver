import type { FastifyPluginAsync } from 'fastify';
import service from '../service.js';
import { waitForEvent } from '../helpers/events.js';

export const scan: FastifyPluginAsync = async (app) => {
  app.get(
    '/scan',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            url: { type: 'string' },
          },
          required: ['url'],
          additionalProperties: false,
        },
        response: {
          200: {
            type: 'array',
            additionalProperties: true,
          },
        },
      },
    },
    async (request, reply) => {
      const { url } = request.query as { url: string };

      try {
        service.extractData(url, crypto.randomUUID());

        const results = await waitForEvent<any>(service, 'finish_scan');
        return results;
      } catch (err) {
        request.log.error({ err, url }, 'scan failed');
        return reply.code(500).send({ error: 'scan_failed' });
      }
    },
  );
};
