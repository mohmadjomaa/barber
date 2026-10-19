import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { Services } from './services';
import { BookingApiService } from '../../services/booking-api';

describe('Services', () => {
  let component: Services;
  let fixture: ComponentFixture<Services>;
  let bookingApi: {
    getServices: ReturnType<typeof vi.fn>;
    getBarbers: ReturnType<typeof vi.fn>;
    getAvailabilityDates: ReturnType<typeof vi.fn>;
    getAvailabilitySlots: ReturnType<typeof vi.fn>;
    createBooking: ReturnType<typeof vi.fn>;
  };

  const serviceOptions = [
    {
      id: 'signature-cut',
      name: 'Signature Cut',
      description: '',
      duration: 30,
      price: 90,
      badge: 'Most booked',
      bestFor: '',
      popularity: '',
    },
    {
      id: 'beard-detail',
      name: 'Beard Detail',
      description: '',
      duration: 20,
      price: 55,
      badge: 'Fast option',
      bestFor: '',
      popularity: '',
    },
  ];
  const barberOptions = [
    {
      id: 'ahmed',
      name: 'Ahmed',
      title: 'Fade Specialist',
      rating: 4.9,
      reviews: 168,
      specialty: '',
      availability: '',
      image: '/img/jpg1.png',
      nextAvailable: 'Available today',
    },
  ];
  const dateOptions = [
    { iso: '2026-05-20', day: 'Wed', monthDay: 'May 20', display: 'Wed, May 20', hasSlots: true },
  ];
  const slotGroups = [
    {
      id: 'morning',
      label: 'Morning',
      helper: 'Before lunch',
      slots: [{ time: '10:00 AM', label: 'First slot', barberId: 'ahmed', barberName: 'Ahmed' }],
    },
  ];

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T08:00:00Z'));
    localStorage.clear();

    bookingApi = {
      getServices: vi.fn(() => of(serviceOptions)),
      getBarbers: vi.fn(() => of(barberOptions)),
      getAvailabilityDates: vi.fn(() => of(dateOptions)),
      getAvailabilitySlots: vi.fn(() => of(slotGroups)),
      createBooking: vi.fn(() =>
        of({
          booking: {
            id: 'booking-1',
            serviceId: 'signature-cut',
            barberId: 'ahmed',
            service: 'Signature Cut',
            barber: 'Ahmed',
            duration: 30,
            price: 90,
            date: '2026-05-20',
            time: '10:00 AM',
            name: 'Test Customer',
            phone: '0549999999',
            notes: '',
            reminderPreference: 'sms',
            paymentMethod: 'pay-in-shop',
            createdAt: '2026-05-19T08:00:00.000Z',
          },
          manageToken: 'token-1',
        }),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [Services],
      providers: [provideRouter([]), { provide: BookingApiService, useValue: bookingApi }],
    }).compileComponents();

    fixture = TestBed.createComponent(Services);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('starts with service selection and a three-step progress indicator', () => {
    expect(component.activePanel).toBe('service');
    expect(component.currentStep).toBe(1);
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.booking-stepper .step'),
    ).toHaveLength(3);
  });

  it('completes service, time, details, and confirmation in that order', async () => {
    const navigateSpy = vi.spyOn((component as any).router, 'navigate');

    await component.selectService(component.services[0]);
    expect(component.activePanel).toBe('time');
    expect(component.draft.barberPreference).toBe('any');

    await component.chooseTime('10:00 AM');
    expect(component.activePanel).toBe('profile');
    expect(component.currentStep).toBe(2);

    component.draft.name = 'Test Customer';
    component.draft.phone = '0549999999';
    component.continueProfile();
    expect(component.activePanel).toBe('confirm');
    expect(component.currentStep).toBe(3);

    await component.confirmBooking();
    expect(bookingApi.createBooking).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/success']);
  });

  it('keeps only ten digits in the customer phone number and requires the 05 prefix', () => {
    component.onPhoneInput('05a123456789');

    expect(component.draft.phone).toBe('0512345678');
    expect(component.profileErrors['phone']).toBeUndefined();

    component.onPhoneInput('0412345678');

    expect(component.profileErrors['phone']).toBe('Enter a valid phone number.');
  });

  it('does not continue from customer details with an invalid phone number', () => {
    component.activePanel = 'profile';
    component.draft.name = 'Test Customer';
    component.onPhoneInput('051234567');

    component.continueProfile();

    expect(component.activePanel).toBe('profile');
    expect(component.profileErrors['phone']).toBe('Enter a valid phone number.');
  });

  it('lets the customer choose a specific barber as an optional change', async () => {
    await component.selectService(component.services[0]);
    component.editBarber();
    expect(component.activePanel).toBe('barber');

    await component.selectBarber(component.barbers[0]);

    expect(component.activePanel).toBe('time');
    expect(component.draft.barberPreference).toBe('specific');
    expect(bookingApi.getAvailabilitySlots).toHaveBeenLastCalledWith({
      date: '2026-05-20',
      barberId: 'ahmed',
      serviceId: 'signature-cut',
      barberPreference: 'specific',
    });
  });

  it('clears the selected time when a changed service has no matching availability', async () => {
    await component.selectService(component.services[0]);
    component.draft.time = '10:00 AM';
    component.timeConfirmed = true;
    bookingApi.getAvailabilitySlots.mockReturnValueOnce(of([]));

    await component.selectService(component.services[1]);

    expect(component.draft.time).toBe('');
    expect(component.timeConfirmed).toBe(false);
  });

  it('shows a clear error when booking data cannot load', async () => {
    bookingApi.getServices.mockReturnValueOnce(throwError(() => new Error('Network unavailable')));

    await (component as any).loadBookingData();

    expect(component.bookingError).toContain('could not load available appointments');
  });

  it('shows a clear error when the available times cannot load', async () => {
    bookingApi.getAvailabilitySlots.mockReturnValueOnce(
      throwError(() => new Error('Network unavailable')),
    );

    await component.selectService(component.services[0]);

    expect(component.bookingError).toContain('could not load available times');
    expect(component.timeConfirmed).toBe(false);
  });

  it('does not select a day marked as full', async () => {
    component.dates = [
      { iso: '2026-05-20', day: 'Wed', monthDay: 'May 20', display: 'Wed, May 20', hasSlots: true },
      {
        iso: '2026-05-21',
        day: 'Thu',
        monthDay: 'May 21',
        display: 'Thu, May 21',
        hasSlots: false,
      },
    ];
    component.draft.date = '2026-05-20';

    await component.pickDate('2026-05-21');

    expect(component.draft.date).toBe('2026-05-20');
  });

  it('fetches slots for a selected day without recalculating the entire date strip', async () => {
    component.dates = [
      { iso: '2026-05-20', day: 'Wed', monthDay: 'May 20', display: 'Wed, May 20', hasSlots: true },
      { iso: '2026-05-21', day: 'Thu', monthDay: 'May 21', display: 'Thu, May 21', hasSlots: true },
    ];
    bookingApi.getAvailabilityDates.mockClear();

    await component.pickDate('2026-05-21');

    expect(bookingApi.getAvailabilityDates).not.toHaveBeenCalled();
    expect(bookingApi.getAvailabilitySlots).toHaveBeenLastCalledWith({
      date: '2026-05-21',
      serviceId: component.draft.serviceId,
      barberId: component.draft.barberId,
      barberPreference: component.draft.barberPreference,
    });
  });

  it('uses the correct slots for Friday, Saturday, then Friday again', async () => {
    const friday = '2026-05-22';
    const saturday = '2026-05-23';
    const slotsForFriday = [
      { id: 'morning', label: 'Morning', helper: '', slots: [{ time: '10:00 AM' }] },
    ];
    const slotsForSaturday = [
      { id: 'afternoon', label: 'Afternoon', helper: '', slots: [{ time: '02:00 PM' }] },
    ];

    component.dates = [
      { iso: friday, day: 'Fri', monthDay: 'May 22', display: 'Fri, May 22', hasSlots: true },
      { iso: saturday, day: 'Sat', monthDay: 'May 23', display: 'Sat, May 23', hasSlots: true },
    ];
    (component as any).clearAvailabilityCache();
    bookingApi.getAvailabilitySlots.mockImplementation((request: { date: string }) =>
      of(request.date === friday ? slotsForFriday : slotsForSaturday),
    );
    bookingApi.getAvailabilitySlots.mockClear();

    await component.pickDate(friday);
    expect(component.draft.date).toBe(friday);
    expect(component.slotGroups).toEqual(slotsForFriday);

    await component.pickDate(saturday);
    expect(component.draft.date).toBe(saturday);
    expect(component.slotGroups).toEqual(slotsForSaturday);

    // نطلب الجمعة ثانيةً من الشبكة لا من الذاكرة المؤقتة كي نتحقق من تاريخ
    // الطلب الثالث نفسه، وليس فقط من مفتاح الـcache.
    (component as any).clearAvailabilityCache();
    await component.pickDate(friday);

    expect(component.draft.date).toBe(friday);
    expect(component.slotGroups).toEqual(slotsForFriday);
    expect(bookingApi.getAvailabilitySlots).toHaveBeenNthCalledWith(1, {
      date: friday,
      serviceId: component.draft.serviceId,
      barberId: component.draft.barberId,
      barberPreference: component.draft.barberPreference,
    });
    expect(bookingApi.getAvailabilitySlots).toHaveBeenNthCalledWith(2, {
      date: saturday,
      serviceId: component.draft.serviceId,
      barberId: component.draft.barberId,
      barberPreference: component.draft.barberPreference,
    });
    expect(bookingApi.getAvailabilitySlots).toHaveBeenNthCalledWith(3, {
      date: friday,
      serviceId: component.draft.serviceId,
      barberId: component.draft.barberId,
      barberPreference: component.draft.barberPreference,
    });
  });

  it('starts date and selected-slot requests together when the service changes', async () => {
    const dates = new Subject<any>();
    const slots = new Subject<any>();
    (component as any).clearAvailabilityCache();
    bookingApi.getAvailabilityDates.mockReturnValueOnce(dates);
    bookingApi.getAvailabilitySlots.mockReturnValueOnce(slots);

    const refresh = (component as any).refreshAvailability(true);

    expect(bookingApi.getAvailabilityDates).toHaveBeenCalled();
    expect(bookingApi.getAvailabilitySlots).toHaveBeenCalled();

    dates.next(dateOptions);
    dates.complete();
    slots.next(slotGroups);
    slots.complete();
    await refresh;
  });

  it('renders a fresh cached day without making another slots request', async () => {
    (component as any).clearAvailabilityCache();
    bookingApi.getAvailabilitySlots.mockClear();

    await (component as any).refreshAvailability(false);
    expect(bookingApi.getAvailabilitySlots).toHaveBeenCalledTimes(1);

    await (component as any).refreshAvailability(false);
    expect(bookingApi.getAvailabilitySlots).toHaveBeenCalledTimes(1);
  });

  it('does not let a pre-invalidation response overwrite fresh cached slots', async () => {
    const staleResponse = new Subject<any>();
    const freshResponse = new Subject<any>();
    const staleSlots = [
      { id: 'morning', label: 'Morning', helper: '', slots: [{ time: '10:00 AM' }] },
    ];
    const freshSlots = [
      { id: 'afternoon', label: 'Afternoon', helper: '', slots: [{ time: '02:00 PM' }] },
    ];
    const request = {
      date: '2026-05-20',
      serviceId: component.draft.serviceId,
      barberId: component.draft.barberId,
      barberPreference: component.draft.barberPreference,
    };

    (component as any).clearAvailabilityCache();
    bookingApi.getAvailabilitySlots.mockImplementationOnce(() => staleResponse);
    bookingApi.getAvailabilitySlots.mockImplementationOnce(() => freshResponse);
    bookingApi.getAvailabilitySlots.mockClear();

    const requestBeforeInvalidation = (component as any).getSlotGroupsCached(request);
    (component as any).clearAvailabilityCache();
    const requestAfterInvalidation = (component as any).getSlotGroupsCached(request);

    freshResponse.next(freshSlots);
    freshResponse.complete();
    await requestAfterInvalidation;

    staleResponse.next(staleSlots);
    staleResponse.complete();
    await requestBeforeInvalidation;

    expect(await (component as any).getSlotGroupsCached(request)).toEqual(freshSlots);
    expect(bookingApi.getAvailabilitySlots).toHaveBeenCalledTimes(2);
  });

  it('keeps the newest day slots when an older availability request finishes last', async () => {
    const dayA = '2026-05-20';
    const dayB = '2026-05-21';
    const dayASlots = new Subject<any>();
    const dayBSlots = new Subject<any>();
    const slotsForDayA = [
      {
        id: 'morning',
        label: 'Morning',
        helper: '',
        slots: [{ time: '10:00 AM' }, { time: '10:45 AM' }],
      },
    ];
    const slotsForDayB = [
      { id: 'afternoon', label: 'Afternoon', helper: '', slots: [{ time: '02:00 PM' }] },
    ];

    // نتحكم في رد كل طلب شبكة بشكل مستقل هنا، لذلك نمسح النسخة المؤقتة الناتجة عن
    // التحميل الأول في إعداد الاختبار حتى نتحقق من ترتيب الردود بدقة.
    (component as any).clearAvailabilityCache();

    component.dates = [
      { iso: dayA, day: 'Wed', monthDay: 'May 20', display: 'Wed, May 20', hasSlots: true },
      { iso: dayB, day: 'Thu', monthDay: 'May 21', display: 'Thu, May 21', hasSlots: true },
    ];
    bookingApi.getAvailabilitySlots.mockImplementation((request: { date: string }) =>
      request.date === dayA ? dayASlots : dayBSlots,
    );

    component.draft.date = dayA;
    const firstDayRequest = (component as any).refreshAvailability(false);
    component.draft.date = dayB;
    const secondDayRequest = (component as any).refreshAvailability(false);

    dayBSlots.next(slotsForDayB);
    await secondDayRequest;
    dayASlots.next(slotsForDayA);
    await firstDayRequest;

    expect(component.draft.date).toBe(dayB);
    expect(component.slotGroups).toEqual(slotsForDayB);

    component.draft.date = dayA;
    const returnToFirstDay = (component as any).refreshAvailability(false);
    dayASlots.next(slotsForDayA);
    await returnToFirstDay;

    expect(component.draft.date).toBe(dayA);
    expect(component.slotGroups).toEqual(slotsForDayA);
  });

  it('keeps the final day after ten rapid date changes and out-of-order responses', async () => {
    const friday = '2026-05-22';
    const saturday = '2026-05-23';
    const fridayResponse = new Subject<any>();
    const saturdayResponse = new Subject<any>();
    const fridaySlots = [
      { id: 'morning', label: 'Morning', helper: '', slots: [{ time: '10:00 AM' }] },
    ];
    const saturdaySlots = [
      { id: 'afternoon', label: 'Afternoon', helper: '', slots: [{ time: '02:00 PM' }] },
    ];

    component.dates = [
      { iso: friday, day: 'Fri', monthDay: 'May 22', display: 'Fri, May 22', hasSlots: true },
      { iso: saturday, day: 'Sat', monthDay: 'May 23', display: 'Sat, May 23', hasSlots: true },
    ];
    (component as any).clearAvailabilityCache();
    bookingApi.getAvailabilitySlots.mockImplementation((request: { date: string }) =>
      request.date === friday ? fridayResponse : saturdayResponse,
    );

    const requests = Array.from({ length: 5 }, () => [friday, saturday]).flatMap(
      (dates) => dates.map((date) => component.pickDate(date)),
    );

    // السبت هو آخر اختيار. يصل أولًا، ثم يصل رد الجمعة القديم متأخرًا.
    saturdayResponse.next(saturdaySlots);
    saturdayResponse.complete();
    fridayResponse.next(fridaySlots);
    fridayResponse.complete();
    await Promise.all(requests);

    expect(component.draft.date).toBe(saturday);
    expect(component.slotGroups).toEqual(saturdaySlots);
    expect(component.isLoadingAvailability).toBe(false);
  });

  it('does not let an old request error change the latest request loading or error state', async () => {
    const friday = '2026-05-22';
    const saturday = '2026-05-23';
    const fridayResponse = new Subject<any>();
    const saturdayResponse = new Subject<any>();
    const saturdaySlots = [
      { id: 'afternoon', label: 'Afternoon', helper: '', slots: [{ time: '02:00 PM' }] },
    ];

    component.dates = [
      { iso: friday, day: 'Fri', monthDay: 'May 22', display: 'Fri, May 22', hasSlots: true },
      { iso: saturday, day: 'Sat', monthDay: 'May 23', display: 'Sat, May 23', hasSlots: true },
    ];
    (component as any).clearAvailabilityCache();
    bookingApi.getAvailabilitySlots.mockImplementation((request: { date: string }) =>
      request.date === friday ? fridayResponse : saturdayResponse,
    );

    const fridayRequest = component.pickDate(friday);
    const saturdayRequest = component.pickDate(saturday);

    fridayResponse.error(new Error('Friday failed after Saturday was selected'));
    await fridayRequest;

    expect(component.isLoadingAvailability).toBe(true);
    expect(component.bookingError).toBe('');

    saturdayResponse.next(saturdaySlots);
    saturdayResponse.complete();
    await saturdayRequest;

    expect(component.slotGroups).toEqual(saturdaySlots);
    expect(component.isLoadingAvailability).toBe(false);
    expect(component.bookingError).toBe('');
  });

  it('refreshes the calendar and alternatives after a booking conflict and keeps the explanation visible', async () => {
    await component.selectService(component.services[0]);
    await component.chooseTime('10:00 AM');
    component.draft.name = 'Test Customer';
    component.draft.phone = '0549999999';
    component.continueProfile();
    bookingApi.createBooking.mockReturnValueOnce(throwError(() => new HttpErrorResponse({
      status: 409, error: { message: 'This time slot is no longer available.' },
    })));
    const nextDate = { iso: '2026-05-21', day: 'Thu', monthDay: 'May 21', display: 'Thu, May 21', hasSlots: true };
    const alternatives = [{ id: 'morning', label: 'Morning', helper: '', slots: [{ time: '10:20 AM' }] }];
    bookingApi.getAvailabilityDates.mockReturnValueOnce(of([
      { ...dateOptions[0], hasSlots: false }, nextDate,
    ]));
    bookingApi.getAvailabilitySlots.mockImplementation((input) =>
      of(input.date === nextDate.iso ? alternatives : []),
    );
    bookingApi.getAvailabilityDates.mockClear();

    await component.confirmBooking();

    expect(bookingApi.getAvailabilityDates).toHaveBeenCalled();
    expect(component.draft.date).toBe(nextDate.iso);
    expect(component.slotGroups).toEqual(alternatives);
    expect(component.draft.time).toBe('10:20 AM');
    expect(component.timeConfirmed).toBe(false);
    expect(component.activePanel).toBe('time');
    expect(component.bookingError).toContain('no longer available');
  });

  it('uses service-specific calendar availability when opening a direct service link', async () => {
    const nextDate = { iso: '2026-05-21', day: 'Thu', monthDay: 'May 21', display: 'Thu, May 21', hasSlots: true };
    (component as any).route = { snapshot: { queryParamMap: { get: () => 'signature-cut' } } };
    bookingApi.getAvailabilityDates
      .mockReturnValueOnce(of([...dateOptions, nextDate]))
      .mockReturnValueOnce(of([{ ...dateOptions[0], hasSlots: false }, nextDate]));
    bookingApi.getAvailabilitySlots.mockImplementation((input) =>
      of(input.date === nextDate.iso ? slotGroups : []),
    );
    (component as any).clearAvailabilityCache();

    await (component as any).loadBookingData();

    expect(bookingApi.getAvailabilityDates).toHaveBeenLastCalledWith({
      days: 7, serviceId: 'signature-cut', barberId: null, barberPreference: 'any',
    });
    expect(component.draft.date).toBe(nextDate.iso);
    expect(component.slotGroups).toEqual(slotGroups);
    expect(component.serviceConfirmed).toBe(true);
  });
});
