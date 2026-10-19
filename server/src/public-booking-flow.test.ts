import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  service: {
    id: 'signature-cut',
    name: 'Signature Cut',
    description: 'Sharp consultation, tailored cut, wash, and finish.',
    duration: 30,
    price: 90,
    badge: 'Most booked',
    bestFor: 'Busy clients who want a clean refresh',
    popularity: 'Booked 210 times this month'
  },
  barber: {
    id: 'ahmed',
    name: 'Ahmed',
    title: 'Fade Specialist',
    rating: 4.9,
    reviews: 168,
    specialty: 'Skin fades and sharp outlines',
    availability: 'Next opening in 45 min',
    image: '/img/jpg1.png',
    nextAvailable: 'Available today'
  },
  schedule: {
    key: 'default',
    workingDays: [0, 1, 2, 3, 4],
    openTime: '09:30',
    closeTime: '19:00'
  },
  bookings: [] as Array<Record<string, any>>,
  slotLocks: new Map<string, string>(),
  nextId: 1
}));

vi.mock('./models/service-option', () => ({
  ServiceOptionModel: {
    find: vi.fn(() => ({
      sort: vi.fn(() => ({ lean: vi.fn(async () => [fixtures.service]) }))
    })),
    findOne: vi.fn((query: { id?: string }) => ({
      lean: vi.fn(async () => query.id === fixtures.service.id ? fixtures.service : null)
    }))
  }
}));

vi.mock('./models/barber', () => ({
  BarberModel: {
    find: vi.fn(() => ({
      sort: vi.fn(() => ({
        lean: vi.fn(async () => [fixtures.barber])
      }))
    })),
    findOne: vi.fn((query: { id?: string }) => ({
      lean: vi.fn(async () => query.id === fixtures.barber.id ? fixtures.barber : null)
    }))
  }
}));

vi.mock('./models/shop-settings', () => ({
  ShopSettingsModel: {
    findOne: vi.fn(() => ({
      lean: vi.fn(async () => fixtures.schedule)
    }))
  }
}));

vi.mock('./models/booking', () => ({
  BookingModel: {
    find: vi.fn((query: Record<string, any>) => ({
      lean: vi.fn(async () => fixtures.bookings.filter(booking =>
        booking['status'] === query['status'] &&
        (!query['date'] ||
          booking['date'] === query['date'] ||
          (Array.isArray(query['date']?.['$in']) && query['date']['$in'].includes(booking['date']))) &&
        (!query['barberId']?.['$in'] || query['barberId']['$in'].includes(booking['barberId']))
      ))
    })),
    findOne: vi.fn((query: Record<string, any>) => ({
      lean: vi.fn(async () => fixtures.bookings.find(booking =>
        booking['status'] === query['status'] &&
        booking['date'] === query['date'] &&
        booking['barberId'] === query['barberId'] &&
        booking['startMinute'] < query['startMinute']['$lt'] &&
        booking['endMinute'] > query['endMinute']['$gt']
      ) || null)
    })),
    create: vi.fn(async (input: Record<string, any>) => {
      const booking = {
        ...input,
        _id: String(fixtures.nextId++),
        createdAt: new Date('2026-05-19T09:00:00Z'),
        updatedAt: new Date('2026-05-19T09:00:00Z')
      };
      fixtures.bookings.push(booking);

      return {
        toJSON: () => {
          const output = { ...booking, id: booking._id };
          delete output['_id'];
          delete output['__v'];
          delete output['manageTokenHash'];
          delete output['startMinute'];
          delete output['endMinute'];
          return output;
        }
      };
    })
  }
}));

vi.mock('./models/booking-slot-lock', () => ({
  ensureBookingSlotLockIndexes: vi.fn().mockResolvedValue(undefined),
  BookingSlotLockModel: {
    insertMany: vi.fn(async (locks: Array<{ bookingId: string; date: string; barberId: string; minute: number }>) => {
      const duplicate = locks.some(lock => fixtures.slotLocks.has(`${lock.date}:${lock.barberId}:${lock.minute}`));

      if (duplicate) {
        const error = Object.assign(new Error('Duplicate slot lock.'), { code: 11000 });
        throw error;
      }

      locks.forEach(lock => fixtures.slotLocks.set(`${lock.date}:${lock.barberId}:${lock.minute}`, lock.bookingId));
    }),
    deleteMany: vi.fn(async (query: { bookingId: string }) => {
      for (const [key, bookingId] of fixtures.slotLocks.entries()) {
        if (bookingId === query.bookingId) {
          fixtures.slotLocks.delete(key);
        }
      }
    })
  }
}));

import { createApp } from './app';

const app = createApp();

