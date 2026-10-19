import { Router } from 'express';
import { z } from 'zod';
import { BarberModel } from '../models/barber';
import { ServiceOptionModel } from '../models/service-option';
import {
  createBooking,
  deleteBookingAsCustomer,
  findActiveBooking,
  getSlotGroups,
  getUpcomingDates,
  AvailabilityTiming,
} from '../services/booking-service';
import { getCompatibleBarbers } from '../services/barber-service';
import { asyncHandler } from '../middleware/async-handler';
import { strictObject, strictString } from '../validation/strict-payload';

const router = Router();

// GET /api/health
// فحص بسيط بأن API يعمل، دون قراءة بيانات الحجز.
router.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// GET /api/services
// يعيد الخدمات المفعلة فقط؛ الخدمات المعطلة تبقى مرئية للـAdmin فقط.
router.get(
  '/services',
  asyncHandler(async (_req, res) => {
    const services = await ServiceOptionModel.find({ active: { $ne: false } }).sort({
      createdAt: 1,
    });
    res.json(services.map((service) => service.toJSON()));
  }),
);

// GET /api/barbers?serviceId=...
// يعيد الحلاقين المتوافقين مع الخدمة عند وجود serviceId، وإلا يعيد الكل.
router.get(
  '/barbers',
  asyncHandler(async (req, res) => {
    const serviceId = typeof req.query.serviceId === 'string' ? req.query.serviceId : null;
    const barbers = serviceId
      ? await getCompatibleBarbers(serviceId)
      : await BarberModel.find().sort({ createdAt: 1 }).lean();

    res.json(barbers.map(stripMongoFields));
  }),
);

// GET /api/availability/dates
// يحدد لكل تاريخ إن كانت هناك ساعات يمكن حجزها اعتماداً على ساعات العمل ومدة
// الخدمة والحجوزات النشطة.
router.get(
  '/availability/dates',
  asyncHandler(async (req, res) => {
    const querySchema = strictObject({
      // القيم القادمة في عنوان الطلب تصل كنص دائماً. نتحقق من شكل days أولاً ثم
      // نحوّلها بوضوح هنا، بدلاً من تحويل تلقائي قد يخفي خطأ من العميل.
      days: strictString()
        .regex(/^-?\d+$/)
        .optional(),
      serviceId: strictString().nullable().optional(),
      barberId: strictString().nullable().optional(),
      barberPreference: z.enum(['any', 'specific']).default('specific'),
    });
    const query = querySchema.parse({
      days: req.query.days,
      serviceId: req.query.serviceId ?? null,
      barberId: req.query.barberId ?? null,
      barberPreference: req.query.barberPreference ?? 'specific',
    });
    const days = query.days === undefined ? 7 : Number(query.days);

    res.json(
      await getUpcomingDates(
        days,
        query.barberId || null,
        query.serviceId || null,
        query.barberPreference,
      ),
    );
  }),
);

// GET /api/availability/slots
// يعيد الساعات التي يمكن حجزها لتاريخ واحد فقط، بعد استبعاد الأوقات التي
// تتداخل مع الحجوزات النشطة.
router.get(
  '/availability/slots',
  asyncHandler(async (req, res) => {
    const querySchema = strictObject({
      date: strictString().default(''),
      serviceId: strictString().nullable().optional(),
      barberId: strictString().nullable().optional(),
      barberPreference: z.enum(['any', 'specific']).default('specific'),
    });
    const query = querySchema.parse({
      date: req.query.date ?? '',
      serviceId: req.query.serviceId ?? null,
      barberId: req.query.barberId ?? null,
      barberPreference: req.query.barberPreference ?? 'specific',
    });

    const timing: AvailabilityTiming = {
      workingHoursMs: 0,
      serviceLookupMs: 0,
      bookingsLookupMs: 0,
      slotCalculationMs: 0,
    };
    const startedAt = Date.now();
    const groups = await getSlotGroups(
      query.date,
      query.barberId || null,
      query.serviceId || null,
      query.barberPreference,
      timing,
    );
    const totalMs = Date.now() - startedAt;

    res.setHeader(
      'Server-Timing',
      [
        `working-hours;dur=${timing.workingHoursMs}`,
        `service;dur=${timing.serviceLookupMs}`,
        `bookings;dur=${timing.bookingsLookupMs}`,
        `slot-calculation;dur=${timing.slotCalculationMs}`,
        `total;dur=${totalMs}`,
      ].join(', '),
    );
    res.json(groups);
  }),
);

// POST /api/bookings
// ينشئ حجز العميل. تعيد createBooking فحص الوقت ثم تحفظه في MongoDB، وتستخدم
// أقفالاً فريدة لكل دقيقة لمنع قبول حجزين متداخلين مع الطلبات المتزامنة.
router.post(
  '/bookings',
  asyncHandler(async (req, res) => {
    const result = await createBooking(req.body);
    res.status(201).json(result);
  }),
);

// GET /api/bookings/:id
// يعيد الحجز لمالكه فقط بعد التحقق من manageToken الذي صدر عند الحجز.
router.get(
  '/bookings/:id',
  asyncHandler(async (req, res) => {
    res.json(
      await findActiveBooking(String(req.params.id), req.header('X-Booking-Token') || undefined),
    );
  }),
);

// DELETE /api/bookings/:id
// إلغاء العميل يغير status إلى cancelled ويحرر أقفال الوقت بدل حذف سجل الحجز.
router.delete(
  '/bookings/:id',
  asyncHandler(async (req, res) => {
    await deleteBookingAsCustomer(
      String(req.params.id),
      req.header('X-Booking-Token') || undefined,
    );
    res.status(204).send();
  }),
);

export const publicRoutes = router;

function stripMongoFields<T extends Record<string, unknown>>(value: T) {
  // حقول MongoDB التقنية لا تشكل جزءًا من عقد API العام للحلاقين.
  const output = { ...value };
  delete output['_id'];
  delete output['__v'];
  return output;
}
