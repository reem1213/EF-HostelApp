import type { Booking } from "./types";

const DAY = 86_400_000;

export type CapacityCheck = {
  exceeded: boolean;
  /** Most beds in use on any single night. */
  peak: number;
  /** First night the peak happens, or null with no bookings. */
  peakDate: Date | null;
  /** Number of nights with more beds in use than the hostel has. */
  nightsOver: number;
};

/**
 * One reservation is one bed-stay (V1 rule), so beds in use on a night = bookings
 * overlapping it. A stay occupies [checkIn, checkIn + nights); the check-out
 * morning is free for the next guest.
 */
export function capacityCheck(bookings: Booking[], beds: number): CapacityCheck {
  const deltas = new Map<number, number>();
  for (const b of bookings) {
    if (b.nights <= 0) continue;
    const start = b.checkIn.getTime();
    deltas.set(start, (deltas.get(start) ?? 0) + 1);
    const end = start + b.nights * DAY;
    deltas.set(end, (deltas.get(end) ?? 0) - 1);
  }
  const keys = [...deltas.keys()].sort((a, c) => a - c);

  let inUse = 0;
  let peak = 0;
  let peakAt: number | null = null;
  let nightsOver = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    inUse += deltas.get(keys[i])!;
    const nights = Math.round((keys[i + 1] - keys[i]) / DAY);
    if (inUse > peak) {
      peak = inUse;
      peakAt = keys[i];
    }
    if (inUse > beds) nightsOver += nights;
  }
  return { exceeded: nightsOver > 0, peak, peakDate: peakAt === null ? null : new Date(peakAt), nightsOver };
}
