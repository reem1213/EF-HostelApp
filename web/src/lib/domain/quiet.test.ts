import { describe, expect, it } from "vitest";

import { quietestNights, suggestPrice } from "./quiet";
import type { Booking } from "./types";

const DAY = 86_400_000;
const TODAY = new Date(Date.UTC(2026, 10, 24)); // a Tuesday
const at = (offset: number) => new Date(TODAY.getTime() + offset * DAY);
let n = 0;
/** `beds` one-night bookings on the night at `offset` days from today. */
const fill = (offset: number, beds: number): Booking[] =>
  Array.from({ length: beds }, () => ({ id: `b${n++}`, channel: "direct" as const, revenueCents: 3000, nights: 1, checkIn: at(offset) }));

/** 10 beds. Past Tuesdays (8 weeks) at 4 beds = 40%. */
const history = () => Array.from({ length: 8 }, (_, w) => fill(-7 * (w + 1), 4)).flat();

describe("quietestNights", () => {
  it("ranks an upcoming Tuesday at 10% against a 40% Tuesday average first, with a gap of 0.30", () => {
    const b = [...history(), ...fill(0, 4), ...fill(7, 1), ...fill(14, 4), ...fill(21, 4), ...fill(28, 4)];
    const q = quietestNights(b, 10, TODAY, 30, 3);
    expect(q[0].date.getTime()).toBe(at(7).getTime());
    expect(q[0].weekday).toBe(2);
    expect(q[0].occupancy).toBeCloseTo(0.1);
    expect(q[0].weekdayAvg).toBeCloseTo(0.4);
    expect(q[0].gap).toBeCloseTo(0.3);
  });

  it("only lists nights below their weekday's usual level", () => {
    const b = [...history(), ...fill(14, 4), ...fill(21, 9)];
    expect(quietestNights(b, 10, TODAY, 30, 5).some((x) => x.date.getTime() === at(14).getTime())).toBe(false);
    expect(quietestNights(b, 10, TODAY, 30, 5).some((x) => x.date.getTime() === at(21).getTime())).toBe(false);
  });

  it("returns nothing without bookings or beds, and never lists a full night", () => {
    expect(quietestNights([], 10, TODAY, 30, 3)).toEqual([]);
    expect(quietestNights(history(), 0, TODAY, 30, 3)).toEqual([]);
    const full = [...history(), ...fill(7, 10)];
    expect(quietestNights(full, 10, TODAY, 30, 30).some((x) => x.date.getTime() === at(7).getTime())).toBe(false);
  });

  it("looks only inside the horizon, starting today, and honours the limit", () => {
    const b = history();
    const q = quietestNights(b, 10, TODAY, 14, 2);
    expect(q).toHaveLength(2);
    expect(q.every((x) => x.date >= TODAY && x.date.getTime() < at(14).getTime())).toBe(true);
  });

  it("breaks ties by the earlier night", () => {
    const q = quietestNights(history(), 10, TODAY, 30, 4);
    const sorted = [...q].sort((a, b) => a.occupancy - b.occupancy || a.date.getTime() - b.date.getTime());
    expect(q.map((x) => x.date.getTime())).toEqual(sorted.map((x) => x.date.getTime()));
  });
});

describe("suggestPrice", () => {
  it("is held at the floor when a proportional cut would go below it", () => {
    expect(suggestPrice({ currentCents: 3000, gap: 0.3, floorCents: 2800, ceilingCents: null, maxChangePct: 0.15 })).toBe(2800);
  });
  it("cuts in proportion to the gap, capped by the daily limit", () => {
    expect(suggestPrice({ currentCents: 3000, gap: 0.1, floorCents: 1000, ceilingCents: null, maxChangePct: 0.15 })).toBe(2700);
    expect(suggestPrice({ currentCents: 3000, gap: 0.5, floorCents: 1000, ceilingCents: null, maxChangePct: 0.15 })).toBe(2550);
  });
  it("leaves the price alone with no gap, or when it is already at or under the floor", () => {
    expect(suggestPrice({ currentCents: 3000, gap: 0, floorCents: 1000, ceilingCents: null, maxChangePct: 0.15 })).toBe(3000);
    expect(suggestPrice({ currentCents: 2000, gap: 0.3, floorCents: 2400, ceilingCents: null, maxChangePct: 0.15 })).toBe(2000);
  });
  it("never suggests a price above a ceiling that sits under the current price", () => {
    expect(suggestPrice({ currentCents: 3000, gap: 0.1, floorCents: 1000, ceilingCents: 2500, maxChangePct: 0.15 })).toBe(2500);
  });
});
