import type { FastifyPluginAsync } from 'fastify';
import { exportCustomerKvkkData, anonymizeCustomer } from '../services/kvkkService.js';

export const kvkkRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.user || request.user.role !== 'owner') {
      return reply.status(403).send({ success: false, error: 'KVKK işlemleri yalnızca dükkan sahibi tarafından yapılabilir.' });
    }
  });

  // Export customer data for KVKK request
  fastify.get('/export/:customerId', {
    schema: {
      tags: ['KVKK'],
      summary: 'KVKK kapsamında müşteri verilerini JSON olarak dışa aktar'
    }
  }, async (request, reply) => {
    const customerId = Number((request.params as any).customerId);
    try {
      const data = await exportCustomerKvkkData(customerId);
      return { success: true, data };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Anonymize / delete customer for KVKK right to be forgotten
  fastify.post('/anonymize/:customerId', {
    schema: {
      tags: ['KVKK'],
      summary: 'KVKK kapsamında müşteri kişisel verilerini anonimleştir/sil'
    }
  }, async (request, reply) => {
    const customerId = Number((request.params as any).customerId);
    try {
      const result = await anonymizeCustomer(customerId, request.user!);
      return {
        success: true,
        message: 'Müşteri kişisel verileri başarıyla anonimleştirildi.',
        customer: result
      };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });
};
