import { describe, expect, it } from "vitest";

import { nightStrip } from "./night-strip";
import type { Booking } from "./types";

const DAY = 86_400_000;
const d = (day: number) => new Date(Date.UTC(2026, 10, day));
const b = (id: string, day: number, nights = 1): Booking => ({ id, channel: "direct", revenueCents: 0, nights, checkIn: d(day) });

describe("nightStrip", () => {
  it("returns one cell per night from the start date", () => {
    const cells = nightStrip([], 10, d(1), 5, d(3));
    expect(cells.map((c) => c.date.getTime())).toEqual([0, 1, 2, 3, 4].map((i) => d(1).getTime() + i * DAY));
  });

  it("occupancy is beds used over beds available", () => {
    const five = ["a", "b", "c", "d", "e"].map((id) => b(id, 2));
    const cells = nightStrip(five, 10, d(1), 3, d(3));
    expect(cells[1].occupancy).toBe(0.5);
    expect(cells[0].occupancy).toBe(0);
  });

  it("a multi-night stay fills each of its nights but not the check-out day", () => {
    const cells = nightStrip([b("x", 2, 2)], 4, d(1), 4, d(4));
    expect(cells.map((c) => c.occupancy)).toEqual([0, 0.25, 0.25, 0]);
  });

  it("marks nights after today as future, and today as today", () => {
    const cells = nightStrip([], 10, d(1), 5, d(3));
    expect(cells.map((c) => c.future)).toEqual([false, false, false, true, true]);
    expect(cells.map((c) => c.isToday)).toEqual([false, false, true, false, false]);
  });

  it("caps occupancy at 100% when data is over capacity, and zero beds is not NaN", () => {
    expect(nightStrip([b("a", 1), b("b", 1), b("c", 1)], 2, d(1), 1, d(1))[0].occupancy).toBe(1);
    expect(nightStrip([b("a", 1)], 0, d(1), 1, d(1))[0].occupancy).toBe(0);
  });
});
