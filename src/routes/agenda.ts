import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { requireAuth } from '../middleware/auth';

export default async function agendaRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  // Get agenda for a specific date range
  fastify.get('/agenda', {
    preHandler: requireAuth,
    schema: {
      description: 'Get appointments for a specific date range',
      tags: ['Agenda'],
      querystring: {
        type: 'object',
        required: ['startDate', 'endDate'],
        properties: {
          startDate: {
            type: 'string',
            format: 'date',
            description: 'Start date (e.g., 2025-09-03)',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$'
          },
          endDate: {
            type: 'string',
            format: 'date',
            description: 'End date (e.g., 2025-09-04)',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$'
          },
          semFalta: {
            type: 'boolean',
            default: false,
            description: 'Whether to exclude no-shows'
          },
          status: {
            type: 'string',
            description: 'Filter by status (e.g., "Confirmado", "Agendado", "Falta")'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number', description: 'Appointment ID' },
                  data: { type: 'string', format: 'date', description: 'Appointment date (yyyy-MM-dd)' },
                  dataHora: { type: 'string', format: 'date-time', description: 'Full date and time in ISO 8601 format' },
                  horaInicio: { type: 'string', description: 'Start time (HH:mm)' },
                  horaFim: { type: 'string', description: 'End time (HH:mm)' },
                  nomePessoa: { type: 'string', description: 'Patient name' },
                  telefone: { type: ['string', 'null'], description: 'Phone number (digits only)' },
                  celular: { type: 'string', description: 'Mobile number (digits only)' },
                  servicos: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of services'
                  },
                  status: { type: 'string', description: 'Appointment status' }
                }
              }
            },
            count: { type: 'number', description: 'Total number of appointments' }
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
    const { startDate, endDate, semFalta = false, status } = request.query as {
      startDate: string;
      endDate: string;
      semFalta?: boolean;
      status?: string;
    };

    try {
      // Myclinic API usa formato YYYY-MM-DD diretamente (não ISO)
      const agenda = await fastify.myclinicClient.getAgenda(startDate, endDate, semFalta, status);

      reply.send({
        success: true,
        data: agenda,
        count: agenda.length
      });
    } catch (error: any) {
      fastify.log.error('Agenda fetch error:', error);
      reply.status(500).send({
        error: 'Failed to fetch agenda',
        message: error.message || 'Internal server error'
      });
    }
  });

  // Get agenda for a specific date (convenience endpoint)
  fastify.get('/agenda/date/:date', {
    preHandler: requireAuth,
    schema: {
      description: 'Get appointments for a specific date',
      tags: ['Agenda'],
      params: {
        type: 'object',
        required: ['date'],
        properties: {
          date: { 
            type: 'string', 
            format: 'date',
            description: 'Date in YYYY-MM-DD format'
          }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          semFalta: { 
            type: 'boolean', 
            default: false,
            description: 'Whether to exclude no-shows'
          },
          status: {
            type: 'string',
            description: 'Filter by status (e.g., "Confirmado", "Agendado", "Falta")'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            date: { type: 'string', format: 'date', description: 'Query date' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number', description: 'Appointment ID' },
                  data: { type: 'string', format: 'date', description: 'Appointment date (yyyy-MM-dd)' },
                  dataHora: { type: 'string', format: 'date-time', description: 'Full date and time in ISO 8601 format' },
                  horaInicio: { type: 'string', description: 'Start time (HH:mm)' },
                  horaFim: { type: 'string', description: 'End time (HH:mm)' },
                  nomePessoa: { type: 'string', description: 'Patient name' },
                  telefone: { type: ['string', 'null'], description: 'Phone number (digits only)' },
                  celular: { type: 'string', description: 'Mobile number (digits only)' },
                  servicos: { type: 'array', items: { type: 'string' }, description: 'List of services' },
                  status: { type: 'string', description: 'Appointment status' }
                }
              }
            },
            count: { type: 'number', description: 'Total number of appointments' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { date } = request.params as { date: string };
    const { semFalta = false, status } = request.query as { semFalta?: boolean; status?: string };

    try {
      // Myclinic API usa apenas a data de início, não precisa calcular próximo dia
      const agenda = await fastify.myclinicClient.getAgenda(date, date, semFalta, status);

      reply.send({
        success: true,
        date,
        data: agenda,
        count: agenda.length
      });
    } catch (error: any) {
      fastify.log.error('Agenda fetch error:', error);
      reply.status(500).send({
        error: 'Failed to fetch agenda',
        message: error.message || 'Internal server error'
      });
    }
  });
}