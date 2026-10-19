import { Router } from 'express';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../middleware/async-handler';
import { BarberModel } from '../models/barber';
import { ServiceOptionModel } from '../models/service-option';
import {
  createBooking,
  createBookingSchema,
  deleteBookingAsAdmin,
  listActiveBookings,
} from '../services/booking-service';
import { addBarber, deleteBarber } from '../services/barber-service';
import { getSchedule, saveSchedule } from '../services/schedule-service';
import { HttpError } from '../utils/http-error';
import { strictInteger, strictObject, strictString } from '../validation/strict-payload';

const router = Router();

// كل المسارات التالية تتطلب JWT بدور admin. middleware يتحقق من التوقيع
// والدور قبل أن يصل الطلب إلى أي استعلام MongoDB.
router.use(requireAdmin);

// GET /api/admin/bookings?search=...
// يقرأ الحجوزات النشطة من BookingModel، وهو المصدر نفسه الذي نقرأه عند حساب
// الساعات المتاحة للحجز.
router.get(
  '/bookings',
  asyncHandler(async (req, res) => {
    const startedAt = performance.now();
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const bookings = await listActiveBookings(search);
    setAdminTiming(res, startedAt);
    res.json(bookings);
  }),
);

// POST /api/admin/bookings
// ينشئ حجزًا من اللوحة مع barberPreference = specific حتى يكون الحلاق المحدد
// جزءًا من التحقق والأقفال نفسها المستخدمة في حجز العميل.
router.post(
  '/bookings',
  asyncHandler(async (req, res) => {
    const booking = createBookingSchema.parse(req.body);
    const result = await createBooking({ ...booking, barberPreference: 'specific' });

    res.status(201).json(result.booking);
  }),
);

// DELETE /api/admin/bookings/:id
// يلغي الحجز النشط ويحرر أقفال الدقائق، فيعود الوقت متاحًا في الحساب التالي.
router.delete(
  '/bookings/:id',
  asyncHandler(async (req, res) => {
    await deleteBookingAsAdmin(String(req.params.id));
    res.status(204).send();
  }),
);

// GET /api/admin/schedule
// يعيد إعداد ساعات العمل العام للمحل.
router.get(
  '/schedule',
  asyncHandler(async (_req, res) => {
    const startedAt = performance.now();
    const schedule = await getSchedule();
    setAdminTiming(res, startedAt);
    res.json(schedule);
  }),
);

// PUT /api/admin/schedule
// يتحقق من وقت الفتح والإغلاق ويحفظ ساعات العمل الدائمة التي يستخدمها الخادم
// عند حساب الساعات المتاحة للحجز.
router.put(
  '/schedule',
  asyncHandler(async (req, res) => {
    const schema = strictObject({
      workingDays: z.array(strictInteger().min(0).max(6)).min(1),
      openTime: strictString().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      closeTime: strictString().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    }).superRefine((schedule, context) => {
      const open = toMinutes(schedule.openTime);
      const close = toMinutes(schedule.closeTime);

      if (close <= open) {
        context.addIssue({
          code: 'custom',
          path: ['closeTime'],
          message: 'Close time must be later than open time.',
        });
      }
    });

    res.json(await saveSchedule(schema.parse(req.body)));
  }),
);

// GET /api/admin/services
// يعيد جميع الخدمات، بما فيها غير المفعلة، حتى يستطيع Admin إدارتها.
router.get(
  '/services',
  asyncHandler(async (_req, res) => {
    const startedAt = performance.now();
    const services = await ServiceOptionModel.find().sort({ createdAt: 1 });
    setAdminTiming(res, startedAt);
    res.json(services.map((service) => service.toJSON()));
  }),
);

const serviceSchema = strictObject({
  name: strictString().min(2),
  description: strictString().optional(),
  duration: strictInteger().positive(),
  price: z.number().nonnegative(),
  badge: strictString().optional(),
  bestFor: strictString().optional(),
  popularity: strictString().optional(),
  active: z.boolean().optional(),
});

// POST /api/admin/services
// ينشئ خدمة جديدة مع id ثابت للاستخدام في الحجوزات والعلاقات المستقبلية.
router.post(
  '/services',
  asyncHandler(async (req, res) => {
    const input = serviceSchema.parse(req.body);
    const id = createServiceId(input.name);
    const service = await ServiceOptionModel.create({
      id,
      name: input.name.trim(),
      description: input.description?.trim() || '',
      duration: input.duration,
      price: input.price,
      badge: input.badge?.trim() || '',
      bestFor: input.bestFor?.trim() || '',
      popularity: input.popularity?.trim() || '',
      active: input.active ?? true,
    });
    res.status(201).json(service.toJSON());
  }),
);

// PUT /api/admin/services/:id
// يعدل خدمة موجودة مباشرة في MongoDB ويعيد النسخة المحفوظة للواجهة.
router.put(
  '/services/:id',
  asyncHandler(async (req, res) => {
    const input = serviceSchema.partial().parse(req.body);
    const service = await ServiceOptionModel.findOneAndUpdate(
      { id: String(req.params.id) },
      { $set: input },
      { new: true, runValidators: true },
    );
    if (!service) {
      throw new HttpError(404, 'Service was not found.');
    }
    res.json(service.toJSON());
  }),
);

// GET /api/admin/barbers
// يعيد كامل قائمة الحلاقين التي تظهر بجانب أزرار الإضافة والحذف في Admin.
router.get(
  '/barbers',
  asyncHandler(async (_req, res) => {
    const startedAt = performance.now();
    const barbers = await BarberModel.find().sort({ createdAt: 1 });
    setAdminTiming(res, startedAt);
    res.json(barbers.map((barber) => barber.toJSON()));
  }),
);

// POST /api/admin/barbers
// يضيف حلاقًا إلى المصدر الدائم.
router.post(
  '/barbers',
  asyncHandler(async (req, res) => {
    const schema = strictObject({
      name: strictString().min(1),
      title: strictString().optional(),
      rating: z.number().optional(),
      reviews: strictInteger().nonnegative().optional(),
      specialty: strictString().optional(),
      availability: strictString().optional(),
      image: strictString().optional(),
      nextAvailable: strictString().optional(),
    });

    res.status(201).json(await addBarber(schema.parse(req.body)));
  }),
);

// DELETE /api/admin/barbers/:id
// يحذف الحلاق بعد تطبيق قواعد الحجز، مثل منع حذف آخر حلاق في المحل.
router.delete(
  '/barbers/:id',
  asyncHandler(async (req, res) => {
    await deleteBarber(String(req.params.id));
    res.status(204).send();
  }),
);

export const adminRoutes = router;

function createServiceId(name: string) {
  // نضيف timestamp حتى لا يتكرر id عند إنشاء خدمتين تحملان الاسم نفسه.
  return `${
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'service'
  }-${Date.now()}`;
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function setAdminTiming(res: { setHeader(name: string, value: string): void }, startedAt: number) {
  // Each admin read is one MongoDB query. No connection is opened per request:
  // Mongoose's process-level pool is established when the server starts.
  const totalMs = performance.now() - startedAt;
  res.setHeader('Server-Timing', `database;dur=${totalMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`);
}
