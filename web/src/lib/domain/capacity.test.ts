import { describe, expect, it } from "vitest";

import { capacityCheck } from "./capacity";
import type { Booking } from "./types";

const DAY = 86_400_000;
const d = (day: number) => new Date(Date.UTC(2026, 10, day)); // November 2026
const b = (id: string, day: number, nights: number): Booking => ({ id, channel: "direct", revenueCents: 0, nights, checkIn: d(day) });

describe("capacityCheck", () => {
  it("flags the night when more bookings overlap than there are beds", () => {
    const r = capacityCheck([b("a", 5, 2), b("b", 5, 1), b("c", 5, 3)], 2);
    expect(r).toEqual({ exceeded: true, peak: 3, peakDate: d(5), nightsOver: 1 });
  });

  it("is fine when beds cover the peak", () => {
    expect(capacityCheck([b("a", 5, 2), b("b", 5, 1), b("c", 5, 3)], 3)).toMatchObject({ exceeded: false, peak: 3 });
  });

  it("never counts back-to-back stays twice (check-out morning is free)", () => {
    expect(capacityCheck([b("a", 5, 1), b("b", 6, 1)], 1)).toMatchObject({ exceeded: false, peak: 1 });
  });

  it("an empty list is zero, not NaN", () => {
    expect(capacityCheck([], 10)).toEqual({ exceeded: false, peak: 0, peakDate: null, nightsOver: 0 });
  });

  it("zero beds with a booking is exceeded and finite", () => {
    const r = capacityCheck([b("a", 5, 2)], 0);
    expect(r).toMatchObject({ exceeded: true, peak: 1, nightsOver: 2 });
    expect(Number.isFinite(r.peak)).toBe(true);
  });

  it("a long stay counts on every night it covers", () => {
    // 30-night stay from the 1st, plus a 5-night stay from the 10th: two beds in use on nights 10-14.
    const r = capacityCheck([b("long", 1, 30), b("short", 10, 5)], 1);
    expect(r).toEqual({ exceeded: true, peak: 2, peakDate: d(10), nightsOver: 5 });
  });

  it("reports the earliest night of the peak", () => {
    const r = capacityCheck([b("a", 3, 1), b("b", 3, 1), b("c", 20, 1), b("d", 20, 1)], 5);
    expect(r.peakDate).toEqual(d(3));
    expect(r.peak).toBe(2);
    expect(DAY).toBeGreaterThan(0);
  });
});
