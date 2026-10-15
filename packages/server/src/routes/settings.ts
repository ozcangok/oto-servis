import type { FastifyPluginAsync } from 'fastify';
import os from 'os';
import QRCode from 'qrcode';
import { getSettings, updateSettings } from '../services/settingsService.js';
import { getDb, auditLog } from '../db/index.js';
import { desc } from 'drizzle-orm';

function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Oturum açmanız gerekmektedir.' });
    }
  });

  // Get application settings
  fastify.get('/', {
    schema: {
      tags: ['Ayarlar'],
      summary: 'Uygulama genel ayarlarını getir'
    }
  }, async () => {
    const settings = await getSettings();
    return { success: true, settings };
  });

  // Update application settings (Admin only)
  fastify.put('/', {
    schema: {
      tags: ['Ayarlar'],
      summary: 'Uygulama ayarlarını güncelle (Yalnızca Yönetici)'
    }
  }, async (request, reply) => {
    if (request.user!.role !== 'admin') {
      return reply.status(403).send({ success: false, error: 'Yalnızca yönetici ayarları değiştirebilir.' });
    }
    const updated = await updateSettings(request.body as any);
    return { success: true, settings: updated };
  });

  // LAN sharing info and QR code
  fastify.get('/lan-info', {
    schema: {
      tags: ['Ayarlar'],
      summary: 'Aynı Wi-Fi ağındaki telefonlar için yerel IP ve QR Kod'
    }
  }, async () => {
    const localIp = getLocalIpAddress();
    const port = process.env.CLIENT_PORT || '5173';
    const mobileUrl = `http://${localIp}:${port}`;

    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(mobileUrl, {
        margin: 2,
        width: 256,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
    } catch (err) {
      console.error('QR code generation error:', err);
    }

    return {
      success: true,
      localIp,
      port,
      mobileUrl,
      qrDataUrl
    };
  });

  // View audit log (Admin only)
  fastify.get('/audit-logs', {
    schema: {
      tags: ['Ayarlar'],
      summary: 'Denetim izi / Audit log kayıtlarını listele (Yalnızca Yönetici)'
    }
  }, async (request, reply) => {
    if (request.user!.role !== 'admin') {
      return reply.status(403).send({ success: false, error: 'Yalnızca yönetici denetim kayıtlarını görebilir.' });
    }

    const db = getDb();
    const limit = Math.min(100, Math.max(1, parseInt((request.query as any)?.limit || '50', 10)));
    const logs = db.select().from(auditLog).orderBy(desc(auditLog.created_at)).limit(limit).all();

    return { success: true, logs };
  });
};
