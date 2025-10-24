import { FastifyInstance, FastifyPluginOptions } from 'fastify';

export default async function authRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  // Login endpoint
  fastify.post('/auth/login', {
    schema: {
      description: 'Authenticate with Myclinic system',
      tags: ['Authentication'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', description: 'User email/username' },
          password: { type: 'string', description: 'User password' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            authenticated: { type: 'boolean' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    try {
      const success = await fastify.myclinicClient.login(email, password);

      if (!success) {
        reply.status(401).send({
          error: 'Authentication failed',
          message: 'Invalid credentials or authentication error'
        });
        return;
      }

      reply.send({
        success: true,
        message: 'Login successful',
        authenticated: true
      });
    } catch (error: any) {
      fastify.log.error('Login error:', error);
      reply.status(401).send({
        error: 'Authentication failed',
        message: error.message || 'Invalid credentials'
      });
    }
  });

  // Session status endpoint
  fastify.get('/auth/status', {
    schema: {
      description: 'Check authentication status',
      tags: ['Authentication'],
      response: {
        200: {
          type: 'object',
          properties: {
            authenticated: { type: 'boolean' },
            sessionCookie: { type: ['string', 'null'] }
          }
        }
      }
    }
  }, async (request, reply) => {
    const isAuthenticated = fastify.myclinicClient.isAuthenticated();
    const sessionCookie = fastify.myclinicClient.getSessionCookie();

    reply.send({
      authenticated: isAuthenticated,
      sessionCookie: isAuthenticated ? sessionCookie : null
    });
  });
}