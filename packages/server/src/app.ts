import fastify, { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { validateSession } from './services/authService.js';
import { authRoutes } from './routes/auth.js';
import type { User, UserRole } from '@oto-servis/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

export interface AppOptions {
  enableRateLimit?: boolean;
  staticDir?: string;
  uploadDir?: string;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = fastify({
    logger: false
  });

  // Boş gövdeli JSON isteklerini (örn. gövdesiz DELETE) sert hata yerine
  // tanımsız gövde olarak kabul et; rotalar kendi doğrulamasını yapar.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (body === '' || body === undefined || body === null) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error);
    }
  });

  // CORS
  await app.register(fastifyCors, {
    origin: true,
    credentials: true
  });

  // Cookies
  await app.register(fastifyCookie);

  // Rate Limiting (optional in tests)
  if (options.enableRateLimit !== false) {
    await app.register(fastifyRateLimit, {
      max: 300,
      timeWindow: '1 minute'
    });
  }

  // Swagger OpenAPI Documentation
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Oto Servis Yönetim Sistemi API',
        description: 'Araç, İş Emri, Parça, Kasa, Cari ve Hatırlatıcı Yönetim REST API Servisi',
        version: '1.0.0'
      },
      servers: [{ url: '/api' }]
    }
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    }
  });

  // Uploads directory for photos
  const uploadDir = options.uploadDir || path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  await app.register(fastifyStatic, {
    root: uploadDir,
    prefix: '/uploads/'
  });

  // Serve compiled client UI if available (single port VPS / Docker mode)
  const possiblePaths = [
    options.staticDir,
    path.resolve(process.cwd(), 'packages/client/dist'),
    path.resolve(process.cwd(), '../client/dist'),
    path.resolve(process.cwd(), 'client/dist')
  ].filter(Boolean) as string[];

  const clientDistDir = possiblePaths.find((p) => fs.existsSync(p));

  if (clientDistDir) {
    await app.register(fastifyStatic, {
      root: clientDistDir,
      prefix: '/',
      decorateReply: false
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url && request.raw.url.startsWith('/api')) {
        reply.status(404).send({ success: false, error: 'Uç nokta bulunamadı.' });
      } else {
        reply.sendFile('index.html', clientDistDir);
      }
    });
  }

  // User session authentication hook
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (request) => {
    const token =
      (request.cookies as any)?.session_token ||
      request.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (token) {
      const user = await validateSession(token);
      request.user = user;
    } else {
      request.user = null;
    }
  });

  // Global error handler for consistent Turkish error messages
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Sunucu tarafında beklenmeyen bir hata oluştu.';
    reply.status(statusCode).send({
      success: false,
      error: message,
      code: error.code || 'SERVER_ERROR'
    });
  });

  // Register Routes
  await app.register(authRoutes, { prefix: '/api/auth' });

  const { customerRoutes } = await import('./routes/customers.js');
  await app.register(customerRoutes, { prefix: '/api/customers' });

  const { vehicleRoutes } = await import('./routes/vehicles.js');
  await app.register(vehicleRoutes, { prefix: '/api/vehicles' });

  const { partRoutes } = await import('./routes/parts.js');
  await app.register(partRoutes, { prefix: '/api/parts' });

  const { workOrderRoutes } = await import('./routes/workOrders.js');
  await app.register(workOrderRoutes, { prefix: '/api/work-orders' });

  const { paymentRoutes } = await import('./routes/payments.js');
  await app.register(paymentRoutes, { prefix: '/api/payments' });

  const { cashDeskRoutes } = await import('./routes/cashDesk.js');
  await app.register(cashDeskRoutes, { prefix: '/api/cash-desk' });

  const { expenseRoutes } = await import('./routes/expenses.js');
  await app.register(expenseRoutes, { prefix: '/api/expenses' });

  const { reminderRoutes } = await import('./routes/reminders.js');
  await app.register(reminderRoutes, { prefix: '/api/reminders' });

  const { backupRoutes } = await import('./routes/backup.js');
  await app.register(backupRoutes, { prefix: '/api/backup' });

  const { kvkkRoutes } = await import('./routes/kvkk.js');
  await app.register(kvkkRoutes, { prefix: '/api/kvkk' });

  const { settingsRoutes } = await import('./routes/settings.js');
  await app.register(settingsRoutes, { prefix: '/api/settings' });

  // Sample data management endpoints
  app.post('/api/admin/seed', async (request, reply) => {
    if (!request.user || request.user.role !== 'owner') {
      return reply.status(403).send({ success: false, error: 'Yalnızca dükkan sahibi örnek veri yükleyebilir.' });
    }
    const { seedDatabase } = await import('./db/seed.js');
    await seedDatabase();
    return { success: true, message: 'Örnek veriler başarıyla yüklendi.' };
  });

  app.post('/api/admin/purge-samples', async (request, reply) => {
    if (!request.user || request.user.role !== 'owner') {
      return reply.status(403).send({ success: false, error: 'Yalnızca dükkan sahibi örnek verileri silebilir.' });
    }
    const { purgeSampleData } = await import('./db/seed.js');
    await purgeSampleData();
    return { success: true, message: 'Örnek veriler başarıyla silindi.' };
  });

  // Health check route
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return app;
}
