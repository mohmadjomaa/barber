import { describe, expect, it } from 'vitest';
import { getFreeWindows, getServiceStartMinutes } from './availability';

describe('service duration availability', () => {
  it.each([
    [20, [600, 620, 640]],
    [30, [600, 630]],
    [45, [600, 615]],
    [60, [600]],
    [61, []],
  ])('offers %i-minute services inside an hour with no buffer', (duration, expected) => {
    expect(getServiceStartMinutes([{ startMinute: 600, endMinute: 660 }], duration)).toEqual(expected);
  });

  it('subtracts unsorted and overlapping historical windows without modifying them', () => {
    const bookings = [
      { startMinute: 660, endMinute: 705 },
      { startMinute: 570, endMinute: 600 },
      { startMinute: 585, endMinute: 615 },
    ];
    const saved = structuredClone(bookings);
    expect(getFreeWindows(540, 780, bookings)).toEqual([
      { startMinute: 540, endMinute: 570 },
      { startMinute: 615, endMinute: 660 },
      { startMinute: 705, endMinute: 780 },
    ]);
    expect(bookings).toEqual(saved);
  });

  it('handles adjacent bookings and bookings crossing the working hours', () => {
    expect(getFreeWindows(540, 780, [
      { startMinute: 500, endMinute: 570 },
      { startMinute: 570, endMinute: 600 },
      { startMinute: 750, endMinute: 810 },
    ])).toEqual([{ startMinute: 600, endMinute: 750 }]);
    expect(getFreeWindows(540, 780, [{ startMinute: 500, endMinute: 810 }])).toEqual([]);
  });

  it('restarts choices at each gap and includes a closing-aligned choice only once', () => {
    expect(getServiceStartMinutes([
      { startMinute: 540, endMinute: 570 },
      { startMinute: 615, endMinute: 660 },
      { startMinute: 705, endMinute: 780 },
    ], 30)).toEqual([540, 615, 630, 705, 735, 750]);
  });

  it('starts today at the current minute without adding an interval', () => {
    const windows = getFreeWindows(540, 660, [], 607);
    expect(getServiceStartMinutes(windows, 30)).toEqual([607, 630]);
    expect(getFreeWindows(540, 660, [], 661)).toEqual([]);
  });

  it.each([0, -1, 1.5, NaN, Infinity])('rejects an invalid duration %s', (duration) => {
    expect(getServiceStartMinutes([{ startMinute: 540, endMinute: 780 }], duration)).toEqual([]);
  });
});
