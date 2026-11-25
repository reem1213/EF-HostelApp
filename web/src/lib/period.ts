import type { Booking, DateRange } from "./domain/types";

/** All dates in the app are UTC midnights so a "day" is the same everywhere. */
const DAY = 86_400_000;

export const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** YYYY-MM for a date. */
export const monthOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export const previousMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return monthOf(new Date(Date.UTC(y, m - 2, 1)));
};

export const WINDOW_DAYS = 30;

/** The 30 days ending on `anchor` (inclusive). */
export function windowEndingOn(anchor: Date): DateRange {
  const end = new Date(utcDay(anchor).getTime() + DAY);
  return { start: new Date(end.getTime() - WINDOW_DAYS * DAY), end };
}

export function previousWindow(w: DateRange): DateRange {
  return { start: new Date(w.start.getTime() - WINDOW_DAYS * DAY), end: w.start };
}

/**
 * Picks the 30-day window to analyse. Normally the last 30 days. If the manager
 * has only uploaded older data, anchor on the latest stay instead so the pages
 * are not empty.
 */
export function chooseWindow(bookings: Booking[], now: Date): DateRange {
  const today = windowEndingOn(now);
  if (bookings.length === 0) return today;
  const hasRecent = bookings.some((b) => b.checkIn.getTime() < today.end.getTime() && b.checkIn.getTime() + b.nights * DAY > today.start.getTime());
  if (hasRecent) return today;
  const latest = bookings.reduce((m, b) => Math.max(m, b.checkIn.getTime() + (b.nights - 1) * DAY), 0);
  return windowEndingOn(new Date(latest));
}

export const formatRange = (w: DateRange) => {
  const f = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${f(w.start)} – ${f(new Date(w.end.getTime() - DAY))}`;
};
