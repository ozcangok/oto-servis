import type { FastifyPluginAsync } from 'fastify';
import { getDueReminders } from '../services/reminderService.js';
import {
  listStatusNotifications,
  markStatusNotificationSent,
  markReminderResolved,
  getResolvedReminderIds
} from '../services/whatsappService.js';

export const reminderRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Oturum açmanız gerekmektedir.' });
    }
  });

  // Get active due reminders & counter (çözümlenmişler hariç)
  fastify.get('/due', {
    schema: {
      tags: ['Hatırlatıcılar'],
      summary: 'Yaklaşan muayene, bakım ve teslime hazır araç hatırlatıcıları'
    }
  }, async (request) => {
    let reminders = await getDueReminders();
    // Çözümlenmiş hatırlatıcıları filtrele
    const resolvedIds = new Set(getResolvedReminderIds());
    reminders = reminders.filter((r) => !resolvedIds.has(r.id));
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

  // Bir müşteri hatırlatıcısını çözümlendi (resolved) olarak işaretle
  fastify.post('/:id/resolve', {
    schema: {
      tags: ['Hatırlatıcılar'],
      summary: 'Müşteri hatırlatıcısını çözümlendi olarak işaretle'
    }
  }, async (request, reply) => {
    const reminderId = (request.params as any).id as string;
    if (!reminderId) {
      return reply.status(400).send({ success: false, error: 'Hatırlatıcı kimliği gereklidir.' });
    }
    const updated = markReminderResolved(reminderId, request.user!.id);
    if (!updated) {
      return reply.status(500).send({ success: false, error: 'Hatırlatıcı çözümlenemedi.' });
    }
    return { success: true, message: 'Hatırlatıcı çözümlendi.', item: updated };
  });
};
