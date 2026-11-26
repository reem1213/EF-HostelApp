import { COST_LINES, type CostInputs, type CostLine } from "./costs";
import { monthOf, previousMonth } from "../period";
import type { Booking, DateRange } from "./types";

const DAY = 86_400_000;

/** Occupancy per weekday (Sunday = 0) over a window: bed-nights used / bed-nights available on that weekday. */
export function weekdayOccupancy(bookings: Booking[], beds: number, window: DateRange): { weekday: number; occupancy: number }[] {
  const used = Array<number>(7).fill(0);
  const days = Array<number>(7).fill(0);
  for (let t = window.start.getTime(); t < window.end.getTime(); t += DAY) days[new Date(t).getUTCDay()]++;

  for (const b of bookings) {
    for (let n = 0; n < b.nights; n++) {
      const night = new Date(b.checkIn.getTime() + n * DAY);
      if (night >= window.start && night < window.end) used[night.getUTCDay()]++;
    }
  }
  return used.map((u, weekday) => ({ weekday, occupancy: beds > 0 && days[weekday] > 0 ? u / (beds * days[weekday]) : 0 }));
}

/** The last `count` month keys ending at `now`'s month, oldest first. */
function lastMonths(count: number, now: Date): string[] {
  const out: string[] = [];
  let m = monthOf(now);
  for (let i = 0; i < count; i++) {
    out.unshift(m);
    m = previousMonth(m);
  }
  return out;
}

/** Bookings and revenue per month, by check-in month. Zero-filled, oldest first. */
export function monthlySeries(bookings: Booking[], months: number, now: Date): { month: string; revenueCents: number; bookings: number }[] {
  const keys = lastMonths(months, now);
  const byMonth = new Map(keys.map((k) => [k, { month: k, revenueCents: 0, bookings: 0 }]));
  for (const b of bookings) {
    const row = byMonth.get(monthOf(b.checkIn));
    if (row) {
      row.revenueCents += b.revenueCents;
      row.bookings += 1;
    }
  }
  return keys.map((k) => byMonth.get(k)!);
}

/** The five cost lines per month for the last `months` months. Months with no entry are zero. */
export function costHistory(inputs: CostInputs[], months: number, now: Date): { month: string; lines: Record<CostLine, number> }[] {
  const byMonth = new Map(inputs.map((i) => [i.month, i]));
  return lastMonths(months, now).map((month) => {
    const i = byMonth.get(month);
    const lines = { staff: i?.staffCents ?? 0, laundry: i?.laundryCents ?? 0, utilities: i?.utilitiesCents ?? 0, rent: i?.rentCents ?? 0, breakfast: i?.breakfastCents ?? 0 };
    return { month, lines: Object.fromEntries(COST_LINES.map((l) => [l, lines[l]])) as Record<CostLine, number> };
  });
}