describe('public booking flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T08:00:00Z'));
    fixtures.bookings.length = 0;
    fixtures.slotLocks.clear();
    fixtures.nextId = 1;
    Object.assign(fixtures.schedule, {
      workingDays: [0, 1, 2, 3, 4],
      openTime: '09:30',
      closeTime: '19:00'
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns any-barber availability with the assigned barber metadata', async () => {
    const response = await request(app)
      .get('/api/availability/slots')
      .query({
        date: '2026-05-20',
        serviceId: 'signature-cut',
        barberPreference: 'any'
      });

    const slots = response.body.flatMap((group: { slots: unknown[] }) => group.slots);

    expect(response.status).toBe(200);
    expect(slots[0]).toMatchObject({
      time: '09:30 AM',
      barberId: 'ahmed',
      barberName: 'Ahmed'
    });
  });

  it('returns a clear error instead of an empty availability result for an unknown service', async () => {
    const response = await request(app)
      .get('/api/availability/slots')
      .query({ date: '2026-05-20', serviceId: 'missing-service', barberPreference: 'any' });

    expect(response.status).toBe(404);
    expect(response.body.message).toContain('Selected service was not found');
  });

  it('keeps the calendar usable before a customer selects a service or barber', async () => {
    const response = await request(app)
      .get('/api/availability/dates')
      .query({ days: 1 });

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      iso: '2026-05-19',
      closed: false,
      hasSlots: true
    });
  });

  it('assigns a compatible barber for any-barber booking and blocks the conflicting slot', async () => {
    const firstBooking = await request(app)
      .post('/api/bookings')
      .send({
        serviceId: 'signature-cut',
        barberId: null,
        barberPreference: 'any',
        date: '2026-05-20',
        time: '09:30 AM',
        name: 'Test Customer',
        phone: '0549999999',
        notes: '',
        reminderPreference: 'sms',
        paymentMethod: 'pay-in-shop'
      });

    expect(firstBooking.status).toBe(201);
    expect(firstBooking.body.booking).toMatchObject({
      barberId: 'ahmed',
      barber: 'Ahmed'
    });
    expect(firstBooking.body.sms).toMatchObject({
      status: 'skipped'
    });

    const conflict = await request(app)
      .post('/api/bookings')
      .send({
        serviceId: 'signature-cut',
        barberId: null,
        barberPreference: 'any',
        date: '2026-05-20',
        time: '09:30 AM',
        name: 'Second Customer',
        phone: '0548888888',
        notes: '',
        reminderPreference: 'sms',
        paymentMethod: 'pay-in-shop'
      });

    expect(conflict.status).toBe(409);
    expect(conflict.body.message).toBe('This time slot is no longer available.');
  });

  it('atomically rejects one of two simultaneous requests for an overlapping appointment', async () => {
    const requestBody = {
      serviceId: 'signature-cut',
      barberId: 'ahmed',
      barberPreference: 'specific',
      date: '2026-05-20',
      time: '09:30 AM',
      name: 'Concurrent Customer',
      phone: '0547777777',
      notes: '',
      reminderPreference: 'sms',
      paymentMethod: 'pay-in-shop'
    };

    const responses = await Promise.all([
      request(app).post('/api/bookings').send(requestBody),
      request(app).post('/api/bookings').send(requestBody)
    ]);

    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect(responses.find(response => response.status === 409)?.body.message)
      .toBe('This time slot is no longer available.');
  });

  it('marks a working day as unavailable when every matching slot is booked', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T09:00:00Z'));
    fixtures.schedule.closeTime = '10:00';
    fixtures.bookings.push({
      status: 'active',
      date: '2026-05-19',
      barberId: 'ahmed',
      startMinute: 570,
      endMinute: 600
    });

    const response = await request(app)
      .get('/api/availability/dates')
      .query({
        days: 1,
        serviceId: 'signature-cut',
        barberId: 'ahmed',
        barberPreference: 'specific'
      });

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      iso: '2026-05-19',
      hasSlots: false
    });
  });

  it('returns closed calendar days explicitly and no slots for them', async () => {
    const dates = await request(app)
      .get('/api/availability/dates')
      .query({ days: 6, serviceId: 'signature-cut', barberPreference: 'any' });
    const closedDate = dates.body.find((date: { closed: boolean }) => date.closed);

    expect(dates.status).toBe(200);
    expect(closedDate).toMatchObject({ hasSlots: false, closed: true });

    const slots = await request(app)
      .get('/api/availability/slots')
      .query({ date: closedDate.iso, serviceId: 'signature-cut', barberPreference: 'any' });

    expect(slots.status).toBe(200);
    expect(slots.body).toEqual([]);
  });

  it('recalculates each date from its own bookings without carrying filters between days', async () => {
    fixtures.bookings.push({
      status: 'active',
      date: '2026-05-21',
      barberId: 'ahmed',
      startMinute: 570,
      endMinute: 600
    });

    const dayA = await request(app)
      .get('/api/availability/slots')
      .query({ date: '2026-05-20', serviceId: 'signature-cut', barberId: 'ahmed', barberPreference: 'specific' });
    const dayB = await request(app)
      .get('/api/availability/slots')
      .query({ date: '2026-05-21', serviceId: 'signature-cut', barberId: 'ahmed', barberPreference: 'specific' });
    const dayAAgain = await request(app)
      .get('/api/availability/slots')
      .query({ date: '2026-05-20', serviceId: 'signature-cut', barberId: 'ahmed', barberPreference: 'specific' });
    const times = (response: { body: Array<{ slots: Array<{ time: string }> }> }) =>
      response.body.flatMap(group => group.slots.map(slot => slot.time));

    expect(times(dayA)).toContain('09:30 AM');
    expect(times(dayB)).not.toContain('09:30 AM');
    expect(times(dayAAgain)).toEqual(times(dayA));
  });

  it('generates customer slots from persisted working hours and the selected service duration', async () => {
    Object.assign(fixtures.schedule, {
      openTime: '10:30',
      closeTime: '12:00'
    });

    const response = await request(app)
      .get('/api/availability/slots')
      .query({ date: '2026-05-20', serviceId: 'signature-cut', barberId: 'ahmed', barberPreference: 'specific' });
    const times = response.body.flatMap((group: { slots: Array<{ time: string }> }) =>
      group.slots.map(slot => slot.time)
    );

    expect(response.status).toBe(200);
    expect(times).toEqual(['10:30 AM', '11:00 AM', '11:30 AM']);
  });
});
