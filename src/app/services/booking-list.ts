import { BookingRecord } from './booking-state';

export type BookingListFilter = 'today' | 'upcoming' | 'all';
export type BookingSortKey = 'date' | 'customer' | 'barber' | 'service';

const businessTimeZone = 'Asia/Jerusalem';

export function getBusinessNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: businessTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0);

  return {
    date: `${value('year')}-${`${value('month')}`.padStart(2, '0')}-${`${value('day')}`.padStart(2, '0')}`,
    minutes: value('hour') * 60 + value('minute'),
  };
}

export function bookingTimeToMinutes(time: string) {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') {
    hours += 12;
  }
  return hours * 60 + Number(match[2]);
}

export function compareBookingsByDate(first: BookingRecord, second: BookingRecord) {
  const dateComparison = first.date.localeCompare(second.date);
  return dateComparison || bookingTimeToMinutes(first.time) - bookingTimeToMinutes(second.time);
}

export function isTodayBooking(booking: BookingRecord, now = new Date()) {
  return booking.date === getBusinessNow(now).date;
}

export function isUpcomingBooking(booking: BookingRecord, now = new Date()) {
  const businessNow = getBusinessNow(now);
  return (
    booking.date > businessNow.date ||
    (booking.date === businessNow.date && bookingTimeToMinutes(booking.time) >= businessNow.minutes)
  );
}

export function bookingMatchesSearch(booking: BookingRecord, search: string) {
  const normalized = search.trim().toLocaleLowerCase();
  if (!normalized) {
    return true;
  }

  return [booking.name, booking.barber, booking.service, booking.date].some((value) =>
    value.toLocaleLowerCase().includes(normalized),
  );
}

export function filterBookings(
  bookings: BookingRecord[],
  filter: BookingListFilter,
  search: string,
  now = new Date(),
) {
  return bookings.filter(
    (booking) =>
      (filter === 'all' ||
        (filter === 'today' && isTodayBooking(booking, now)) ||
        (filter === 'upcoming' && isUpcomingBooking(booking, now))) &&
      bookingMatchesSearch(booking, search),
  );
}

export function relativeBookingDate(booking: BookingRecord, now = new Date()) {
  const businessNow = getBusinessNow(now);
  if (booking.date === businessNow.date) {
    return 'Today';
  }

  const tomorrow = new Date(`${businessNow.date}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowIso = `${tomorrow.getUTCFullYear()}-${`${tomorrow.getUTCMonth() + 1}`.padStart(2, '0')}-${`${tomorrow.getUTCDate()}`.padStart(2, '0')}`;
  return booking.date === tomorrowIso ? 'Tomorrow' : booking.date;
}
