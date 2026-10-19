import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { Home } from './home';
import { BookingApiService } from '../../services/booking-api';
import { BookingStateService } from '../../services/booking-state';

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideRouter([]),
        { provide: BookingApiService, useValue: { getServices: () => NEVER, getBarbers: () => NEVER, getAvailabilityDates: () => NEVER, getAvailabilitySlots: () => NEVER } },
      ],
    }).compileComponents();
    const bookingState = TestBed.inject(BookingStateService);
    bookingState.setServices([
      { id: 'signature-cut', name: 'Signature Cut', description: '', duration: 30, price: 90, badge: '', bestFor: '', popularity: '', active: true },
      { id: 'beard-detail', name: 'Beard Detail', description: '', duration: 20, price: 55, badge: '', bestFor: '', popularity: '', active: true },
      { id: 'full-grooming', name: 'Full Grooming', description: '', duration: 45, price: 135, badge: '', bestFor: '', popularity: '', active: true },
      { id: 'wash-style', name: 'Wash and Style', description: '', duration: 30, price: 70, badge: '', bestFor: '', popularity: '', active: true },
    ]);
    bookingState.setBarbers([{ id: 'ahmed', name: 'Ahmed', title: 'Fade Specialist', rating: 4.9, reviews: 168, specialty: 'Clean fades', availability: '', image: '/img/jpg1.png', nextAvailable: 'Available today' }]);
    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows a focused booking CTA and only three service previews', () => {
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.hero-button')?.textContent).toContain('Book Appointment');
    expect(element.querySelectorAll('.service-card')).toHaveLength(3);
  });

  it('starts a new booking with the fastest available barber preference', () => {
    const startNewBooking = vi.spyOn((component as any).bookingState, 'startNewBooking');
    component.startBooking();
    expect(startNewBooking).toHaveBeenCalledWith({ barberPreference: 'any' });
  });

  it('shows the shop phone number with a dialable telephone link', () => {
    const phoneLink = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a[href^="tel:"]');

    expect(phoneLink?.textContent?.trim()).toBe('+972 54 994 9132');
    expect(phoneLink?.getAttribute('href')).toBe('tel:+972549949132');
  });

  it('shows each service next appointment and the earliest overall across open days', async () => {
    const api = TestBed.inject(BookingApiService);
    const state = TestBed.inject(BookingStateService);
    api.getServices = vi.fn(() => of(state.services));
    api.getBarbers = vi.fn(() => of(state.barbers));
    api.getAvailabilityDates = vi.fn(() => of([
      { iso: '2026-05-19', day: 'Tue', monthDay: 'May 19', display: 'Tue, May 19', hasSlots: false, closed: true },
      { iso: '2026-05-20', day: 'Wed', monthDay: 'May 20', display: 'Wed, May 20', hasSlots: true, closed: false },
    ]));
    api.getAvailabilitySlots = vi.fn((input) => of([
      { id: 'morning', label: 'Morning', helper: '', slots: [
        { time: input.serviceId === 'beard-detail' ? '09:20 AM' : '10:00 AM' },
      ] },
    ]));

    await component.ngOnInit();
    fixture.detectChanges();

    expect(api.getAvailabilityDates).toHaveBeenCalledWith({
      days: 14, serviceId: 'beard-detail', barberPreference: 'any',
    });
    expect(component.nextSlot).toEqual({ date: '2026-05-20', time: '09:20 AM' });
    expect(component.serviceNextSlots['signature-cut'].time).toBe('10:00 AM');
    expect(component.serviceNextSlots['beard-detail'].time).toBe('09:20 AM');
    expect(fixture.nativeElement.querySelectorAll('.service-next-slot')).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('.availability-line').textContent).toContain('09:20');
  });

  it('continues past a day that fills up and keeps other previews when one service fails', async () => {
    const api = TestBed.inject(BookingApiService);
    const state = TestBed.inject(BookingStateService);
    api.getServices = vi.fn(() => of(state.services));
    api.getBarbers = vi.fn(() => of(state.barbers));
    api.getAvailabilityDates = vi.fn((input) => {
      if (typeof input !== 'number' && input?.serviceId === 'signature-cut') {
        return throwError(() => new Error('Temporary catalog error'));
      }
      return of([
        { iso: '2026-05-20', day: 'Wed', monthDay: 'May 20', display: 'Wed, May 20', hasSlots: true },
        { iso: '2026-05-21', day: 'Thu', monthDay: 'May 21', display: 'Thu, May 21', hasSlots: true },
      ]);
    });
    api.getAvailabilitySlots = vi.fn((input) => of(input.date === '2026-05-20' ? [] : [
      { id: 'morning', label: 'Morning', helper: '', slots: [{ time: '09:00 AM' }] },
    ]));

    await component.ngOnInit();

    expect(component.serviceNextSlots['signature-cut']).toBeUndefined();
    expect(component.serviceNextSlots['beard-detail']).toEqual({ date: '2026-05-21', time: '09:00 AM' });
    expect(component.nextSlot.date).toBe('2026-05-21');
  });
});
