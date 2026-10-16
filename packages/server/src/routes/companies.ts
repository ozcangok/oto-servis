import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { registerCompany, verifyCompanyEmail, resendVerificationCode } from '../services/companyService.js';

const registerSchema = z.object({
  company_ad: z.string().min(2, 'Firma adı en az 2 karakter olmalıdır.'),
  eposta: z.string().email('Geçerli bir e-posta adresi girin.'),
  telefon: z.string().min(10, 'Geçerli bir telefon numarası girin.').optional().nullable(),
  adres: z.string().optional().nullable(),
  admin_ad: z.string().min(2, 'Yetkili ad soyadı en az 2 karakter olmalıdır.'),
  admin_password: z.string().min(6, 'Parola en az 6 karakter olmalıdır.')
});

const verifySchema = z.object({
  eposta: z.string().email('Geçerli bir e-posta adresi girin.'),
  kod: z.string().regex(/^\d{6}$/, 'Doğrulama kodu 6 haneli olmalıdır.')
});

const resendSchema = z.object({
  eposta: z.string().email('Geçerli bir e-posta adresi girin.')
});

export const companyRoutes: FastifyPluginAsync = async (fastify) => {
  // Herkese açık firma kaydı: şirket + kiracı DB + yönetici + otomatik giriş
  fastify.post('/register', {
    schema: {
      tags: ['Firmalar'],
      summary: 'Yeni firma kaydı (herkese açık)'
    }
  }, async (request, reply) => {
    const parse = registerSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz kayıt bilgisi.'
      });
    }

    try {
      const result = await registerCompany(parse.data);
      return {
        success: true,
        pending: true,
        message: result.mailSent
          ? 'Doğrulama kodu e-postanıza gönderildi. Kodu girerek kaydınızı tamamlayın.'
          : 'Doğrulama kodu oluşturuldu. (E-posta servisi yapılandırılmadığı için kod sunucu konsoluna yazıldı.)',
        email: result.email,
        company: result.company,
        mailSent: result.mailSent,
        devMode: result.devMode
      };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // E-posta doğrulama kodu kontrolü
  fastify.post('/verify', {
    schema: {
      tags: ['Firmalar'],
      summary: 'E-posta doğrulama kodunu onayla'
    }
  }, async (request, reply) => {
    const parse = verifySchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz doğrulama bilgisi.'
      });
    }

    try {
      const result = await verifyCompanyEmail(parse.data);
      reply.setCookie('session_token', result.token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60
      });
      return {
        success: true,
        message: 'E-postanız doğrulandı. 14 günlük deneme süreniz başladı.',
        user: result.user,
        company: result.company,
        token: result.token
      };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Doğrulama kodunu yeniden gönder
  fastify.post('/resend-code', {
    schema: {
      tags: ['Firmalar'],
      summary: 'Doğrulama kodunu yeniden gönder'
    }
  }, async (request, reply) => {
    const parse = resendSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçerli bir e-posta girin.'
      });
    }

    try {
      const result = await resendVerificationCode(parse.data.eposta);
      return {
        success: true,
        message: result.mailSent
          ? 'Yeni doğrulama kodu e-postanıza gönderildi.'
          : 'Yeni kod oluşturuldu.',
        mailSent: result.mailSent,
        devMode: result.devMode
      };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });
};
