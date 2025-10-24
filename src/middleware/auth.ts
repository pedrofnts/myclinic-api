import { FastifyRequest, FastifyReply } from 'fastify';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const client = request.server.myclinicClient;

  if (!client.isAuthenticated()) {
    reply.status(401).send({
      error: 'Unauthorized',
      message: 'Valid authentication session required'
    });
    return;
  }
}