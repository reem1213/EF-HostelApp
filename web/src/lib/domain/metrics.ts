import type { Booking, DateRange } from "./types";
import { rangeDays } from "./types";

const DAY = 86_400_000;

export type ProfitMetrics = {
  days: number;
  bookingsCount: number;
  occupiedBedNights: number;
  /** occupied bed-nights / (beds x days), 0-1. */
  occupancyRate: number;
  revenueCents: number;
  /** Average daily rate per occupied bed. */
  adrCents: number;
  /** Revenue per available bed per night. */
  revPabCents: number;
  directShare: number;
  otaShare: number;
  /** Share of this period's guests who had stayed before the period began. null = no guest identity in the data. */
  returningGuestShare: number | null;
  uniqueGuests: number;
  returningGuests: number;
  /** Average revenue per stay, cents. */
  avgStayRevenueCents: number;
};

/** Nights of [checkIn, checkIn + nights) that fall inside the window. */
export function nightsInWindow(b: Booking, w: DateRange): number {
  const start = Math.max(b.checkIn.getTime(), w.start.getTime());
  const end = Math.min(b.checkIn.getTime() + b.nights * DAY, w.end.getTime());
  return Math.max(0, Math.round((end - start) / DAY));
}

/** Stays overlapping the window, with nights and revenue pro-rated to the part inside it. */
export function bookingsInWindow(all: Booking[], w: DateRange): Booking[] {
  const out: Booking[] = [];
  for (const b of all) {
    const n = nightsInWindow(b, w);
    if (n <= 0) continue;
    out.push({ ...b, nights: n, revenueCents: Math.round(b.revenueCents * (n / b.nights)) });
  }
  return out;
}

/**
 * Profit-side metrics for one window. `allBookings` is the full history so
 * "returning guest" can look back before the window.
 */
export function profitMetrics(allBookings: Booking[], window: DateRange, beds: number): ProfitMetrics {
  const days = Math.max(1, rangeDays(window));
  const inWindow = allBookings.filter((b) => nightsInWindow(b, window) > 0);

  let nights = 0;
  let revenue = 0;
  let direct = 0;
  let ota = 0;
  for (const b of inWindow) {
    const n = nightsInWindow(b, window);
    const share = b.nights > 0 ? n / b.nights : 0;
    const rev = Math.round(b.revenueCents * share);
    nights += n;
    revenue += rev;
    if (b.channel === "direct") direct += rev;
    if (b.channel === "ota") ota += rev;
  }

  const guestsNow = new Map<string, true>();
  const returning = new Set<string>();
  const hasIdentity = inWindow.some((b) => b.guestKey);
  if (hasIdentity) {
    const before = new Set(
      allBookings.filter((b) => b.guestKey && b.checkIn.getTime() < window.start.getTime()).map((b) => b.guestKey!),
    );
    for (const b of inWindow) {
      if (!b.guestKey) continue;
      guestsNow.set(b.guestKey, true);
      if (before.has(b.guestKey)) returning.add(b.guestKey);
    }
  }

  const available = beds * days;
  return {
    days,
    bookingsCount: inWindow.length,
    occupiedBedNights: nights,
    occupancyRate: available > 0 ? nights / available : 0,
    revenueCents: revenue,
    adrCents: nights > 0 ? Math.round(revenue / nights) : 0,
    revPabCents: available > 0 ? Math.round(revenue / available) : 0,
    directShare: revenue > 0 ? direct / revenue : 0,
    otaShare: revenue > 0 ? ota / revenue : 0,
    returningGuestShare: hasIdentity && guestsNow.size > 0 ? returning.size / guestsNow.size : null,
    uniqueGuests: guestsNow.size,
    returningGuests: returning.size,
    avgStayRevenueCents: inWindow.length > 0 ? Math.round(revenue / inWindow.length) : 0,
  };
}

/** Percentage change, null when the previous value is zero. */
export function pctChange(now: number, before: number): number | null {
  return before > 0 ? (now - before) / before : null;
}
