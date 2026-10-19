import { formatDate } from '@angular/common';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { LanguageService } from './language';

export interface ServiceOption { id: string; name: string; description: string; duration: number; price: number; badge: string; bestFor: string; popularity: string; barberIds?: string[]; active: boolean; }
export interface BarberOption { id: string; name: string; title: string; rating: number; reviews: number; specialty: string; availability: string; image: string; nextAvailable: string; }
export interface BookingDraft { serviceId: string | null; barberId: string | null; barberPreference: 'any' | 'specific'; date: string; time: string; name: string; phone: string; notes: string; reminderPreference: 'sms' | 'whatsapp' | 'email'; paymentMethod: 'pay-in-shop' | 'deposit'; }
export interface BookingRecord { id: string; serviceId: string; barberId: string; service: string; barber: string; duration: number; price: number; date: string; time: string; name: string; phone: string; notes: string; reminderPreference: 'sms' | 'whatsapp' | 'email'; paymentMethod: 'pay-in-shop' | 'deposit'; status?: 'active' | 'cancelled'; createdAt: string; updatedAt?: string; }
export interface TimeSlotGroup { id: string; label: string; helper: string; slots: TimeSlotOption[]; }
export interface TimeSlotOption { time: string; label?: string; disabled?: boolean; scarcity?: string; barberId?: string; barberName?: string; }
export interface AvailabilityDateOption { iso: string; day: string; monthDay: string; display: string; hasSlots?: boolean; closed?: boolean; }
export interface ShopSchedule { workingDays: number[]; openTime: string; closeTime: string; }
export interface AdminBookingDraft { serviceId: string; barberId: string; date: string; time: string; name: string; phone: string; notes: string; }

@Injectable({ providedIn: 'root' })
export class BookingStateService {
  // يُستخدم تخزين المتصفح فقط لراحة العميل ورمز إدارة الحجز.
  // تأتي الخدمات والحلاقون والجدول والحجوزات دائماً من API.
  private readonly draftKey = 'bookingDraft';
  private readonly eventsKey = 'bookingEvents';
  private readonly bookingTokensKey = 'bookingTokens';
  private bookingsCache: BookingRecord[] = [];
  private catalogServices: ServiceOption[] = [];
  private barbersCache: BarberOption[] = [];
  private scheduleCache: ShopSchedule | null = null;

  get services(): ServiceOption[] { return this.catalogServices; }
  get barbers(): BarberOption[] { return this.barbersCache; }

  constructor(private router: Router, private language: LanguageService) {}

  setServices(services: ServiceOption[]) {
    this.catalogServices = services.map((service) => ({ ...service, active: service.active !== false }));
  }

  setBarbers(barbers: BarberOption[]) { this.barbersCache = barbers.map((barber) => ({ ...barber })); }
  setBookings(bookings: BookingRecord[]) { this.bookingsCache = bookings.map((booking) => ({ ...booking })); }

  setSchedule(schedule: ShopSchedule) {
    this.scheduleCache = { ...schedule, workingDays: [...schedule.workingDays] };
  }

  getSchedule() {
    return this.scheduleCache ? { ...this.scheduleCache, workingDays: [...this.scheduleCache.workingDays] } : null;
  }

  storeConfirmedBooking(booking: BookingRecord, manageToken: string) {
    this.setBookings([...this.bookingsCache.filter((item) => item.id !== booking.id), booking]);
    localStorage.setItem('customerName', booking.name);
    localStorage.setItem('customerPhone', booking.phone);
    localStorage.setItem('reminderPreference', booking.reminderPreference);
    localStorage.setItem('lastBookingId', booking.id);
    this.storeBookingToken(booking.id, manageToken);
    this.clearDraft();
  }

  storeBookingToken(bookingId: string, manageToken: string) {
    const tokens = this.getBookingTokens();
    tokens[bookingId] = manageToken;
    localStorage.setItem(this.bookingTokensKey, JSON.stringify(tokens));
  }

  getBookingToken(bookingId: string | null | undefined) { return bookingId ? this.getBookingTokens()[bookingId] || '' : ''; }
  getLastBookingId() { return localStorage.getItem('lastBookingId'); }

  clearBookingReference(bookingId: string) {
    this.bookingsCache = this.bookingsCache.filter((booking) => booking.id !== bookingId);
    const tokens = this.getBookingTokens();
    delete tokens[bookingId];
    localStorage.setItem(this.bookingTokensKey, JSON.stringify(tokens));
    if (this.getLastBookingId() === bookingId) localStorage.removeItem('lastBookingId');
  }

