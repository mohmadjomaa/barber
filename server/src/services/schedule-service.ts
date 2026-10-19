import { defaultSchedule } from '../data/defaults';
import { ShopSettingsDocument, ShopSettingsModel } from '../models/shop-settings';
import { isTimeInput, timeInputToMinutes } from '../utils/time';

/**
 * يمثل هذا النوع ساعات عمل المحل التي يغيرها Admin ويستخدمها الخادم لمعرفة
 * الأوقات التي يمكن للعميل الحجز فيها.
 * `key` داخلي في MongoDB ولا يصل للواجهة؛ وظيفته فقط العثور على document
 * الإعدادات الوحيد للمحل.
 */
export interface ShopSchedule {
  workingDays: number[];
  openTime: string;
  closeTime: string;
}

const earliestOpeningMinute = 6 * 60;
const latestClosingMinute = 23 * 60;
const maxScheduleSpanMinutes = 12 * 60;

export function normalizeSchedule(schedule: Partial<ShopSettingsDocument>): ShopSettingsDocument {
  // Old documents may still contain slotIntervalMinutes. Return only working
  // hours: service durations now determine availability, including on old data.
  // ننظف الإعداد عند حدود التخزين ونستخدم fallback آمنًا حتى لا تكسر قيمة
  // ناقصة أو وقت غير منطقي إنشاء المواعيد كلها.
  const workingDays = Array.from(
    new Set(
      (Array.isArray(schedule.workingDays)
        ? schedule.workingDays
        : defaultSchedule.workingDays
      ).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    ),
  );
  const requestedOpenTime =
    schedule.openTime && isTimeInput(schedule.openTime)
      ? schedule.openTime
      : defaultSchedule.openTime;
  const requestedCloseTime =
    schedule.closeTime && isTimeInput(schedule.closeTime)
      ? schedule.closeTime
      : defaultSchedule.closeTime;
  const requestedOpenMinutes = timeInputToMinutes(requestedOpenTime);
  const requestedCloseMinutes = timeInputToMinutes(requestedCloseTime);
  const validCustomerSchedule =
    requestedOpenMinutes >= earliestOpeningMinute &&
    requestedCloseMinutes <= latestClosingMinute &&
    requestedCloseMinutes > requestedOpenMinutes &&
    requestedCloseMinutes - requestedOpenMinutes <= maxScheduleSpanMinutes;

  return {
    key: 'default',
    workingDays: workingDays.length ? workingDays : defaultSchedule.workingDays,
    openTime: validCustomerSchedule ? requestedOpenTime : defaultSchedule.openTime,
    closeTime: validCustomerSchedule ? requestedCloseTime : defaultSchedule.closeTime,
  };
}

export async function getSchedule() {
  // عند حساب الأوقات المتاحة نقرأ الإعداد المحفوظ في MongoDB كل مرة، لا نسخة
  // قديمة من المتصفح، حتى يظهر للعميل آخر تعديل حفظه Admin.
  const stored = await ShopSettingsModel.findOne({ key: 'default' }).lean();
  return toPublicSchedule(normalizeSchedule(stored || defaultSchedule));
}

export async function saveSchedule(input: ShopSchedule) {
  // upsert يحافظ على إعداد واحد للمحل حتى في أول تشغيل بلا document سابق.
  const normalized = normalizeSchedule(input);
  const schedule = await ShopSettingsModel.findOneAndUpdate({ key: 'default' }, normalized, {
    new: true,
    upsert: true,
  });

  return toPublicSchedule(schedule.toJSON() as ShopSettingsDocument);
}

function toPublicSchedule(schedule: ShopSettingsDocument): ShopSchedule {
  return {
    workingDays: [...schedule.workingDays],
    openTime: schedule.openTime,
    closeTime: schedule.closeTime,
  };
}
