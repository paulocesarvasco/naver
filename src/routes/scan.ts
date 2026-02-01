import type { FastifyPluginAsync } from 'fastify';
import service from '../service.js';
import { waitForEvent } from '../helpers/events.js';
import requestQueue from '../helpers/queue.js';
import { type ResponsePayload } from '../helpers/types.js';

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
        const requestID = crypto.randomUUID();

        request.raw.on('close', () => {
          if (request.raw.aborted) {
            request.log.warn('connection aborted');
            service.cancelRequest(requestID);
          }
        });

        const response = waitForEvent<ResponsePayload>(service, 'scan_finish', {
          filter: (payload) => payload.requestID === requestID,
        });

        service.scanAllPages(url, requestID);
        return (await response).result;
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
    // preHandler: async (request, reply) => {
    //   if (!service.isAvailable()) {
    //     return reply.code(422).send({ error: 'too_many_requests' });
    //   }
    // },
    handler: async (request, reply) => {
      const { url } = request.query as { url: string };

      const requestID = crypto.randomUUID();

      request.raw.on('close', () => {
        if (request.raw.aborted) {
          request.log.warn('connection aborted');
          service.cancelRequest(requestID);
        }
      });

      try {
        const result = await requestQueue.push(async () => {
          const response = waitForEvent<ResponsePayload>(service, 'scan_finish', {
            filter: (payload) => payload.requestID === requestID,
          });
          service.scanSinglePage(url, requestID);
          return await response;
        });

        return result.result;
      } catch (err) {
        request.log.error({ err, url }, 'scan failed');
        return reply.code(500).send({ error: 'scan_failed' });
      }
    },
  });
};
