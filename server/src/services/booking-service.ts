import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import { BarberDocument, BarberModel } from '../models/barber';
import { BookingModel, PaymentMethod, ReminderPreference } from '../models/booking';
import { BookingSlotLockModel, ensureBookingSlotLockIndexes } from '../models/booking-slot-lock';
import { ServiceOptionDocument, ServiceOptionModel } from '../models/service-option';
import { getCompatibleBarbers, canBarberPerformService } from './barber-service';
import { getSchedule } from './schedule-service';
import { sendBookingConfirmationSms } from './sms-service';
import { HttpError } from '../utils/http-error';
import { hasTimeOverlap } from '../utils/booking-rules';
import { getFreeWindows, getServiceStartMinutes } from '../utils/availability';
import {
  addCalendarDays,
  displayTimeToMinutes,
  formatCalendarDate,
  getBusinessDateAndMinutes,
  getWeekday,
  isPastAppointment,
  minutesToDisplayTime,
  timeInputToMinutes,
} from '../utils/time';
import { strictObject, strictString } from '../validation/strict-payload';
import { ShopSchedule } from './schedule-service';

export type BarberPreference = 'any' | 'specific';
export interface AvailabilityDateOption {
  iso: string;
  day: string;
  monthDay: string;
  display: string;
  hasSlots: boolean;
  closed: boolean;
}

export interface AvailabilityTiming {
  workingHoursMs: number;
  serviceLookupMs: number;
  bookingsLookupMs: number;
  slotCalculationMs: number;
}

