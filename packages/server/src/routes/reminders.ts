import type { FastifyPluginAsync } from 'fastify';
import { getDueReminders } from '../services/reminderService.js';
import {
  listStatusNotifications,
  markStatusNotificationSent
} from '../services/whatsappService.js';

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

  // İletişim merkezi: servis durumu değişimlerinde oluşan WhatsApp gönderim kayıtları
  fastify.get('/messages', {
    schema: {
      tags: ['Hatırlatıcılar'],
      summary: 'Servis durumu WhatsApp gönderim kayıtlarını listele (İletişim Merkezi)'
    }
  }, async (request) => {
    const limit = parseInt((request.query as any)?.limit || '50', 10);
    const items = listStatusNotifications(limit);
    return { success: true, count: items.length, items };
  });

  // Bir gönderim kaydını "gönderildi" olarak işaretle
  fastify.post('/messages/:id/sent', {
    schema: {
      tags: ['Hatırlatıcılar'],
      summary: 'WhatsApp gönderim kaydını gönderildi olarak işaretle'
    }
  }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const updated = markStatusNotificationSent(id);
    if (!updated) {
      return reply.status(404).send({ success: false, error: 'Gönderim kaydı bulunamadı.' });
    }
    return { success: true, message: 'Gönderildi olarak işaretlendi.', item: updated };
  });
};
