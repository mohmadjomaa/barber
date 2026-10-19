import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { env } from './config/env';
import { adminRoutes } from './routes/admin-routes';
import { authRoutes } from './routes/auth-routes';
import { publicRoutes } from './routes/public-routes';
import { errorHandler } from './middleware/error-handler';

export function createApp() {
  const app = express();

  // يجب تطبيق سياسات الأمان وCORS قبل تعريف المسارات حتى تصل كل طلبات الـ API
  // من واجهة العميل المسموح بها وبنفس قواعد الحماية.
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json());

  // نفصل المسارات بحسب من يستخدمها: auth لتسجيل الدخول، وadmin للوحة المحمية
  // بـ JWT، وبقية المسارات للعميل أثناء الحجز.
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', publicRoutes);

  // في production يخدم Express نسخة Angular نفسها. استثناء /api مهم حتى لا
  // يحوّل طلب API غير موجود إلى index.html ويخفي الخطأ الحقيقي عن الواجهة.
  const staticRoot = getStaticRoot();
  if (staticRoot) {
    app.use(express.static(staticRoot));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(staticRoot, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
}

function getStaticRoot() {
  // أثناء التطوير يخدم Angular الواجهة منفصلاً؛ لذلك لا نفعّل static files هنا.
  if (process.env['NODE_ENV'] !== 'production') {
    return null;
  }

  const candidates = [
    path.resolve(process.cwd(), 'dist/barber-booking-system/browser'),
    path.resolve(process.cwd(), '../dist/barber-booking-system/browser'),
  ];

  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'index.html'))) || null;
}
