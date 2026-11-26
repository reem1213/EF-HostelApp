import type { Booking } from "./types";

const DAY = 86_400_000;

export type NightCell = {
  date: Date;
  /** Beds used / beds available, 0-1 (capped). */
  occupancy: number;
  /** After today: nothing is confirmed yet, so an empty cell means "no bookings yet", not "empty". */
  future: boolean;
  isToday: boolean;
};

/**
 * One cell per night for `days` nights from `start`. A stay occupies [checkIn, checkIn + nights):
 * the check-out day is free. `beds` of 0 gives 0, never NaN.
 */
export function nightStrip(bookings: Booking[], beds: number, start: Date, days: number, today: Date): NightCell[] {
  const used = new Map<number, number>();
  for (const b of bookings) {
    for (let n = 0; n < b.nights; n++) {
      const t = b.checkIn.getTime() + n * DAY;
      used.set(t, (used.get(t) ?? 0) + 1);
    }
  }
  const todayMs = today.getTime();
  return Array.from({ length: days }, (_, i) => {
    const t = start.getTime() + i * DAY;
    return {
      date: new Date(t),
      occupancy: beds > 0 ? Math.min(1, (used.get(t) ?? 0) / beds) : 0,
      future: t > todayMs,
      isToday: t === todayMs,
    };
  });
}
