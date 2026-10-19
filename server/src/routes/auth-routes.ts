import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { asyncHandler } from '../middleware/async-handler';
import { HttpError } from '../utils/http-error';
import { strictObject, strictString } from '../validation/strict-payload';

const router = Router();

const loginSchema = strictObject({
  username: strictString().min(1).optional(),
  password: strictString().min(1),
});

// POST /api/auth/login
// يتحقق من بيانات Admin في environment variables ثم يصدر JWT لمدة 8 ساعات.
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const credentials = loginSchema.parse(req.body);
    // نموذج العميل يرسل password فقط؛ نستخدم ADMIN_USERNAME من environment
    // ولا نثبت اسم مستخدم داخل المتصفح لأن deployment قد يغيّره.
    const username = credentials.username || env.ADMIN_USERNAME;
    const usernameMatches = username === env.ADMIN_USERNAME;
    const passwordMatches = env.ADMIN_PASSWORD.startsWith('$2')
      ? await bcrypt.compare(credentials.password, env.ADMIN_PASSWORD)
      : credentials.password === env.ADMIN_PASSWORD;

    if (!usernameMatches || !passwordMatches) {
      throw new HttpError(401, 'Invalid admin credentials.');
    }

    const token = jwt.sign({ sub: username, role: 'admin' }, env.JWT_SECRET, { expiresIn: '8h' });

    res.json({ token });
  }),
);

export const authRoutes = router;
