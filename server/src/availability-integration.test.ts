import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { env } from './config/env';
import { defaultBarbers, defaultSchedule, defaultServices } from './data/defaults';
import { BarberModel } from './models/barber';
import { BookingModel } from './models/booking';
import { BookingSlotLockModel } from './models/booking-slot-lock';
import { ServiceOptionModel } from './models/service-option';
import { ShopSettingsModel } from './models/shop-settings';

vi.mock('./services/sms-service', () => ({
  sendBookingConfirmationSms: vi.fn(async () => ({ status: 'skipped' })),
}));

const app = createApp();
const date = '2030-01-02';
let mongo: MongoMemoryServer;
const admin = () => ({
  Authorization: `Bearer ${jwt.sign({ sub: 'admin', role: 'admin' }, env.JWT_SECRET, { expiresIn: '1h' })}`,
});
const bookingInput = (serviceId = 'signature-cut', time = '09:00 AM', barberId: string | null = 'ahmed') => ({
  serviceId, time, barberId, date,
  barberPreference: barberId ? 'specific' : 'any',
  name: 'Test Customer', phone: '0549999999',
});
const slots = async (serviceId: string | null = 'signature-cut', barberId: string | null = 'ahmed', day = date) => {
  const response = await request(app).get('/api/availability/slots').query({
    date: day,
    ...(serviceId ? { serviceId } : {}),
    ...(barberId ? { barberId } : {}),
    barberPreference: barberId ? 'specific' : 'any',
  });
  expect(response.status).toBe(200);
  return response.body.flatMap((group: { slots: Array<{ time: string; barberId: string }> }) => group.slots) as
    Array<{ time: string; barberId: string }>;
};
const times = async (serviceId = 'signature-cut', barberId: string | null = 'ahmed') =>
  (await slots(serviceId, barberId)).map((slot) => slot.time);

beforeAll(async () => {
  // Always use a disposable local database, never the configured shop database.
  mongo = await MongoMemoryServer.create({
    binary: { version: '7.0.24', downloadDir: join(tmpdir(), 'barber-booking-test-mongodb') },
  });
  await mongoose.connect(mongo.getUri(), { dbName: 'availability-tests' });
  await Promise.all([
    BookingSlotLockModel.init(), ShopSettingsModel.init(), ServiceOptionModel.init(), BarberModel.init(),
  ]);
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-01-01T06:00:00Z'));
  await Promise.all([
    BookingModel.deleteMany({}), BookingSlotLockModel.deleteMany({}),
    ServiceOptionModel.deleteMany({}), BarberModel.deleteMany({}), ShopSettingsModel.deleteMany({}),
  ]);
  await Promise.all([
    ServiceOptionModel.insertMany(defaultServices),
    BarberModel.insertMany([defaultBarbers[0], { ...defaultBarbers[0], id: 'omar', name: 'Omar' }]),
    ShopSettingsModel.create({ ...defaultSchedule, workingDays: [0, 1, 2, 3, 4, 5, 6], openTime: '09:00', closeTime: '13:00' }),
  ]);
});

afterAll(async () => {
  vi.useRealTimers();
  await mongoose.disconnect();
  await mongo?.stop();
});

