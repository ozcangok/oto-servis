import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { loginSuperadmin } from '../services/authService.js';
import { listCompanies } from '../db/platform.js';

const superadminLoginSchema = z.object({
  username: z.string().min(1, 'Kullanıcı adı gereklidir.'),
  password: z.string().min(1, 'Parola gereklidir.')
});

export const platformRoutes: FastifyPluginAsync = async (fastify) => {
  // Süper admin girişi (tenant bağımsız)
  fastify.post('/login', {
    schema: {
      tags: ['Platform'],
      summary: 'Süper admin girişi'
    }
  }, async (request, reply) => {
    const parse = superadminLoginSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Kullanıcı adı ve parola gereklidir.'
      });
    }

    try {
      const { token, user } = await loginSuperadmin(parse.data.username, parse.data.password, request.ip);
      reply.setCookie('session_token', token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60
      });
      return { success: true, user, token };
    } catch (err: any) {
      return reply.status(401).send({ success: false, error: err.message });
    }
  });

  // Firma listesi (yalnızca süper admin)
  fastify.get('/companies', {
    schema: {
      tags: ['Platform'],
      summary: 'Kayıtlı firmaları listele (Yalnızca Süper Admin)'
    }
  }, async (request, reply) => {
    if (!request.user || (request.user as any).role !== 'superadmin') {
      return reply.status(403).send({ success: false, error: 'Bu işlem için süper admin yetkisi gereklidir.' });
    }
    return { success: true, companies: listCompanies() };
  });
};