export const createBookingSchema = strictObject({
  serviceId: strictString().min(1),
  barberId: strictString().nullable().optional(),
  barberPreference: z.enum(['any', 'specific']).default('specific'),
  date: strictString().min(1),
  time: strictString().min(1),
  name: strictString().min(2),
  phone: strictString().min(1),
  notes: strictString().default(''),
  reminderPreference: z.enum(['sms', 'whatsapp', 'email']).default('sms'),
  paymentMethod: z.enum(['pay-in-shop', 'deposit']).default('pay-in-shop'),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/**
 * يبني حالة الأيام القادمة للواجهة من ساعات العمل ومدة الخدمة والحجوزات.
 * نحمّل context المشترك مرة واحدة ثم نحسب كل تاريخ مستقل بالتوازي.
 */
export async function getUpcomingDates(
  days = 7,
  barberId: string | null = null,
  serviceId: string | null = null,
  barberPreference: BarberPreference = 'specific',
) {
  const numberOfDays = Math.min(Math.max(days, 1), 60);
  const today = getBusinessDateAndMinutes().date;
  const context = await getAvailabilityContext(
    getSchedule(),
    barberId,
    serviceId,
    barberPreference,
  );
  const schedule = context.schedule;

  // حجوزات الأيام مختلفة، أما schedule ومدة الخدمة والحلاقون المتوافقون
  // فمشتركون؛ لذلك لا نعيد جلبها داخل حساب كل يوم.
  const dates = Array.from({ length: numberOfDays }, (_, index) => {
    const iso = addCalendarDays(today, index);
    return { iso, closed: !isWorkingDateForSchedule(iso, schedule) };
  });
  const workingDates = dates.filter((date) => !date.closed).map((date) => date.iso);
  const activeBookings = workingDates.length
    ? await BookingModel.find({
        status: 'active',
        date: { $in: workingDates },
        barberId: { $in: context.candidates.map((barber) => barber.id) },
      }).lean<ActiveBookingWindow[]>()
    : [];

  return Promise.all(dates.map(async ({ iso, closed }) => {
    const slots = closed
      ? []
      : await getDayTimes(iso, context, activeBookings.filter((booking) => booking.date === iso));

    return {
      iso,
      day: formatCalendarDate(iso, { weekday: 'short' }),
      monthDay: formatCalendarDate(iso, { month: 'short', day: 'numeric' }),
      display: formatCalendarDate(iso, { weekday: 'short', month: 'short', day: 'numeric' }),
      hasSlots: slots.length > 0,
      closed,
    };
  }));
}

export async function getSlotGroups(
  date = '',
  barberId: string | null = null,
  serviceId: string | null = null,
  barberPreference: BarberPreference = 'specific',
  timing?: AvailabilityTiming,
) {
  // نقسم الأوقات إلى صباح وظهيرة ومساء للعرض فقط؛ نحسب جميع المواعيد المتاحة
  // أولاً ثم نضع كل موعد في الفترة المناسبة له.
  const slots = await getAvailableSlots(date, barberId, serviceId, barberPreference, timing);
  const groups = [
    {
      id: 'morning',
      label: 'Morning',
      helper: 'Before lunch',
      slots: slots.filter((slot) => displayTimeToMinutes(slot.time) < 12 * 60),
    },
    {
      id: 'afternoon',
      label: 'Afternoon',
      helper: 'Midday appointments',
      slots: slots.filter((slot) => {
        const minutes = displayTimeToMinutes(slot.time);
        return minutes >= 12 * 60 && minutes < 16 * 60;
      }),
    },
    {
      id: 'evening',
      label: 'Evening',
      helper: 'After-work slots',
      slots: slots.filter((slot) => displayTimeToMinutes(slot.time) >= 16 * 60),
    },
  ];

  return groups.filter((group) => group.slots.length > 0);
}

/**
 * يحسب الساعات المتاحة للحجز في تاريخ واحد كما يجب أن يراها العميل.
 *
 * يعتمد الحساب على أربعة أشياء: `date` المختار، ساعات العمل المحفوظة من Admin،
 * مدة `serviceId`، والحجوزات النشطة للحلاقين المناسبين فقط. لا نعتمد على ما
 * أرسله المتصفح بوصفه نتيجة نهائية، لأن الساعات المتاحة قد تتغير قبل لحظة الحجز.
 *
 * مثال: إذا كانت الخدمة 30 دقيقة والحجز الموجود من 10:00 إلى 10:30، فلن
 * يظهر 10:00 ولا أي وقت يتداخل معه، بينما تبقى المواعيد في الأيام الأخرى مستقلة.
 */
export async function getAvailableSlots(
  date = '',
  barberId: string | null = null,
  serviceId: string | null = null,
  barberPreference: BarberPreference = 'specific',
  timing?: AvailabilityTiming,
) {
  // نبدأ من هنا لحساب ساعات يوم واحد باستعمال البيانات الحالية في MongoDB.
  const context = await getAvailabilityContext(
    getSchedule(),
    barberId,
    serviceId,
    barberPreference,
    timing,
  );
  return getDayTimes(date, context, undefined, timing);
}

interface AvailabilityContext {
  schedule: ShopSchedule;
  services: ServiceOptionDocument[];
  candidates: BarberDocument[];
}

interface ActiveBookingWindow {
  date: string;
  barberId: string;
  startMinute: number;
  endMinute: number;
}

async function getAvailabilityContext(
  schedulePromise: Promise<ShopSchedule>,
  barberId: string | null,
  serviceId: string | null,
  barberPreference: BarberPreference,
  timing?: AvailabilityTiming,
): Promise<AvailabilityContext> {
  // الخدمة تحدد المدة، والحلاقون يحددون من يستطيع تنفيذها؛ نجلبهما معًا.
  const scheduleStartedAt = Date.now();
  const serviceStartedAt = Date.now();
  const [schedule, [services, allBarbers]] = await Promise.all([
    schedulePromise,
    Promise.all([
      serviceId
        ? ServiceOptionModel.findOne({ id: serviceId }).lean().then((service) => service ? [service] : [])
        : ServiceOptionModel.find({ active: { $ne: false } }).sort({ createdAt: 1 }).lean(),
      BarberModel.find().sort({ createdAt: 1 }).lean<BarberDocument[]>(),
    ]),
  ]);
  if (timing) {
    timing.workingHoursMs += Date.now() - scheduleStartedAt;
  }
  if (timing) {
    timing.serviceLookupMs += Date.now() - serviceStartedAt;
  }

  // خدمة معطلة أو مفقودة لا يمكن أن تنتج وقتاً قابلاً للحجز، حتى لو بقي id
  // قديم محفوظاً في المتصفح.
  if (serviceId && (!services.length || services[0].active === false)) {
    throw new HttpError(404, 'Selected service was not found or is no longer available.');
  }

  const activeServices = services.filter((service) =>
    service.active !== false && Number.isInteger(service.duration) && service.duration > 0,
  );
  const compatibleBarbers = allBarbers.filter((barber) => activeServices.some((service) =>
    !service.barberIds?.length || service.barberIds.includes(barber.id),
  ));
  // قبل اختيار خدمة أو حلاق، تعرض الواجهة الأوقات التي يمكن حجزها عند أي حلاق. نحافظ على هذا
  // السلوك العام رغم أن القيمة الافتراضية للـ route هي barberPreference=specific.
  const effectivePreference = !serviceId && !barberId ? 'any' : barberPreference;
  const candidates =
    effectivePreference === 'specific'
      ? compatibleBarbers.filter((barber) => barber.id === barberId)
      : compatibleBarbers;

  return {
    schedule,
    services: activeServices,
    candidates,
  };
}

/**
 * ينفذ حساب اليوم بعد تجهيز البيانات المشتركة في `context`.
 *
 * نستخرج فراغات كل حلاق ثم نولّد خيارات حسب مدة الخدمة من حدود كل فراغ.
 * الخيارات تنتهي عند الإغلاق أو قبله ولا تتداخل مع أي Booking نشط.
 * قبل اختيار خدمة، نستخدم الخدمات المفعّلة الفعلية لحساب إتاحة اليوم.
 */
async function getDayTimes(
  date: string,
  context: AvailabilityContext,
  knownActiveBookings?: ActiveBookingWindow[],
  timing?: AvailabilityTiming,
) {
  if (
    !date ||
    !isWorkingDateForSchedule(date, context.schedule) ||
    !context.candidates.length ||
    !context.services.length
  ) {
    return [];
  }

  // نقرأ الحجوزات النشطة لهذا التاريخ والحلاقين المرشحين فقط. مقارنة date +
  // barberId تمنع أن يؤثر وقت في يوم أو عند حلاق آخر على الموعد الحالي.
  const bookingsStartedAt = Date.now();
  const activeBookings =
    knownActiveBookings ||
    (await BookingModel.find({
      status: 'active',
      date,
      barberId: { $in: context.candidates.map((barber) => barber.id) },
    }).lean<ActiveBookingWindow[]>());
  if (timing && !knownActiveBookings) {
    timing.bookingsLookupMs += Date.now() - bookingsStartedAt;
  }
  const openMinutes = timeInputToMinutes(context.schedule.openTime);
  const closeMinutes = timeInputToMinutes(context.schedule.closeTime);
  const slotsByMinute = new Map<number, {
    time: string;
    label?: string;
    disabled?: boolean;
    scarcity?: string;
    barberId?: string;
    barberName?: string;
  }>();

  // لكل حلاق فراغاته المستقلة. نستخدم المدة المحفوظة في الحجوزات القديمة،
  // ونبدأ الخيارات من حدود الفراغات بدل شبكة ثابتة مشتركة بين الخدمات.
  const slotCalculationStartedAt = Date.now();
  const now = getBusinessDateAndMinutes();
  if (date < now.date) {
    return [];
  }
  const notBefore = date === now.date ? Math.max(openMinutes, now.minutes) : openMinutes;
  for (const barber of context.candidates) {
    const freeWindows = getFreeWindows(
      openMinutes,
      closeMinutes,
      activeBookings.filter((booking) => booking.barberId === barber.id),
      notBefore,
    );
    for (const service of context.services) {
      if (service.barberIds?.length && !service.barberIds.includes(barber.id)) {
        continue;
      }
      for (const minutes of getServiceStartMinutes(freeWindows, service.duration)) {
        if (!slotsByMinute.has(minutes)) {
          slotsByMinute.set(minutes, {
            time: minutesToDisplayTime(minutes),
            barberId: barber.id,
            barberName: barber.name,
          });
        }
      }
    }
  }
  if (timing) {
    timing.slotCalculationMs += Date.now() - slotCalculationStartedAt;
  }

  return [...slotsByMinute.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, slot], index) => ({ ...slot, label: index === 0 ? 'First slot' : undefined }));
}

