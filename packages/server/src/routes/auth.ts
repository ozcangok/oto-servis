import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  isSetupNeeded,
  setupInitialAdmin,
  loginUser,
  logoutUser,
  createUser,
  deleteUser,
  resetUserPassword,
  listUsers
} from '../services/authService.js';
import type { UserRole } from '@oto-servis/shared';

const loginSchema = z.object({
  username: z.string().min(1, 'Kullanıcı adı gereklidir.'),
  password: z.string().min(1, 'Parola gereklidir.')
});

const setupSchema = z.object({
  username: z.string().min(3, 'Kullanıcı adı en az 3 karakter olmalıdır.'),
  password: z.string().min(6, 'Parola en az 6 karakter olmalıdır.'),
  full_name: z.string().min(2, 'Ad soyad en az 2 karakter olmalıdır.')
});

const createUserSchema = z.object({
  username: z.string().min(3, 'Kullanıcı adı en az 3 karakter olmalıdır.'),
  password: z.string().min(6, 'Parola en az 6 karakter olmalıdır.'),
  full_name: z.string().min(2, 'Ad soyad gereklidir.'),
  role: z.enum(['owner', 'staff'])
});

const resetPasswordSchema = z.object({
  new_password: z.string().min(6, 'Yeni parola en az 6 karakter olmalıdır.')
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Check if initial admin setup is required
  fastify.get('/setup-status', {
    schema: {
      tags: ['Kimlik Doğrulama'],
      summary: 'İlk kurulum sihirbazı durumu',
      response: {
        200: {
          type: 'object',
          properties: {
            needed: { type: 'boolean' }
          }
        }
      }
    }
  }, async () => {
    const needed = await isSetupNeeded();
    return { needed };
  });

  // Setup initial admin
  fastify.post('/setup', {
    schema: {
      tags: ['Kimlik Doğrulama'],
      summary: 'İlk kurulumda yönetici hesabı oluştur'
    }
  }, async (request, reply) => {
    const parse = setupSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz kurulum bilgisi'
      });
    }

    try {
      const admin = await setupInitialAdmin(parse.data);
      // Auto login after setup
      const { token, user } = await loginUser(parse.data.username, parse.data.password, request.ip);
      reply.setCookie('session_token', token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60
      });
      return { success: true, message: 'Yönetici hesabı başarıyla oluşturuldu.', user, token };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Login
  fastify.post('/login', {
    schema: {
      tags: ['Kimlik Doğrulama'],
      summary: 'Kullanıcı girişi'
    }
  }, async (request, reply) => {
    const parse = loginSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Kullanıcı adı ve parola gereklidir.'
      });
    }

    try {
      const { token, user } = await loginUser(parse.data.username, parse.data.password, request.ip);
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

  // Logout
  fastify.post('/logout', {
    schema: {
      tags: ['Kimlik Doğrulama'],
      summary: 'Oturumu kapat'
    }
  }, async (request, reply) => {
    const token = (request.cookies as any)?.session_token || request.headers.authorization?.replace('Bearer ', '');
    if (token) {
      await logoutUser(token);
    }
    reply.clearCookie('session_token', { path: '/' });
    return { success: true, message: 'Başarıyla çıkış yapıldı.' };
  });

  // Get Current Logged In User
  fastify.get('/me', {
    schema: {
      tags: ['Kimlik Doğrulama'],
      summary: 'Aktif kullanıcı bilgisi'
    }
  }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Oturum açılmamış.' });
    }
    return { success: true, user: request.user };
  });

  // List all users (Admin only)
  fastify.get('/users', {
    schema: {
      tags: ['Kullanıcı Yönetimi'],
      summary: 'Kullanıcıları listele (Yalnızca Yönetici)'
    }
  }, async (request, reply) => {
    if (!request.user || request.user.role !== 'owner') {
      return reply.status(403).send({ success: false, error: 'Bu işlem için dükkan sahibi yetkisi gereklidir.' });
    }
    const users = await listUsers();
    return { success: true, users };
  });

  // Create new user (Admin only)
  fastify.post('/users', {
    schema: {
      tags: ['Kullanıcı Yönetimi'],
      summary: 'Yeni kullanıcı ekle (Yalnızca Yönetici)'
    }
  }, async (request, reply) => {
    if (!request.user || request.user.role !== 'owner') {
      return reply.status(403).send({ success: false, error: 'Bu işlem için dükkan sahibi yetkisi gereklidir.' });
    }

    const parse = createUserSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz kullanıcı bilgisi.'
      });
    }

    try {
      const newUser = await createUser(request.user, parse.data);
      return { success: true, user: newUser };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Delete user (Admin only)
  fastify.delete('/users/:id', {
    schema: {
      tags: ['Kullanıcı Yönetimi'],
      summary: 'Kullanıcı sil (Yalnızca Yönetici)'
    }
  }, async (request, reply) => {
    if (!request.user || request.user.role !== 'owner') {
      return reply.status(403).send({ success: false, error: 'Bu işlem için dükkan sahibi yetkisi gereklidir.' });
    }

    const userId = Number((request.params as any).id);
    if (!userId || isNaN(userId)) {
      return reply.status(400).send({ success: false, error: 'Geçersiz kullanıcı ID.' });
    }

    try {
      await deleteUser(request.user, userId);
      return { success: true, message: 'Kullanıcı silindi.' };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Reset user password (Admin only)
  fastify.post('/users/:id/reset-password', {
    schema: {
      tags: ['Kullanıcı Yönetimi'],
      summary: 'Kullanıcı parolasını sıfırla (Yalnızca Yönetici)'
    }
  }, async (request, reply) => {
    if (!request.user || request.user.role !== 'owner') {
      return reply.status(403).send({ success: false, error: 'Bu işlem için dükkan sahibi yetkisi gereklidir.' });
    }

    const userId = Number((request.params as any).id);
    const parse = resetPasswordSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz yeni parola.'
      });
    }

    try {
      await resetUserPassword(request.user, userId, parse.data.new_password);
      return { success: true, message: 'Parola başarıyla güncellendi.' };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });
};
