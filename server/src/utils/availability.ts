export interface TimeWindow {
  startMinute: number;
  endMinute: number;
}

/** Subtract saved booking windows, including overlapping and out-of-hours bookings. */
export function getFreeWindows(
  openMinute: number,
  closeMinute: number,
  bookings: TimeWindow[],
  notBeforeMinute = openMinute,
): TimeWindow[] {
  const windows: TimeWindow[] = [];
  let cursor = Math.max(openMinute, notBeforeMinute);
  const occupied = [...bookings].sort((a, b) => a.startMinute - b.startMinute);

  for (const booking of occupied) {
    if (booking.endMinute <= cursor || booking.startMinute >= closeMinute) {
      continue;
    }
    if (booking.startMinute > cursor) {
      windows.push({ startMinute: cursor, endMinute: booking.startMinute });
    }
    cursor = Math.max(cursor, booking.endMinute);
    if (cursor >= closeMinute) {
      break;
    }
  }
  if (cursor < closeMinute) {
    windows.push({ startMinute: cursor, endMinute: closeMinute });
  }
  return windows;
}

/** Offer consecutive service-length choices and one choice flush with each gap's end. */
export function getServiceStartMinutes(windows: TimeWindow[], duration: number): number[] {
  if (!Number.isInteger(duration) || duration <= 0) {
    return [];
  }
  const starts = new Set<number>();
  for (const window of windows) {
    const lastStart = window.endMinute - duration;
    for (let start = window.startMinute; start <= lastStart; start += duration) {
      starts.add(start);
    }
    if (lastStart >= window.startMinute) {
      starts.add(lastStart);
    }
  }
  return [...starts].sort((a, b) => a - b);
}
