import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { AdminBookings } from './admin-bookings';
import { routes } from '../../app.routes';
import { adminAuthGuard } from '../../services/admin-auth.guard';
import { Auth } from '../../services/auth';
import { BookingApiService } from '../../services/booking-api';
import { BookingRecord } from '../../services/booking-state';

describe('AdminBookings', () => {
  let component: AdminBookings;
  let fixture: ComponentFixture<AdminBookings>;
  let bookings: BookingRecord[];
  let api: { getAdminBookings: ReturnType<typeof vi.fn>; deleteAdminBooking: ReturnType<typeof vi.fn> };

  const booking = (id: string, overrides: Partial<BookingRecord> = {}): BookingRecord => ({
    id,
    serviceId: 'signature-cut',
    barberId: 'ahmed',
    service: 'Signature Cut',
    barber: 'Ahmed',
    duration: 30,
    price: 90,
    date: '2026-05-20',
    time: '09:30 AM',
    name: `Customer ${id}`,
    phone: '+972500000000',
    notes: '',
    reminderPreference: 'sms',
    paymentMethod: 'pay-in-shop',
    createdAt: '2026-05-19T08:00:00.000Z',
    ...overrides,
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T08:00:00Z'));
    bookings = [];
    api = {
      getAdminBookings: vi.fn(() => of([...bookings])),
      deleteAdminBooking: vi.fn((id: string) => {
        bookings = bookings.filter((item) => item.id !== id);
        return of(undefined);
      }),
    };

    await TestBed.configureTestingModule({
      imports: [AdminBookings],
      providers: [
        provideRouter([]),
        { provide: BookingApiService, useValue: api },
        { provide: Auth, useValue: { logout: vi.fn(), isLoggedIn: true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminBookings);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => vi.useRealTimers());

  it('uses the same Admin guard as the dashboard route', () => {
    const route = routes.find((item) => item.path === 'admin/bookings');
    expect(route?.canActivate).toContain(adminAuthGuard);
  });

  it('filters, searches, sorts, and paginates the complete booking list before display', async () => {
    bookings = Array.from({ length: 55 }, (_, index) =>
      booking(`${index + 1}`, {
        date: index === 0 ? '2026-05-19' : '2026-05-20',
        time: `${`${9 + (index % 8)}`.padStart(2, '0')}:30 AM`,
        name: index === 31 ? 'Mohammed' : `Customer ${index + 1}`,
        barber: index % 2 ? 'Sami' : 'Ahmed',
      }),
    );
    await component.loadBookings();

    component.setFilter('all');
    expect(component.pageCount).toBe(6);
    expect(component.pageBookings).toHaveLength(10);
    component.goToPage(6);
    expect(component.pageBookings).toHaveLength(5);

    component.updateSearch();
    component.searchText = 'mohammed';
    component.updateSearch();
    expect(component.filteredBookings.map((item) => item.name)).toEqual(['Mohammed']);

    component.searchText = '';
    component.setFilter('today');
    expect(component.filteredBookings.map((item) => item.date)).toEqual(['2026-05-19']);
    component.setFilter('all');
    component.sortBy('customer');
    expect(component.filteredBookings[0].name).toBe('Customer 1');
  });

  it('keeps compact pages for 0, 3, 10, and 20 bookings', async () => {
    for (const count of [0, 3, 10, 20]) {
      bookings = Array.from({ length: count }, (_, index) => booking(`${index + 1}`));
      await component.loadBookings();
      component.setFilter('all');

      expect(component.pageBookings).toHaveLength(Math.min(count, 10));
      expect(component.pageCount).toBe(Math.max(1, Math.ceil(count / 10)));
    }
  });

  it('requires confirmation, cancels from the full list, and refreshes pagination', async () => {
    bookings = Array.from({ length: 11 }, (_, index) => booking(`${index + 1}`));
    await component.loadBookings();
    component.setFilter('all');
    component.goToPage(2);
    const confirm = vi.spyOn(window, 'confirm');
    confirm.mockReturnValue(false);
    await component.cancelBooking(component.pageBookings[0]);
    expect(api.deleteAdminBooking).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await component.cancelBooking(component.pageBookings[0]);

    expect(api.deleteAdminBooking).toHaveBeenCalledWith('11');
    expect(component.bookings).toHaveLength(10);
    expect(component.page).toBe(1);
    expect(component.actionMessage).toContain('cancelled');
  });
});
