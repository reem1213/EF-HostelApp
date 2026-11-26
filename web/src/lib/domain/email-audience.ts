import type { Booking } from "./types";

const DAY = 86_400_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Booking sites hide guests behind forwarding addresses that cannot be used for marketing. */
export const RELAY_DOMAINS = ["guest.booking.com", "m.expediapartner.com", "guest.airbnb.com", "reply.hostelworld.com"];

const isRelay = (email: string) => {
  const domain = email.slice(email.lastIndexOf("@") + 1);
  return RELAY_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
};

export type AudienceReport = { emails: string[]; excluded: { relay: number; missing: number; suppressed: number } };

/**
 * Past guests worth writing to: two or more stays, or one stay that ended more than 30 days ago. Only real,
 * usable addresses count; OTA relay addresses, name-only guests and suppressed addresses are left out and counted.
 */
export function audienceReport(bookings: Booking[], suppressed: string[], today: Date): AudienceReport {
  const stays = new Map<string, Booking[]>();
  for (const b of bookings) {
    const key = b.guestKey?.trim().toLowerCase();
    if (key) stays.set(key, [...(stays.get(key) ?? []), b]);
  }
  const blocked = new Set(suppressed.map((s) => s.trim().toLowerCase()));
  const cutoff = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - 30 * DAY;

  const out: AudienceReport = { emails: [], excluded: { relay: 0, missing: 0, suppressed: 0 } };
  for (const [key, list] of stays) {
    const returning = list.length >= 2 || list.some((b) => b.checkIn.getTime() + b.nights * DAY <= cutoff);
    if (!returning) continue;
    if (!EMAIL.test(key)) out.excluded.missing++;
    else if (isRelay(key)) out.excluded.relay++;
    else if (blocked.has(key)) out.excluded.suppressed++;
    else out.emails.push(key);
  }
  return out;
}

export const eligibleAudience = (bookings: Booking[], suppressed: string[], today: Date): string[] => audienceReport(bookings, suppressed, today).emails;