describe('availability and booking with MongoDB', () => {
  it('chains mixed services immediately and uses the same rules for admin bookings', async () => {
    const first = await request(app).post('/api/bookings').send(bookingInput('signature-cut', '09:30 AM'));
    expect(first.status).toBe(201);
    expect(await times('beard-detail')).toContain('10:00 AM');
    const second = await request(app).post('/api/admin/bookings').set(admin())
      .send(bookingInput('beard-detail', '10:00 AM'));
    expect(second.status).toBe(201);
    expect(await times('full-grooming')).toContain('10:20 AM');
    const third = await request(app).post('/api/bookings').send(bookingInput('full-grooming', '10:20 AM'));
    expect(third.status).toBe(201);
    expect(await times()).toContain('11:05 AM');
    const saved = await BookingModel.find({ barberId: 'ahmed' }).sort({ startMinute: 1 }).lean();
    expect(saved.map((booking) => [booking.startMinute, booking.endMinute])).toEqual([
      [570, 600], [600, 620], [620, 665],
    ]);
  });

  it('offers both ends of a gap, hides overlapping choices after booking, and ignores legacy intervals', async () => {
    await ShopSettingsModel.collection.updateOne({ key: 'default' }, { $set: { slotIntervalMinutes: 45 } });
    await request(app).post('/api/bookings').send(bookingInput('signature-cut', '09:30 AM'));
    await request(app).post('/api/bookings').send(bookingInput('full-grooming', '11:00 AM'));
    const offered = await times('full-grooming');
    expect(offered).toEqual(['10:00 AM', '10:15 AM', '11:45 AM', '12:15 PM']);
    const booked = await request(app).post('/api/bookings').send(bookingInput('full-grooming', '10:15 AM'));
    expect(booked.status).toBe(201);
    expect(await times('full-grooming')).not.toContain('10:00 AM');
    const conflict = await request(app).post('/api/bookings').send(bookingInput('full-grooming', '10:00 AM'));
    expect(conflict.status).toBe(409);
    const schedule = await request(app).get('/api/admin/schedule').set(admin());
    expect(schedule.body).not.toHaveProperty('slotIntervalMinutes');
  });

  it('allows the exact closing boundary and rejects an overrun or a gap that is too short', async () => {
    expect(await times('full-grooming')).toContain('12:15 PM');
    const overrun = await request(app).post('/api/bookings').send(bookingInput('full-grooming', '12:16 PM'));
    expect(overrun.status).toBe(400);
    const closing = await request(app).post('/api/bookings').send(bookingInput('full-grooming', '12:15 PM'));
    expect(closing.status).toBe(201);
    expect(await times()).not.toContain('12:00 PM');
    expect(await times('beard-detail')).toContain('11:55 AM');
  });

  it('releases cancelled minutes for rebooking and preserves historical durations after service edits', async () => {
    const first = await request(app).post('/api/bookings').send(bookingInput());
    expect(first.status).toBe(201);
    await ServiceOptionModel.updateOne({ id: 'signature-cut' }, { $set: { duration: 45 } });
    const saved = await BookingModel.findById(first.body.booking.id).lean();
    expect(saved).toMatchObject({ duration: 30, startMinute: 540, endMinute: 570 });
    expect(await times()).toContain('09:30 AM');
    const cancelled = await request(app).delete(`/api/bookings/${first.body.booking.id}`)
      .set('X-Booking-Token', first.body.manageToken);
    expect(cancelled.status).toBe(204);
    expect(await BookingSlotLockModel.countDocuments({ bookingId: first.body.booking.id })).toBe(0);
    expect(await times()).toContain('09:00 AM');
    expect(await BookingModel.findById(first.body.booking.id).lean()).toMatchObject({ status: 'cancelled', duration: 30 });
    const replacement = await request(app).post('/api/bookings').send(bookingInput());
    expect(replacement.status).toBe(201);
    expect(replacement.body.booking.duration).toBe(45);
  });

  it('keeps barber calendars independent and deduplicates any-barber options', async () => {
    await request(app).post('/api/bookings').send(bookingInput());
    expect(await times()).not.toContain('09:00 AM');
    expect(await times('signature-cut', 'omar')).toContain('09:00 AM');
    const any = await slots('signature-cut', null);
    expect(any[0]).toMatchObject({ time: '09:00 AM', barberId: 'omar' });
    expect(new Set(any.map((slot) => slot.time)).size).toBe(any.length);
    await ServiceOptionModel.updateOne({ id: 'signature-cut' }, { $set: { barberIds: ['ahmed'] } });
    expect(await times('signature-cut', 'omar')).toEqual([]);
    expect(await times('signature-cut', null)).not.toContain('09:00 AM');
  });

  it('protects real overlapping writes and rolls back partially acquired minute locks', async () => {
    // Both requests must reach the actual write before either can finish.
    const insertMany = BookingSlotLockModel.insertMany.bind(BookingSlotLockModel);
    let arrivals = 0;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    const insert = vi.spyOn(BookingSlotLockModel, 'insertMany').mockImplementation(async (locks: any) => {
      if (++arrivals === 2) {
        release();
      }
      await ready;
      return insertMany(locks);
    });
    try {
      const responses = await Promise.all([
        request(app).post('/api/bookings').send(bookingInput('signature-cut', '10:00 AM')),
        request(app).post('/api/bookings').send(bookingInput('full-grooming', '10:15 AM')),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      const saved = await BookingModel.find({ status: 'active' }).lean();
      expect(saved).toHaveLength(1);
      expect(await BookingSlotLockModel.countDocuments()).toBe(saved[0].duration);
      expect(await BookingSlotLockModel.countDocuments({ bookingId: String(saved[0]._id) })).toBe(saved[0].duration);
    } finally {
      insert.mockRestore();
    }
  });

  it('assigns simultaneous any-barber bookings to different barbers when capacity exists', async () => {
    const responses = await Promise.all([
      request(app).post('/api/bookings').send(bookingInput('signature-cut', '09:00 AM', null)),
      request(app).post('/api/bookings').send(bookingInput('signature-cut', '09:00 AM', null)),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(new Set(responses.map((response) => response.body.booking.barberId)).size).toBe(2);
    const third = await request(app).post('/api/bookings').send(bookingInput('signature-cut', '09:00 AM', null));
    expect(third.status).toBe(409);
  });

  it('uses actual active services before selection and the business timezone for today', async () => {
    await ShopSettingsModel.updateOne({ key: 'default' }, { $set: { closeTime: '09:20' } });
    expect(await slots()).toEqual([]);
    expect((await slots(null, null)).map((slot) => slot.time)).toEqual(['09:00 AM']);
    await ServiceOptionModel.updateOne({ id: 'beard-detail' }, { $set: { active: false } });
    expect(await slots(null, null)).toEqual([]);
    await ServiceOptionModel.updateOne({ id: 'beard-detail' }, { $set: { active: true } });
    const { getBusinessDateAndMinutes } = await import('./utils/time');
    vi.setSystemTime(new Date('2030-01-02T07:07:00Z'));
    const now = getBusinessDateAndMinutes();
    const todaySlots = await slots('beard-detail', 'ahmed', now.date);
    expect(todaySlots).toEqual([]); // Only 13 minutes remain before closing.
    expect(await slots('beard-detail', 'ahmed', '2030-01-01')).toEqual([]);
  });
});
