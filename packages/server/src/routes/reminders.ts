import type { FastifyPluginAsync } from 'fastify';
import { getDueReminders } from '../services/reminderService.js';

export const reminderRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Oturum açmanız gerekmektedir.' });
    }
  });

  // Get active due reminders & counter
  fastify.get('/due', {
    schema: {
      tags: ['Hatırlatıcılar'],
      summary: 'Yaklaşan muayene, bakım ve teslime hazır araç hatırlatıcıları'
    }
  }, async () => {
    const reminders = await getDueReminders();
    return {
      success: true,
      count: reminders.length,
      items: reminders
    };
  });
};