  getDefaultDraft(): BookingDraft {
    return {
      serviceId: null, barberId: null, barberPreference: 'any', date: '', time: '',
      name: localStorage.getItem('customerName') || '', phone: localStorage.getItem('customerPhone') || '', notes: '',
      reminderPreference: (localStorage.getItem('reminderPreference') as BookingDraft['reminderPreference']) || 'sms',
      paymentMethod: 'pay-in-shop',
    };
  }

  getDraft(): BookingDraft {
    try {
      const stored = localStorage.getItem(this.draftKey);
      return stored ? { ...this.getDefaultDraft(), ...JSON.parse(stored) } : this.getDefaultDraft();
    } catch { return this.getDefaultDraft(); }
  }

  saveDraft(patch: Partial<BookingDraft>) { localStorage.setItem(this.draftKey, JSON.stringify({ ...this.getDraft(), ...patch })); }

  prepareQuickBooking(patch: Partial<BookingDraft> = {}) {
    const draft = { ...this.getDraft(), ...patch };
    const serviceId = this.getService(draft.serviceId)?.id || null;
    const barberId = draft.barberPreference === 'specific' && this.canBarberPerformService(serviceId, draft.barberId)
      ? draft.barberId : null;
    const nextDraft: BookingDraft = { ...draft, serviceId, barberPreference: barberId ? 'specific' : 'any', barberId, date: patch.date ?? draft.date ?? '', time: patch.time ?? draft.time ?? '' };
    this.saveDraft(nextDraft);
    return nextDraft;
  }

  clearDraft() { localStorage.removeItem(this.draftKey); }
  startNewBooking(patch: Partial<BookingDraft> = {}) { this.clearDraft(); return this.prepareQuickBooking(patch); }
  getService(serviceId: string | null) { return this.services.find((service) => service.id === serviceId) || null; }
  getBarber(barberId: string | null) { return this.barbers.find((barber) => barber.id === barberId) || null; }

  getCompatibleBarbers(serviceId: string | null) {
    const service = this.getService(serviceId);
    return service?.barberIds?.length ? this.barbers.filter((barber) => service.barberIds?.includes(barber.id)) : this.barbers;
  }

  canBarberPerformService(serviceId: string | null, barberId: string | null) {
    return !!barberId && this.getCompatibleBarbers(serviceId).some((barber) => barber.id === barberId);
  }

  getLastBooking(): BookingRecord | null { return this.bookingsCache.at(-1) || null; }

  applyLastBooking() {
    const booking = this.getLastBooking();
    if (!booking) return false;
    this.saveDraft({ serviceId: booking.serviceId, barberId: booking.barberId, barberPreference: 'specific', name: booking.name, phone: booking.phone, notes: booking.notes, reminderPreference: booking.reminderPreference || 'sms', paymentMethod: booking.paymentMethod || 'pay-in-shop', date: '', time: '' });
    this.router.navigate(['/services']);
    return true;
  }

  formatDate(date: string) {
    return this.formatCalendarDate(date, 'EEE, d MMM');
  }

  formatDateWeekday(date: string) {
    return this.formatCalendarDate(date, 'EEE');
  }

  formatDateMonthDay(date: string) {
    return this.formatCalendarDate(date, 'd MMM');
  }

  formatTime(time: string) {
    const value = time.trim();
    const twelveHour = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    const twentyFourHour = value.match(/^(\d{1,2}):(\d{2})$/);
    const match = twelveHour || twentyFourHour;

    if (!match) {
      return time;
    }

    let hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (minutes > 59 || (twelveHour && (hours < 1 || hours > 12)) || (!twelveHour && hours > 23)) {
      return time;
    }

    if (twelveHour) {
      hours %= 12;
      if (match[3].toUpperCase() === 'PM') {
        hours += 12;
      }
    }

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  formatTimeSectionLabel(group: Pick<TimeSlotGroup, 'id' | 'label'>) {
    if (this.language.language() !== 'he') {
      return group.label;
    }

    const labels: Record<string, string> = {
      morning: 'בוקר',
      afternoon: 'צהריים',
      evening: 'ערב',
    };
    return labels[group.id] || this.language.text(group.label);
  }

  track(event: string, payload: Record<string, string | number | boolean | null> = {}) {
    let history: Array<Record<string, unknown>> = [];
    try { history = JSON.parse(localStorage.getItem(this.eventsKey) || '[]'); } catch { history = []; }
    history.push({ event, payload, at: new Date().toISOString() });
    localStorage.setItem(this.eventsKey, JSON.stringify(history));
  }

  private getBookingTokens(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem(this.bookingTokensKey) || '{}'); } catch { return {}; }
  }

  private formatCalendarDate(date: string, pattern: string) {
    if (!date) {
      return '';
    }

    return formatDate(
      `${date}T12:00:00Z`,
      pattern,
      this.language.language() === 'he' ? 'he-IL' : 'en-US',
      'UTC',
    );
  }
}
