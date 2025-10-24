import 'dotenv/config';
import Fastify from 'fastify';
import { MyclinicClient } from './services/myclinic-client';

const fastify = Fastify({
  logger: true
});

// Register plugins
fastify.register(import('@fastify/swagger'), {
  swagger: {
    info: {
      title: 'Myclinic API Wrapper',
      description: 'HTTP wrapper for Myclinic system API',
      version: '1.0.0'
    },
    host: 'localhost:3000',
    schemes: ['http'],
    consumes: ['application/json'],
    produces: ['application/json'],
    tags: [
      { name: 'Authentication', description: 'Authentication endpoints' },
      { name: 'Agenda', description: 'Agenda and appointment endpoints' },
      { name: 'Relatorios', description: 'Reports and analytics endpoints' }
    ]
  }
});

fastify.register(import('@fastify/swagger-ui'), {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'full',
    deepLinking: false
  }
});

// Initialize Myclinic client
const myclinicClient = new MyclinicClient(
  process.env.MYCLINIC_SUBDOMAIN || 'myclinic',
  process.env.MYCLINIC_BASE_URL || 'https://myclinic.bemp.app',
  process.env.MYCLINIC_SALON_ID || '436'
);
fastify.decorate('myclinicClient', myclinicClient);

// Register routes
fastify.register(import('./routes/auth'), { prefix: '/api' });
fastify.register(import('./routes/agenda'), { prefix: '/api' });
fastify.register(import('./routes/relatorios'), { prefix: '/api' });

// Health check endpoint
fastify.get('/', {
  schema: {
    description: 'Health check endpoint',
    response: {
      200: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          service: { type: 'string' },
          timestamp: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  return {
    status: 'healthy',
    service: 'Myclinic API Wrapper',
    timestamp: new Date().toISOString()
  };
});

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  reply.status(500).send({
    error: 'Internal Server Error',
    message: error.message
  });
});

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000');
    await fastify.listen({ port, host: '0.0.0.0' });

    fastify.log.info(`Server running at http://localhost:${port}`);
    fastify.log.info(`API documentation available at http://localhost:${port}/docs`);

    // Auto-login if credentials are provided
    if (process.env.MYCLINIC_EMAIL && process.env.MYCLINIC_PASSWORD) {
      try {
        const success = await myclinicClient.login(
          process.env.MYCLINIC_EMAIL,
          process.env.MYCLINIC_PASSWORD
        );
        if (success) {
          fastify.log.info('Auto-login successful');
        } else {
          fastify.log.warn('Auto-login failed: Invalid credentials');
        }
      } catch (error: any) {
        fastify.log.warn('Auto-login failed:', error.message || error);
      }
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();