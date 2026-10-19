import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/barber-booking-system'),
  JWT_SECRET: z.string().min(16).default('development-secret-change-before-production'),
  ADMIN_USERNAME: z.string().min(1).default('admin'),
  ADMIN_PASSWORD: z.string().min(1).default('admin1234'),
  BUSINESS_TIME_ZONE: z.string().min(1).default('Asia/Jerusalem'),
  CLIENT_ORIGIN: z.string().default('http://localhost:4200'),
  SMS_CONFIRMATION_URL: z.string().url().or(z.literal('')).default(''),
});

const parsedEnv = envSchema.parse(process.env);

// Development defaults make a first local run simple, but they must never
// become credentials for a deployed server.
if (process.env.NODE_ENV === 'production') {
  const unsafeProductionSettings = [
    !process.env.MONGODB_URI && 'MONGODB_URI',
    !process.env.JWT_SECRET && 'JWT_SECRET',
    parsedEnv.JWT_SECRET === 'development-secret-change-before-production' && 'JWT_SECRET',
    parsedEnv.JWT_SECRET.length < 32 && 'JWT_SECRET (must be at least 32 characters)',
    !process.env.ADMIN_USERNAME && 'ADMIN_USERNAME',
    !process.env.ADMIN_PASSWORD && 'ADMIN_PASSWORD',
    parsedEnv.ADMIN_PASSWORD === 'admin1234' && 'ADMIN_PASSWORD',
    !process.env.CLIENT_ORIGIN && 'CLIENT_ORIGIN',
  ].filter(Boolean);

  if (unsafeProductionSettings.length > 0) {
    throw new Error(
      `Unsafe production configuration. Set secure values for: ${unsafeProductionSettings.join(', ')}`,
    );
  }
}

export const env = parsedEnv;

// نتوقف عند بدء الخادم إذا كانت BUSINESS_TIME_ZONE غير صحيحة، بدل حساب
// المواعيد بحسب timezone الخادم الافتراضي وإظهار ساعات خاطئة للعملاء.
try {
  new Intl.DateTimeFormat('en-US', { timeZone: env.BUSINESS_TIME_ZONE }).format();
} catch {
  throw new Error(`BUSINESS_TIME_ZONE is not a valid IANA timezone: ${env.BUSINESS_TIME_ZONE}`);
}
