import { MyclinicClient } from '../services/myclinic-client';

declare module 'fastify' {
  interface FastifyInstance {
    myclinicClient: MyclinicClient;
  }
}