/**
 * ينشئ حجزاً نهائياً بعد إعادة التحقق من الساعات المتاحة داخل الخادم.
 *
 * التسلسل: نتحقق من بيانات الطلب، نحدد الحلاق المتاح، نحجز كل دقيقة من مدة
 * الموعد في BookingSlotLock، ثم نحفظ Booking في MongoDB. القفل الفريد يمنع
 * `double booking` إذا أرسل عميلان طلب الحجز نفسه في اللحظة نفسها.
 */
export async function createBooking(input: unknown) {
  // نتحقق من الطلب ثم نأخذ أقفال الدقائق الذرية ثم نحفظ Booking الدائم.
  // لذلك لا يكون الوقت الظاهر في الواجهة ضماناً نهائياً إذا أرسل عميل آخر
  // طلب حجز متزامناً.
  const parsed = createBookingSchema.parse(input);
  // The unique lock index is required only before a write. Keep dashboard and
  // availability reads independent from index verification, while preserving
  // the same double-booking protection for every booking creation.
  await ensureBookingSlotLockIndexes();
  const validation = await validateBookingRequest(parsed);

  if (!validation.valid || !validation.assignedBarber || !validation.service) {
    throw new HttpError(
      validation.conflict ? 409 : 400,
      validation.reason || 'Booking is incomplete.',
    );
  }

  // Reuse the exact duration checked above, even if an admin edits the service mid-request.
  const service = validation.service;

  const startMinute = displayTimeToMinutes(parsed.time);
  const endMinute = startMinute + service.duration;
  const manageToken = crypto.randomBytes(24).toString('hex');
  const manageTokenHash = await bcrypt.hash(manageToken, 10);
  const bookingId = new Types.ObjectId().toString();
  let slotLocksClaimed = false;

  try {
    // For any-barber bookings, retry another compatible barber if a concurrent
    // request wins this barber's locks. Every candidate still needs all minutes.
    const candidates = parsed.barberPreference === 'any'
      ? await getCompatibleBarbers(service.id)
      : [validation.assignedBarber];
    let assignedBarber: BarberDocument | undefined;
    for (const candidate of candidates) {
      if (!(await isBarberFree(candidate.id, parsed.date, startMinute, service.duration))) {
        continue;
      }
      try {
        await claimBookingMinutes(bookingId, parsed.date, candidate.id, startMinute, endMinute);
        slotLocksClaimed = true;
        assignedBarber = candidate;
        break;
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }
    if (!assignedBarber) {
      throw new HttpError(409, 'This time slot is no longer available.');
    }

    // BookingModel هو المصدر الذي تقرأه صفحة Admin وحساب الساعات المتاحة لاحقاً.
    const booking = await BookingModel.create({
      _id: bookingId,
      serviceId: service.id,
      barberId: assignedBarber.id,
      service: service.name,
      barber: assignedBarber.name,
      duration: service.duration,
      price: service.price,
      date: parsed.date,
      time: parsed.time,
      startMinute,
      endMinute,
      name: parsed.name.trim(),
      phone: parsed.phone.trim(),
      notes: parsed.notes.trim(),
      reminderPreference: parsed.reminderPreference as ReminderPreference,
      paymentMethod: parsed.paymentMethod as PaymentMethod,
      status: 'active',
      manageTokenHash,
    });
    const serializedBooking = booking.toJSON() as Record<string, unknown>;
    const sms = await sendBookingConfirmationSms({
      id: String(serializedBooking.id),
      name: String(serializedBooking.name),
      phone: String(serializedBooking.phone),
      service: String(serializedBooking.service),
      barber: String(serializedBooking.barber),
      date: String(serializedBooking.date),
      time: String(serializedBooking.time),
    });

    return {
      booking: serializedBooking,
      manageToken,
      sms,
    };
  } catch (error) {
    // نفك الأقفال الجزئية إذا فشل التخزين بعد أخذها.
    if (slotLocksClaimed) {
      await releaseBookingMinutes(bookingId);
    }

    if (isDuplicateKeyError(error)) {
      throw new HttpError(409, 'This time slot is no longer available.');
    }

    throw error;
  }
}

export async function validateBookingRequest(request: {
  serviceId: string | null;
  barberId?: string | null;
  barberPreference?: BarberPreference;
  date: string;
  time: string;
  name?: string;
  phone?: string;
}) {
  // نتحقق من قواعد الحجز هنا لتحسين الرسالة للعميل؛ القفل أثناء الإنشاء هو الحماية النهائية
  // لأن الساعات المتاحة قد تتغير بين هذا الفحص وINSERT.
  const service = await ServiceOptionModel.findOne({ id: request.serviceId || '' }).lean();

  if (!service || service.active === false || !Number.isInteger(service.duration) || service.duration <= 0) {
    return { valid: false, reason: 'Select a valid service.' };
  }

  if (!request.date) {
    return { valid: false, reason: 'Select an appointment date.' };
  }

  if (!request.time) {
    return { valid: false, reason: 'Select an appointment time.' };
  }

  if (request.name !== undefined && request.name.trim().length < 2) {
    return { valid: false, reason: 'Enter a name for the booking.' };
  }

  if (request.phone !== undefined && !request.phone.trim()) {
    return { valid: false, reason: 'Enter a phone number for the booking.' };
  }

  if (request.phone !== undefined) {
    const phone = request.phone.trim();
    if (!/^\+?\d{9,15}$/.test(phone)) {
      return { valid: false, reason: 'Enter a valid phone number.' };
    }
  }

  if (!(await isWorkingDate(request.date))) {
    return { valid: false, reason: 'Selected date is outside working days.' };
  }

  const startMinutes = displayTimeToMinutes(request.time);

  if (!Number.isFinite(startMinutes)) {
    return { valid: false, reason: 'Select an appointment time.' };
  }

  if (isPastAppointment(request.date, startMinutes)) {
    return { valid: false, reason: 'Selected appointment time is in the past.' };
  }

  if (!(await fitsInsideSchedule(startMinutes, service.duration))) {
    return { valid: false, reason: 'Selected service does not fit before closing time.' };
  }

  const barberPreference = request.barberPreference || 'specific';

  if (barberPreference === 'any') {
    const assignedBarber = await findAvailableBarber(
      request.date,
      request.time,
      service.id,
      null,
      'any',
      service.duration,
    );

    if (!assignedBarber) {
      return { valid: false, conflict: true, reason: 'This time slot is no longer available.' };
    }

    return { valid: true, assignedBarber, service };
  }

  const barber = await BarberModel.findOne({ id: request.barberId || '' }).lean();

  if (!barber) {
    return { valid: false, reason: 'Select a valid barber.' };
  }

  if (!(await canBarberPerformService(service.id, barber.id))) {
    return { valid: false, reason: 'Selected barber cannot perform this service.' };
  }

  if (!(await isBarberFree(barber.id, request.date, startMinutes, service.duration))) {
    return { valid: false, conflict: true, reason: 'This time slot is no longer available.' };
  }

  return { valid: true, assignedBarber: barber, service };
}

export async function deleteBookingAsCustomer(bookingId: string, manageToken: string | undefined) {
  // الإلغاء يغير status ويحرر الدقائق؛ لا يحذف السجل التاريخي من MongoDB.
  if (!manageToken) {
    throw new HttpError(401, 'Booking token is required.');
  }

  const booking = await BookingModel.findById(bookingId);

  if (!booking || booking.status !== 'active') {
    throw new HttpError(404, 'Booking was not found.');
  }

  const matches = await bcrypt.compare(manageToken, booking.manageTokenHash);

  if (!matches) {
    throw new HttpError(403, 'Booking token is invalid.');
  }

  booking.status = 'cancelled';
  await booking.save();
  await releaseBookingMinutes(bookingId);
}

export async function deleteBookingAsAdmin(bookingId: string) {
  // Admin يستخدم نفس تحرير الأقفال، لكن صلاحية JWT تغنيه عن manageToken.
  const booking = await BookingModel.findById(bookingId);

  if (!booking || booking.status !== 'active') {
    throw new HttpError(404, 'Booking was not found.');
  }

  booking.status = 'cancelled';
  await booking.save();
  await releaseBookingMinutes(bookingId);
}

export async function findActiveBooking(bookingId: string, manageToken: string | undefined) {
  if (!manageToken) {
    throw new HttpError(401, 'Booking token is required.');
  }

  const booking = await BookingModel.findOne({ _id: bookingId, status: 'active' });

  if (!booking) {
    throw new HttpError(404, 'Booking was not found.');
  }

  const matches = await bcrypt.compare(manageToken, booking.manageTokenHash);

  if (!matches) {
    throw new HttpError(403, 'Booking token is invalid.');
  }

  return booking.toJSON();
}

export async function listActiveBookings(search = '') {
  // cancelled تبقى للتاريخ، لكن active فقط تظهر في Admin وتحجب الساعات المحجوزة.
  const query = search.trim().toLowerCase();
  const bookings = await BookingModel.find({ status: 'active' }).sort({ date: 1, startMinute: 1 });
  const serialized = bookings.map((booking) => booking.toJSON());

  if (!query) {
    return serialized;
  }

  return serialized.filter(
    (booking) =>
      booking.name.toLowerCase().includes(query) ||
      booking.service.toLowerCase().includes(query) ||
      booking.barber.toLowerCase().includes(query) ||
      booking.date.toLowerCase().includes(query),
  );
}

async function isWorkingDate(date: string) {
  if (!date) {
    return false;
  }

  const schedule = await getSchedule();
  return isWorkingDateForSchedule(date, schedule);
}

function isWorkingDateForSchedule(date: string, schedule: ShopSchedule) {
  // getWeekday يستخدم تاريخ YYYY-MM-DD ثابتًا كي لا يغيّر timezone يوم الأسبوع.
  return !!date && schedule.workingDays.includes(getWeekday(date));
}

async function findAvailableBarber(
  date: string,
  time: string,
  serviceId: string | null,
  barberId: string | null,
  barberPreference: BarberPreference,
  duration: number,
) {
  if (!date || !time || !(await isWorkingDate(date))) {
    return null;
  }

  const startMinutes = displayTimeToMinutes(time);

  if (
    isPastAppointment(date, startMinutes) ||
    !(await fitsInsideSchedule(startMinutes, duration))
  ) {
    return null;
  }

  const candidates =
    barberPreference === 'any'
      ? await getCompatibleBarbers(serviceId)
      : await getSpecificBarberCandidate(barberId);

  for (const barber of candidates) {
    if (
      (await canBarberPerformService(serviceId, barber.id)) &&
      (await isBarberFree(barber.id, date, startMinutes, duration))
    ) {
      return barber;
    }
  }

  return null;
}

async function getSpecificBarberCandidate(barberId: string | null) {
  const barber = await BarberModel.findOne({ id: barberId || '' }).lean<BarberDocument>();
  return barber ? [barber] : [];
}

async function isBarberFree(
  barberId: string,
  date: string,
  startMinutes: number,
  duration: number,
) {
  const endMinutes = startMinutes + duration;
  // قاعدة البيانات تبحث عن تداخل في التاريخ والحلاق نفسيهما، لا time كنص فقط.
  const conflict = await BookingModel.findOne({
    status: 'active',
    date,
    barberId,
    startMinute: { $lt: endMinutes },
    endMinute: { $gt: startMinutes },
  }).lean();

  return (
    !conflict || !hasTimeOverlap(conflict.startMinute, conflict.endMinute, startMinutes, endMinutes)
  );
}

async function fitsInsideSchedule(startMinutes: number, duration: number) {
  const schedule = await getSchedule();
  const openMinutes = timeInputToMinutes(schedule.openTime);
  const closeMinutes = timeInputToMinutes(schedule.closeTime);

  return startMinutes >= openMinutes && startMinutes + duration <= closeMinutes;
}

async function claimBookingMinutes(
  bookingId: string,
  date: string,
  barberId: string,
  startMinute: number,
  endMinute: number,
) {
  // نخزن دقيقة لكل جزء من نطاق الموعد؛ index الفريد يجعل أي نطاق متداخل يفشل
  // ذريًا حتى إذا وصل الطلبان في اللحظة نفسها.
  const locks = Array.from({ length: endMinute - startMinute }, (_, index) => ({
    bookingId,
    date,
    barberId,
    minute: startMinute + index,
  }));

  try {
    await BookingSlotLockModel.insertMany(locks, { ordered: true });
  } catch (error) {
    // قد ينجح insertMany في جزء من الدقائق قبل duplicate key، لذا ننظف الجزء
    // الجزئي كي لا تبقى ساعة محجوبة خطأً.
    await releaseBookingMinutes(bookingId);
    throw error;
  }
}

async function releaseBookingMinutes(bookingId: string) {
  await BookingSlotLockModel.deleteMany({ bookingId });
}

function isDuplicateKeyError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
