import { describe, expect, it } from "vitest";

import { costHistory, monthlySeries, weekdayOccupancy } from "./series";
import type { Booking } from "./types";

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));
const b = (id: string, checkIn: Date, nights: number, revenueCents = 1000): Booking => ({ id, channel: "direct", revenueCents, nights, checkIn });

describe("weekdayOccupancy", () => {
  // 28 days from Monday 2 Nov 2026: four of each weekday.
  const window = { start: d(2026, 11, 2), end: d(2026, 11, 30) };

  it("returns 7 entries, Sunday first", () => {
    const r = weekdayOccupancy([], 2, window);
    expect(r.map((x) => x.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(r.every((x) => x.occupancy === 0)).toBe(true);
  });

  it("one of two beds taken every Monday is 50% on Mondays and 0 elsewhere", () => {
    const mondays = [2, 9, 16, 23].map((day) => b(`m${day}`, d(2026, 11, day), 1));
    const r = weekdayOccupancy(mondays, 2, window);
    expect(r[1].occupancy).toBeCloseTo(0.5, 9);
    expect(r.filter((x) => x.weekday !== 1).every((x) => x.occupancy === 0)).toBe(true);
  });

  it("a two-night stay counts on both weekdays, and zero beds never divides by zero", () => {
    const r = weekdayOccupancy([b("a", d(2026, 11, 2), 2)], 1, window); // Mon + Tue, one night each, 4 of each weekday
    expect(r[1].occupancy).toBeCloseTo(0.25, 9);
    expect(r[2].occupancy).toBeCloseTo(0.25, 9);
    expect(weekdayOccupancy([b("a", d(2026, 11, 2), 1)], 0, window).every((x) => Number.isFinite(x.occupancy))).toBe(true);
  });
});

describe("monthlySeries", () => {
  const now = d(2026, 11, 24);

  it("returns exactly `months` entries, oldest first, zero-filled", () => {
    const r = monthlySeries([], 4, now);
    expect(r.map((x) => x.month)).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(r.every((x) => x.revenueCents === 0 && x.bookings === 0)).toBe(true);
  });

  it("counts a booking in its check-in month and sums revenue", () => {
    const r = monthlySeries([b("a", d(2026, 10, 31), 3, 5000), b("b", d(2026, 10, 2), 1, 2500), b("c", d(2026, 11, 1), 1, 900)], 3, now);
    expect(r.find((x) => x.month === "2026-10")).toEqual({ month: "2026-10", revenueCents: 7500, bookings: 2 });
    expect(r.find((x) => x.month === "2026-11")).toEqual({ month: "2026-11", revenueCents: 900, bookings: 1 });
    expect(r.find((x) => x.month === "2026-09")).toEqual({ month: "2026-09", revenueCents: 0, bookings: 0 });
  });

  it("ignores bookings outside the range", () => {
    expect(monthlySeries([b("old", d(2025, 1, 1), 1, 999)], 3, now).every((x) => x.bookings === 0)).toBe(true);
  });

  it("crosses a year boundary correctly", () => {
    expect(monthlySeries([], 3, d(2026, 1, 15)).map((x) => x.month)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("costHistory", () => {
  const inputs = [
    { month: "2026-10", rentCents: 100, utilitiesCents: 50, staffCents: 300, breakfastCents: 20, laundryCents: 80 },
    { month: "2026-11", rentCents: 100, utilitiesCents: 70, staffCents: 300, breakfastCents: 20, laundryCents: 90 },
  ];

  it("lists the last N months with each cost line, zero for months with no entry", () => {
    const r = costHistory(inputs, 3, d(2026, 11, 24));
    expect(r.map((x) => x.month)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(r[0].lines).toEqual({ staff: 0, laundry: 0, utilities: 0, rent: 0, breakfast: 0 });
    expect(r[2].lines).toEqual({ staff: 300, laundry: 90, utilities: 70, rent: 100, breakfast: 20 });
  });
});
