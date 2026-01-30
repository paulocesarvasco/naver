import type { FastifyPluginAsync } from 'fastify';
import service from '../service.js';
import { waitForEvent } from '../helpers/events.js';

export const scan: FastifyPluginAsync = async (app) => {
  app.route({
    method: 'GET',
    url: '/scan',
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
    handler: async (request, reply) => {
      const { url } = request.query as { url: string };
      try {
        service.scanAllPages(url, crypto.randomUUID());

        const results = await waitForEvent<any>(service, 'scan_finish');
        return results;
      } catch (err) {
        request.log.error({ err, url }, 'scan failed');
        return reply.code(500).send({ error: 'scan_failed' });
      }
    },
  });
};

export const nave: FastifyPluginAsync = async (app) => {
  app.route({
    method: 'GET',
    url: '/nave',
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
          items: { type: 'object', additionalProperties: true },
        },
      },
    },
    preHandler: async (request, reply) => {
      if (!service.isAvailable()) {
        return reply.code(422).send({ error: 'too_many_requests' });
      }
    },
    handler: async (request, reply) => {
      const { url } = request.query as { url: string };

      try {
        service.scanSinglePage(url, crypto.randomUUID());

        const results = await waitForEvent<any>(service, 'scan_finish');
        return results;
      } catch (err) {
        request.log.error({ err, url }, 'scan failed');
        return reply.code(500).send({ error: 'scan_failed' });
      }
    },
  });
};
