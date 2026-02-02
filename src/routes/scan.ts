import service from '../service.js';
import requestQueue from '../helpers/queue.js';
import { type ResponsePayload } from '../types/types.js';
import { type FastifyPluginAsync } from 'fastify';
import { TimeoutError } from '../helpers/errors.js';
import { waitForEvent } from '../helpers/events.js';
import { env } from '../config/env.js';

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
        // for now timeouts are only detected when request is popped from queue
        const result = await requestQueue.push(async () => {
          const response = waitForEvent<ResponsePayload>(service, 'scan_finish', {
            filter: (payload) => payload.requestID === requestID,
            timeout: env.SERVER_TIMEOUT,
          });
          service.scanSinglePage(url, requestID);
          return await response;
        });

        return result.result;
      } catch (err) {
        if (err instanceof TimeoutError) {
          return reply.code(408).send({ error: 'timeout' });
        }
        request.log.error({ err, url }, 'scan failed');
        return reply.code(500).send({ error: 'internal_error' });
      }
    },
  });
};
