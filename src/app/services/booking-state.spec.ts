import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { BarberOption, BookingRecord, BookingStateService, ServiceOption } from './booking-state';

describe('BookingStateService', () => {
  let service: BookingStateService;

  const services: ServiceOption[] = [{
    id: 'api-service', name: 'API Service', description: '', duration: 30, price: 90,
    badge: '', bestFor: '', popularity: '', active: true, barberIds: ['api-barber'],
  }];
  const barbers: BarberOption[] = [{
    id: 'api-barber', name: 'API Barber', title: '', rating: 5, reviews: 0,
    specialty: '', availability: '', image: '', nextAvailable: '',
  }];
  const booking: BookingRecord = {
    id: 'booking-1', serviceId: 'api-service', barberId: 'api-barber', service: 'API Service',
    barber: 'API Barber', duration: 30, price: 90, date: '2026-09-20', time: '10:00 AM',
    name: 'Customer', phone: '+972500000000', notes: '', reminderPreference: 'sms',
    paymentMethod: 'pay-in-shop', createdAt: '2026-09-18T10:00:00.000Z',
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    service = TestBed.inject(BookingStateService);
  });

  afterEach(() => localStorage.clear());

  it('starts with no business catalogue, barber, schedule, or booking data', () => {
    expect(service.services).toEqual([]);
    expect(service.barbers).toEqual([]);
    expect(service.getLastBooking()).toBeNull();
    expect(service.getSchedule()).toBeNull();
  });

  it('keeps API-fetched business data only in memory', () => {
    service.setServices(services);
    service.setBarbers(barbers);
    service.setBookings([booking]);
    service.setSchedule({ workingDays: [0], openTime: '09:00', closeTime: '18:00' });

    expect(service.getService('api-service')).toEqual(services[0]);
    expect(service.getCompatibleBarbers('api-service')).toEqual(barbers);
    expect(service.getLastBooking()).toEqual(booking);
    expect(service.getSchedule()?.openTime).toBe('09:00');
    expect(localStorage.getItem('bookings')).toBeNull();
    expect(localStorage.getItem('barbers')).toBeNull();
    expect(localStorage.getItem('shopSchedule')).toBeNull();
  });

  it('stores only the customer management reference and token after a confirmed API booking', () => {
    service.storeConfirmedBooking(booking, 'manage-token');

    expect(service.getLastBooking()).toEqual(booking);
    expect(service.getLastBookingId()).toBe('booking-1');
    expect(service.getBookingToken('booking-1')).toBe('manage-token');
    expect(localStorage.getItem('bookings')).toBeNull();
  });

  it('keeps a draft as convenience state without inventing a service or barber', () => {
    service.setServices(services);
    service.setBarbers(barbers);
    const draft = service.prepareQuickBooking({ serviceId: 'api-service', barberPreference: 'specific', barberId: 'api-barber' });

    expect(draft.serviceId).toBe('api-service');
    expect(draft.barberId).toBe('api-barber');
    expect(service.getDraft()).toMatchObject({ serviceId: 'api-service', barberId: 'api-barber' });
  });

  it('formats appointment times for display without changing the stored value', () => {
    expect(service.formatTime('1:00 PM')).toBe('13:00');
    expect(service.formatTime('2:30 PM')).toBe('14:30');
    expect(service.formatTime('9:00 AM')).toBe('09:00');
    expect(service.formatTime('6:00 PM')).toBe('18:00');
    expect(booking.time).toBe('10:00 AM');
  });
});
