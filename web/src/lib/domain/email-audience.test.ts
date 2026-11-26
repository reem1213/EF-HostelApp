import { describe, expect, it } from "vitest";

import { audienceReport, eligibleAudience, RELAY_DOMAINS } from "./email-audience";
import type { Booking } from "./types";

const DAY = 86_400_000;
const TODAY = new Date(Date.UTC(2026, 10, 26));
const at = (offset: number) => new Date(TODAY.getTime() + offset * DAY);
let n = 0;
const stay = (guestKey: string | undefined, offset: number): Booking => ({ id: `b${n++}`, channel: "direct", revenueCents: 3000, nights: 2, checkIn: at(offset), guestKey });
const twice = (key: string) => [stay(key, -200), stay(key, -100)];

describe("eligibleAudience", () => {
  it("includes a guest with two stays, lowercased, once", () => {
    expect(eligibleAudience([...twice("Ann@Example.com"), ...twice("ann@example.com")], [], TODAY)).toEqual(["ann@example.com"]);
  });

  it("includes a guest whose only stay finished before the last 30 days, but not one who stayed or books recently", () => {
    expect(eligibleAudience([stay("old@example.com", -120), stay("recent@example.com", -10), stay("upcoming@example.com", 5)], [], TODAY)).toEqual(["old@example.com"]);
  });

  it("excludes name-only guests and invalid addresses", () => {
    expect(eligibleAudience([...twice("jane doe"), ...twice("not-an-email"), ...twice("a@b"), ...twice("")], [], TODAY)).toEqual([]);
    expect(eligibleAudience([stay(undefined, -200), stay(undefined, -100)], [], TODAY)).toEqual([]);
  });

  it("excludes every OTA relay domain, including subdomains of them", () => {
    for (const d of RELAY_DOMAINS) expect(eligibleAudience(twice(`x@${d}`), [], TODAY), d).toEqual([]);
    expect(RELAY_DOMAINS).toEqual(expect.arrayContaining(["guest.booking.com", "m.expediapartner.com", "guest.airbnb.com", "reply.hostelworld.com"]));
    expect(eligibleAudience(twice("x@abc.guest.booking.com"), [], TODAY)).toEqual([]);
  });

  it("keeps ordinary addresses at similar-looking domains", () => {
    expect(eligibleAudience(twice("x@booking.com"), [], TODAY)).toEqual(["x@booking.com"]);
    expect(eligibleAudience(twice("x@notguest.booking.com"), [], TODAY)).toEqual(["x@notguest.booking.com"]);
  });

  it("excludes suppressed addresses whatever their case", () => {
    expect(eligibleAudience(twice("ann@example.com"), ["ANN@example.com"], TODAY)).toEqual([]);
  });

  it("returns nothing for no bookings", () => {
    expect(eligibleAudience([], [], TODAY)).toEqual([]);
  });
});

describe("audienceReport", () => {
  it("counts who was left out and why, among guests who would otherwise qualify", () => {
    const b = [...twice("ok@example.com"), ...twice("x@guest.booking.com"), ...twice("jane doe"), ...twice("gone@example.com"), stay("single@example.com", -10)];
    const r = audienceReport(b, ["gone@example.com"], TODAY);
    expect(r.emails).toEqual(["ok@example.com"]);
    expect(r.excluded).toEqual({ relay: 1, missing: 1, suppressed: 1 });
  });
});
