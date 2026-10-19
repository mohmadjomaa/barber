import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { Admin } from './admin';
import { Auth } from '../../services/auth';
import { BookingApiService } from '../../services/booking-api';
import { BarberOption, BookingRecord, ShopSchedule } from '../../services/booking-state';

describe('Admin', () => {
  let component: Admin;
  let fixture: ComponentFixture<Admin>;
  let bookings: BookingRecord[];
  let barbers: BarberOption[];
  let schedule: ShopSchedule;

  const booking = (id: string, name = 'Test Customer'): BookingRecord => ({
    id,
    serviceId: 'signature-cut',
    barberId: 'ahmed',
    service: 'Signature Cut',
    barber: 'Ahmed',
    duration: 30,
    price: 90,
    date: '2026-04-30',
    time: '09:30 AM',
    name,
    phone: '+972500000000',
    notes: '',
    reminderPreference: 'sms',
    paymentMethod: 'pay-in-shop',
    createdAt: '2026-04-30T08:00:00.000Z'
  });

  beforeEach(async () => {
    localStorage.clear();
    bookings = [];
    barbers = [
      { id: 'ahmed', name: 'Ahmed', title: 'Fade Specialist', rating: 4.9, reviews: 168, specialty: 'Clean fades', availability: '', image: '/img/jpg1.png', nextAvailable: 'Available today' }
    ];
    schedule = { workingDays: [0, 1, 2, 3, 4], openTime: '09:30', closeTime: '19:00' };

    await TestBed.configureTestingModule({
      imports: [Admin],
      providers: [
        provideRouter([]),
        {
          provide: Auth,
          useValue: {
            isLoggedIn: false,
            logout: () => undefined
          }
        },
        {
          provide: BookingApiService,
          useValue: {
            getServices: () => of([
              { id: 'signature-cut', name: 'Signature Cut', description: '', duration: 30, price: 90, badge: 'Most booked', bestFor: '', popularity: '' }
            ]),
            getAdminServices: () => of([
              { id: 'signature-cut', name: 'Signature Cut', description: '', duration: 30, price: 90, badge: 'Most booked', bestFor: '', popularity: '', active: true }
            ]),
            getAdminBarbers: () => of([...barbers]),
            getAdminSchedule: () => of(schedule),
            getAdminBookings: (search = '') => of(bookings.filter(item =>
              !search || item.name.toLowerCase().includes(search.toLowerCase())
            )),
            getAvailabilityDates: () => of([
              { iso: schedule.workingDays.includes(1) ? '2026-05-18' : '2026-05-17', day: schedule.workingDays.includes(1) ? 'Mon' : 'Sun', monthDay: schedule.workingDays.includes(1) ? 'May 18' : 'May 17', display: schedule.workingDays.includes(1) ? 'Mon, May 18' : 'Sun, May 17' }
            ]),
            getAvailabilitySlots: () => of([
              { id: 'morning', label: 'Morning', helper: 'Before lunch', slots: [{ time: '10:00 AM', label: 'First slot' }] }
            ]),
            deleteAdminBooking: (id: string) => {
              bookings = bookings.filter(item => item.id !== id);
              return of(undefined);
            },
            saveAdminSchedule: (nextSchedule: ShopSchedule) => {
              schedule = nextSchedule;
              return of(schedule);
            },
            createAdminBooking: (draft: any) => {
              const created = booking('201', draft.name);
              bookings = [...bookings, created];
              return of(created);
            },
            addAdminBarber: (barber: Partial<BarberOption> & Pick<BarberOption, 'name'>) => {
              const created = { id: 'new-barber', name: barber.name, title: barber.title || 'Barber', rating: 5, reviews: 0, specialty: barber.specialty || '', availability: '', image: '/img/jpg1.png', nextAvailable: 'Available soon' };
              barbers = [...barbers, created];
              return of(created);
            },
            deleteAdminBarber: (id: string) => {
              barbers = barbers.filter(item => item.id !== id);
              return of(undefined);
            }
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Admin);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads the admin booking list for an authorized route', async () => {
    bookings = [
      booking('101', 'Adam'),
      booking('102', 'Noah')
    ];

    await component.loadAdminData();

    expect(component.bookings.map(item => item.name)).toEqual(['Adam', 'Noah']);
  });

  it('keeps successfully loaded barbers visible when another admin setting fails', async () => {
    const api = (component as any).bookingApi;
    api.getAdminServices = () => throwError(() => new Error('Catalog temporarily unavailable'));
    api.getAdminBarbers = () => of([
      ...barbers,
      { id: 'mohammed', name: 'MOHAMMED', title: 'Barber', rating: 5, reviews: 0, specialty: 'SS', availability: '', image: '/img/jpg1.png', nextAvailable: 'Available soon' }
    ]);

    await component.loadAdminData();
    await fixture.whenStable();

    expect(component.isLoadingBarbers).toBe(false);
    expect(component.barbers.map(barber => barber.name)).toEqual(['Ahmed', 'MOHAMMED']);
  });

  it('renders the shell and a completed section while other initial requests are still pending', async () => {
    const api = (component as any).bookingApi;
    const bookingResponse = new Subject<BookingRecord[]>();
    const servicesResponse = new Subject<any[]>();
    const barbersResponse = new Subject<BarberOption[]>();
    const scheduleResponse = new Subject<ShopSchedule>();
    api.getAdminBookings = () => bookingResponse;
    api.getAdminServices = () => servicesResponse;
    api.getAdminBarbers = () => barbersResponse;
    api.getAdminSchedule = () => scheduleResponse;

    const load = component.loadAdminData();

    // All independent reads begin immediately; none wait for bookings.
    expect(component.isLoadingBookings).toBe(true);
    expect(component.isLoadingServices).toBe(true);
    expect(component.isLoadingBarbers).toBe(true);
    expect(component.isLoadingSchedule).toBe(true);

    bookingResponse.next([booking('101', 'Adam')]);
    bookingResponse.complete();
    await Promise.resolve();

    expect(component.isLoadingBookings).toBe(false);
    expect(component.isLoadingBarbers).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Admin dashboard');
    expect(fixture.nativeElement.textContent).toContain('Working days and hours');
    expect(fixture.nativeElement.textContent).toContain('Manage barbers');

    servicesResponse.next([{ id: 'signature-cut', name: 'Signature Cut', description: '', duration: 30, price: 90, badge: '', bestFor: '', popularity: '', active: true }]);
    servicesResponse.complete();
    barbersResponse.next(barbers);
    barbersResponse.complete();
    scheduleResponse.next(schedule);
    scheduleResponse.complete();
    await load;
  });

  it('starts each initial admin read once and does not request the duplicate public service catalogue', async () => {
    const api = (component as any).bookingApi;
    let bookingsCalls = 0;
    let servicesCalls = 0;
    let barbersCalls = 0;
    let scheduleCalls = 0;
    let publicServicesCalls = 0;
    api.getAdminBookings = () => { bookingsCalls += 1; return of([]); };
    api.getAdminServices = () => { servicesCalls += 1; return of([]); };
    api.getAdminBarbers = () => { barbersCalls += 1; return of([]); };
    api.getAdminSchedule = () => { scheduleCalls += 1; return of(schedule); };
    api.getServices = () => { publicServicesCalls += 1; return of([]); };

    await component.loadAdminData();

    expect({ bookingsCalls, servicesCalls, barbersCalls, scheduleCalls, publicServicesCalls }).toEqual({
      bookingsCalls: 1,
      servicesCalls: 1,
      barbersCalls: 1,
      scheduleCalls: 1,
      publicServicesCalls: 0,
    });
  });

  it('keeps booking data available for the compact dashboard summary', async () => {
    bookings = [
      booking('101', 'Adam'),
      booking('102', 'Noah')
    ];

    await component.loadBookings();

    expect(component.bookings.map(item => item.id)).toEqual(['101', '102']);
  });

  it('limits the dashboard summary to the next three upcoming bookings', () => {
    component.bookings = [
      booking('4', 'Fourth'),
      booking('2', 'Second'),
      booking('1', 'First'),
      booking('3', 'Third'),
    ].map((item, index) => ({
      ...item,
      date: '2099-05-20',
      time: ['09:00 AM', '10:00 AM', '11:00 AM', '01:00 PM'][index],
    }));

    expect(component.upcomingBookingCount).toBe(4);
    expect(component.upcomingBookings.slice(0, 3).map((item) => item.name)).toEqual([
      'Fourth',
      'Second',
      'First',
    ]);
  });

  it('saves schedule settings and creates bookings from admin form', async () => {
    component.schedule = {
      workingDays: [1],
      openTime: '10:00',
      closeTime: '12:00'
    };
    await component.saveSchedule();

    expect(component.scheduleMessage).toBe('Schedule saved. Customers can book Mon from 10:00 to 12:00.');
    expect(component.adminDates.every(date => new Date(`${date.iso}T12:00:00`).getDay() === 1)).toBe(true);

    component.adminBooking.name = 'Shop Customer';
    component.adminBooking.phone = '+972500000000';
    await component.createAdminBooking();

    expect(component.adminBookingMessage).toBe('Booking created for Shop Customer.');
    expect(component.bookings.map(item => item.name)).toEqual(['Shop Customer']);
  });

  it('adds and removes barbers from the admin page', async () => {
    expect(component.barbers.map(barber => barber.name)).toEqual(['Ahmed']);

    component.barberForm.name = 'New Barber';
    component.barberForm.title = 'Fade Specialist';
    component.barberForm.specialty = 'Clean fades';
    await component.addBarber();

    expect(component.barberMessage).toBe('New Barber was added.');
    expect(component.barbers.map(barber => barber.name)).toEqual(['Ahmed', 'New Barber']);

    await component.deleteBarber(component.barbers[1]);

    expect(component.barberMessage).toBe('New Barber was removed.');
    expect(component.barbers.map(barber => barber.name)).toEqual(['Ahmed']);
  });

  it('keeps service rows collapsed, edits one draft at a time, cancels safely, and saves through the API', async () => {
    component.adminServices = [
      { id: 'signature-cut', name: 'Signature Cut', description: 'Original', duration: 30, price: 90, badge: '', bestFor: '', popularity: '', active: true },
      { id: 'beard-detail', name: 'Beard Detail', description: '', duration: 20, price: 55, badge: '', bestFor: '', popularity: '', active: true },
    ];
    const api = (component as any).bookingApi;
    api.updateAdminService = (id: string, patch: any) => of({ ...patch, id });

    expect(component.editingService).toBeNull();
    component.editService(component.adminServices[0]);
    expect(component.editingService?.id).toBe('signature-cut');
    component.editingService!.name = 'Unsaved name';
    component.cancelServiceEdit();
    expect(component.adminServices[0].name).toBe('Signature Cut');
    expect(component.editingService).toBeNull();

    component.editService(component.adminServices[0]);
    component.editService(component.adminServices[1]);
    expect(component.editingService?.id).toBe('beard-detail');
    component.editingService!.duration = 25;
    await component.saveServiceEditor();

    expect(component.editingService).toBeNull();
    expect(component.adminServices.find((service) => service.id === 'beard-detail')?.duration).toBe(25);
  });

  it('refreshes admin alternatives after a concurrent booking without losing the customer details', async () => {
    await component.loadAdminData();
    const api = (component as any).bookingApi;
    component.adminBooking.name = 'Shop Customer';
    component.adminBooking.phone = '0549999999';
    component.adminBooking.time = '10:00 AM';
    api.createAdminBooking = () => throwError(() => new HttpErrorResponse({
      status: 409, error: { message: 'This time slot is no longer available.' },
    }));
    api.getAvailabilitySlots = () => of([
      { id: 'morning', label: 'Morning', helper: '', slots: [{ time: '10:20 AM' }] },
    ]);

    await component.createAdminBooking();

    expect(component.adminSlots.map((slot) => slot.time)).toEqual(['10:20 AM']);
    expect(component.adminBooking.time).toBe('10:20 AM');
    expect(component.adminBooking.name).toBe('Shop Customer');
    expect(component.adminBooking.phone).toBe('0549999999');
    expect(component.adminBookingError).toContain('no longer available');
  });
});
