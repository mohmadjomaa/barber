export function isTimeInput(value: string) {
  return /^\d{2}:\d{2}$/.test(value || '');
}

export function timeInputToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function displayTimeToMinutes(time: string) {
  const [clock, meridiem] = time.split(' ');
  let [hours, minutes] = clock.split(':').map(Number);

  if (meridiem === 'PM' && hours !== 12) {
    hours += 12;
  }

  if (meridiem === 'AM' && hours === 12) {
    hours = 0;
  }

  return hours * 60 + minutes;
}

export function minutesToDisplayTime(totalMinutes: number) {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  return `${hours12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${meridiem}`;
}

export function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function isPastAppointment(date: string, startMinutes: number, now = new Date()) {
  // نقارن مع وقت المحل الفعلي بدل timezone جهاز العميل.
  const { date: today, minutes: currentMinutes } = getBusinessDateAndMinutes(now);

  if (date < today) {
    return true;
  }

  if (date > today) {
    return false;
  }

  return startMinutes < currentMinutes;
}

/**
 * التواريخ في الحجز هي YYYY-MM-DD كتاريخ تقويمي للمحل، وليست timestamps.
 * لذلك كل مقارنة "اليوم" تستخدم BUSINESS_TIME_ZONE نفسه في الخادم.
 */
export function getBusinessDateAndMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );

  return {
    date: `${values['year']}-${values['month']}-${values['day']}`,
    minutes: Number(values['hour']) * 60 + Number(values['minute']),
  };
}

export function addCalendarDays(date: string, days: number) {
  // نستخدم منتصف اليوم UTC للحساب كي لا ينقل DST التاريخ إلى يوم مجاور.
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return `${value.getUTCFullYear()}-${`${value.getUTCMonth() + 1}`.padStart(2, '0')}-${`${value.getUTCDate()}`.padStart(2, '0')}`;
}

export function getWeekday(date: string) {
  // YYYY-MM-DD عند منتصف UTC يعطي weekday ثابتًا لا يتأثر بtimezone المتصفح.
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function formatCalendarDate(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
import { env } from '../config/env';
