import type { FastifyPluginAsync } from 'fastify';
import { getCashDeskSummary, generateCashDeskCsv } from '../services/cashDeskService.js';
import { withCashDeskAliases } from '../services/responseCompat.js';

export const cashDeskRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Oturum açmanız gerekmektedir.' });
    }
    if (request.user.role === 'mechanic') {
      return reply.status(403).send({ success: false, error: 'Usta rolü kasa raporlarına erişemez.' });
    }
  });

  // Get cash desk summary for date range
  fastify.get('/summary', {
    schema: {
      tags: ['Kasa'],
      summary: 'Gün sonu ve tarih aralıklı kasa raporu'
    }
  }, async (request) => {
    let startDate = (request.query as any)?.startDate;
    let endDate = (request.query as any)?.endDate;
    // Arayüz tek günlük `date` parametresi gönderir (YYYY-MM-DD)
    const singleDate = (request.query as any)?.date;
    if (singleDate && !startDate && !endDate) {
      const day = new Date(`${singleDate}T00:00:00`);
      if (!isNaN(day.getTime())) {
        const end = new Date(day);
        end.setHours(23, 59, 59, 999);
        startDate = day.toISOString();
        endDate = end.toISOString();
      }
    }
    const summary = await getCashDeskSummary(startDate, endDate);
    return { success: true, summary: withCashDeskAliases(summary) };
  });

  // Export cash desk summary to CSV (UTF-8 with BOM for Excel)
  fastify.get('/export-csv', {
    schema: {
      tags: ['Kasa'],
      summary: 'Kasa raporunu Excel uyumlu CSV olarak indir'
    }
  }, async (request, reply) => {
    const startDate = (request.query as any)?.startDate;
    const endDate = (request.query as any)?.endDate;
    const summary = await getCashDeskSummary(startDate, endDate);
    const csvData = generateCashDeskCsv(summary);

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="kasa-raporu.csv"');
    return reply.send(csvData);
  });
};
