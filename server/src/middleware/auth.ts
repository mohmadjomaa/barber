import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { HttpError } from '../utils/http-error';

export interface AdminJwtPayload {
  sub: string;
  role: 'admin';
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  // حماية فعلية على مستوى الخادم: لا نثق بـAngular guard وحده لأن أي عميل
  // يمكنه استدعاء API مباشرة. نقرأ Bearer token ونتحقق من توقيعه ودور admin.
  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

  if (!token) {
    next(new HttpError(401, 'Admin token is required.'));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AdminJwtPayload;

    if (payload.role !== 'admin') {
      next(new HttpError(403, 'Admin access is required.'));
      return;
    }

    next();
  } catch {
    next(new HttpError(401, 'Admin token is invalid.'));
  }
};
