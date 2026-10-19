import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  schedule: {
    key: 'default' as const,
    workingDays: [0, 1, 2, 3, 4],
    openTime: '09:30',
    closeTime: '19:00'
  }
}));

vi.mock('./models/shop-settings', () => ({
  ShopSettingsModel: {
    findOne: vi.fn(() => ({
      lean: vi.fn(async () => ({ ...fixtures.schedule }))
    })),
    findOneAndUpdate: vi.fn(async (_filter: unknown, update: typeof fixtures.schedule) => {
      Object.assign(fixtures.schedule, update);
      return { toJSON: () => ({ ...fixtures.schedule }) };
    })
  }
}));

import { createApp } from './app';
import { env } from './config/env';
import { ShopSettingsModel } from './models/shop-settings';

const app = createApp();
const adminToken = jwt.sign({ sub: 'admin', role: 'admin' }, env.JWT_SECRET, { expiresIn: '1h' });
const adminRequest = () => ({ Authorization: `Bearer ${adminToken}` });

describe('admin schedule API contract', () => {
  beforeEach(() => {
    Object.assign(fixtures.schedule, {
      key: 'default',
      workingDays: [0, 1, 2, 3, 4],
      openTime: '09:30',
      closeTime: '19:00'
    });
    vi.clearAllMocks();
  });

  it('does not expose the persistence key in the schedule returned to the client', async () => {
    const response = await request(app)
      .get('/api/admin/schedule')
      .set(adminRequest());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      workingDays: [0, 1, 2, 3, 4],
      openTime: '09:30',
      closeTime: '19:00'
    });
    expect(response.body).not.toHaveProperty('key');
  });

  it('accepts the exact client contract, persists it, and returns the same contract', async () => {
    const payload = {
      workingDays: [0, 1, 2, 3, 4],
      openTime: '09:30',
      closeTime: '20:00'
    };

    const response = await request(app)
      .put('/api/admin/schedule')
      .set(adminRequest())
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(ShopSettingsModel.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'default' },
      { key: 'default', ...payload },
      { new: true, upsert: true }
    );
  });

  it('rejects storage-only fields instead of silently accepting a broken request shape', async () => {
    const response = await request(app)
      .put('/api/admin/schedule')
      .set(adminRequest())
      .send({
        key: 'default',
        workingDays: [0, 1, 2, 3, 4],
        openTime: '09:30',
        closeTime: '20:00'
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('key');
  });

  it('rejects an invalid time range before changing persistent data', async () => {
    const response = await request(app)
      .put('/api/admin/schedule')
      .set(adminRequest())
      .send({
        workingDays: [0],
        openTime: '20:00',
        closeTime: '09:30'
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Close time must be later than open time.');
    expect(ShopSettingsModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects the retired fixed interval setting', async () => {
    const response = await request(app).put('/api/admin/schedule').set(adminRequest()).send({
      workingDays: [1], openTime: '09:00', closeTime: '17:00', slotIntervalMinutes: 30,
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('slotIntervalMinutes');
    expect(ShopSettingsModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
