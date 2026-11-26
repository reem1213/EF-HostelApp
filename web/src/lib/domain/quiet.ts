import { weekdayOccupancy } from "./series";
import type { Booking } from "./types";

const DAY = 86_400_000;
/** How far back the "usual" level for a weekday is measured. */
const HISTORY_DAYS = 56;

export type QuietNight = { date: Date; weekday: number; occupancy: number; weekdayAvg: number; gap: number };

/**
 * Upcoming nights that are emptier than that weekday usually is (average of the last 8 weeks),
 * emptiest first. Nights at or above their usual level are not listed.
 */
export function quietestNights(bookings: Booking[], beds: number, today: Date, horizon: number, limit: number): QuietNight[] {
  if (beds <= 0 || bookings.length === 0 || horizon <= 0 || limit <= 0) return [];
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const avg = weekdayOccupancy(bookings, beds, { start: new Date(start - HISTORY_DAYS * DAY), end: new Date(start) });

  const used = new Map<number, number>();
  for (const b of bookings) {
    for (let i = 0; i < b.nights; i++) {
      const t = b.checkIn.getTime() + i * DAY;
      if (t >= start && t < start + horizon * DAY) used.set(t, (used.get(t) ?? 0) + 1);
    }
  }

  const out: QuietNight[] = [];
  for (let i = 0; i < horizon; i++) {
    const t = start + i * DAY;
    const weekday = new Date(t).getUTCDay();
    const occupancy = Math.min(1, (used.get(t) ?? 0) / beds);
    const weekdayAvg = avg[weekday].occupancy;
    const gap = weekdayAvg - occupancy;
    if (occupancy < 1 && gap > 1e-9) out.push({ date: new Date(t), weekday, occupancy, weekdayAvg, gap });
  }
  return out.sort((a, b) => a.occupancy - b.occupancy || a.date.getTime() - b.date.getTime()).slice(0, limit);
}

/**
 * A lower price for a quiet night: the cut is as big as the occupancy gap, capped by the daily change limit and
 * never below the floor. A night already at or under the floor is left alone. Always from code, never from the model.
 */
export function suggestPrice(a: { currentCents: number; gap: number; floorCents: number; ceilingCents: number | null; maxChangePct: number }): number {
  if (a.gap <= 0 || a.currentCents <= a.floorCents) return a.currentCents;
  const cut = Math.min(a.gap, a.maxChangePct);
  let price = Math.round(a.currentCents * (1 - cut));
  if (a.ceilingCents !== null) price = Math.min(price, a.ceilingCents);
  return Math.min(a.currentCents, Math.max(a.floorCents, price));
}
