import { env } from '../config/env';
import { displayTimeToMinutes } from '../utils/time';

export type SmsDeliveryStatus = 'sent' | 'skipped' | 'failed';

export interface SmsDeliveryResult {
  status: SmsDeliveryStatus;
  reason?: string;
}

export interface BookingSmsDetails {
  id: string;
  name: string;
  phone: string;
  service: string;
  barber: string;
  date: string;
  time: string;
}

/**
 * يرسل رسالة تأكيد إلى مزود الرسائل إذا كان SMS_CONFIRMATION_URL مضبوطاً.
 * فشل الإرسال لا يلغي الحجز؛ الحجز يكون قد حُفظ بالفعل، وتعود النتيجة فقط
 * لتوضيح ما إذا كانت الرسالة أُرسلت أو تم تجاوزها أو فشلت.
 */
export async function sendBookingConfirmationSms(
  booking: BookingSmsDetails,
): Promise<SmsDeliveryResult> {
  if (!env.SMS_CONFIRMATION_URL) {
    return { status: 'skipped', reason: 'SMS_CONFIRMATION_URL is not configured.' };
  }

  const message = buildBookingConfirmationMessage(booking);

  try {
    const response = await fetch(env.SMS_CONFIRMATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: booking.phone,
        message,
        booking: {
          id: booking.id,
          name: booking.name,
          service: booking.service,
          barber: booking.barber,
          date: booking.date,
          time: booking.time,
        },
      }),
    });

    if (!response.ok) {
      return { status: 'failed', reason: `SMS provider returned ${response.status}.` };
    }

    return { status: 'sent' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'SMS provider request failed.';
    return { status: 'failed', reason };
  }
}

function buildBookingConfirmationMessage(booking: BookingSmsDetails) {
  return `Hi ${booking.name}, your appointment at North Barber is confirmed for ${booking.date} at ${formatTime(booking.time)} with ${booking.barber} for ${booking.service}.`;
}

function formatTime(time: string) {
  const minutes = displayTimeToMinutes(time);

  if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 24 * 60) {
    return time;
  }

  return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
}
