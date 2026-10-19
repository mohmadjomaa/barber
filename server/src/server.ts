import { createApp } from './app';
import { connectDb } from './config/db';
import { env } from './config/env';
import { seedDefaults } from './services/seed';
import { ensureBookingSlotLockIndexes } from './models/booking-slot-lock';

async function main() {
  // ترتيب البدء مقصود: لا يستقبل الخادم طلبات حجز قبل نجاح الاتصال بقاعدة البيانات
  // وإنشاء unique index الذي يمنع حجز نفس الدقيقة مرتين.
  await connectDb();
  await ensureBookingSlotLockIndexes();
  await seedDefaults();

  const app = createApp();

  app.listen(env.PORT, () => {
    console.log(`Barber booking API listening on http://localhost:${env.PORT}`);
  });
}

main().catch((error) => {
  console.error('Failed to start API server:', error);
  process.exit(1);
});
