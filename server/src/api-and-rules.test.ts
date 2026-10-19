import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { env } from './config/env';
import { hasTimeOverlap } from './utils/booking-rules';
import { isPastAppointment } from './utils/time';
import { formatStrictValidationError, strictInteger, strictObject, strictString } from './validation/strict-payload';

const app = createApp();

describe('admin API authentication', () => {
  it('logs in admin and returns a JWT', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
  });

  it('supports the password-only login form without hard-coding the configured username', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ password: env.ADMIN_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
  });

  it('rejects admin endpoints without a token', async () => {
    const response = await request(app).get('/api/admin/bookings');

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Admin token is required.');
  });

  it('rejects customer delete without a booking token before touching MongoDB', async () => {
    const response = await request(app).delete('/api/bookings/507f1f77bcf86cd799439011');

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Booking token is required.');
  });

  it('rejects customer booking reads without a booking token before touching MongoDB', async () => {
    const response = await request(app).get('/api/bookings/507f1f77bcf86cd799439011');

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Booking token is required.');
  });
});

describe('booking business rules', () => {
  it('detects exact and duration-based booking overlap', () => {
    expect(hasTimeOverlap(600, 630, 600, 630)).toBe(true);
    expect(hasTimeOverlap(600, 645, 630, 660)).toBe(true);
  });

  it('allows adjacent bookings that do not overlap', () => {
    expect(hasTimeOverlap(600, 630, 630, 660)).toBe(false);
    expect(hasTimeOverlap(630, 660, 600, 630)).toBe(false);
  });

  it('rejects dates and times in the past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-06T10:15:00'));

    expect(isPastAppointment('2026-05-05', 11 * 60)).toBe(true);
    expect(isPastAppointment('2026-05-06', 10 * 60)).toBe(true);
    expect(isPastAppointment('2026-05-06', 11 * 60)).toBe(false);

    vi.useRealTimers();
  });
});

describe('strict payload validation', () => {
  it('rejects number values for string fields without converting them', async () => {
    const response = await request(app)
      .post('/api/bookings')
      .send({
        serviceId: 'signature-cut',
        barberId: null,
        barberPreference: 'any',
        date: '2026-05-20',
        time: '09:30 AM',
        name: 123,
        phone: '0549999999'
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('name: Expected a string, but received a number (123).');
    expect(response.body.details.fields.name[0]).toContain('Automatic type conversion is disabled.');
  });

  it('rejects string values for integer fields without converting them', () => {
    const schema = strictObject({
      name: strictString(),
      age: strictInteger()
    });
    const result = schema.safeParse({ name: 'Mohammed', age: 'John' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const details = formatStrictValidationError(result.error, { name: 'Mohammed', age: 'John' });
      expect(details.fields.age[0]).toBe('age: Expected an integer, but received a string ("John"). Reason: Only whole numbers are accepted; automatic type conversion is disabled.');
    }
  });
});
