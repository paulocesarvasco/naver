import type { FastifyRequest, FastifyReply } from 'fastify';

export async function requestHeaders(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  req.log.info(
    {
      headers: req.headers,
    },
    'incoming request headers',
  );
}
