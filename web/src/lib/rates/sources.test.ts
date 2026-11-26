import { describe, expect, it } from "vitest";

import { DORM_BED } from "../domain/guardrails";
import { SimulatedRates } from "./sources";

const DAY = 86_400_000;
const today = new Date(Date.UTC(2026, 10, 25));
const nights = (n: number, start = today) => Array.from({ length: n }, (_, i) => new Date(start.getTime() + i * DAY));
const comps = [{ id: "c1", name: "Wrigley Hostel" }, { id: "c2", name: "Freehand" }];
const args = { nights: nights(14), channels: ["direct", "booking_com", "hostelworld"], competitors: comps, baseRateCents: 3000, today };

describe("SimulatedRates", () => {
  it("is labelled simulated on every row", async () => {
    const rows = await new SimulatedRates("s").fetchRates(args);
    expect(new SimulatedRates("s").source).toBe("simulated");
    expect(rows.every((r) => r.source === "simulated" && r.roomType === DORM_BED && r.capturedAt.getTime() === today.getTime())).toBe(true);
  });

  it("gives one row per night for each own channel and each competitor", async () => {
    const rows = await new SimulatedRates("s").fetchRates(args);
    expect(rows).toHaveLength(14 * (3 + 2));
    const market = rows.filter((r) => r.competitorId);
    expect(market).toHaveLength(28);
    expect(market.every((r) => r.channel === "market")).toBe(true);
    expect(new Set(market.map((r) => r.competitorId))).toEqual(new Set(["c1", "c2"]));
  });

  it("is deterministic for a seed and different for another", async () => {
    const a = await new SimulatedRates("same").fetchRates(args);
    const b = await new SimulatedRates("same").fetchRates(args);
    const c = await new SimulatedRates("other").fetchRates(args);
    expect(a).toEqual(b);
    expect(a.map((r) => r.priceCents)).not.toEqual(c.map((r) => r.priceCents));
  });

  it("prices are positive whole 50-cent steps near the base rate", async () => {
    const rows = await new SimulatedRates("s").fetchRates(args);
    for (const r of rows) {
      expect(r.priceCents).toBeGreaterThan(0);
      expect(r.priceCents % 50).toBe(0);
      expect(r.priceCents).toBeGreaterThan(3000 * 0.6);
      expect(r.priceCents).toBeLessThan(3000 * 1.6);
    }
  });

  it("Booking.com carries a Genius member price below its list price; other channels carry none", async () => {
    const rows = await new SimulatedRates("s").fetchRates(args);
    const booking = rows.filter((r) => r.channel === "booking_com");
    expect(booking.every((r) => r.discountLabel === "Genius" && r.discountedPriceCents! < r.priceCents)).toBe(true);
    expect(rows.filter((r) => r.channel !== "booking_com").every((r) => r.discountedPriceCents === null && r.discountLabel === null)).toBe(true);
  });

  it("honours a hostel's own member-discount setting", async () => {
    const rows = await new SimulatedRates("s").fetchRates({ ...args, otaSettings: { hostelworld: { memberDiscount: 0.05 } } });
    const hw = rows.filter((r) => r.channel === "hostelworld");
    expect(hw.every((r) => r.discountLabel === "Member price" && r.discountedPriceCents === Math.round(r.priceCents * 0.95))).toBe(true);
  });

  it("weekends cost more than Tuesdays, as they do in real life", async () => {
    const rows = await new SimulatedRates("s").fetchRates({ ...args, nights: nights(28), channels: ["direct"], competitors: [] });
    const avg = (dow: number) => {
      const xs = rows.filter((r) => r.stayDate.getUTCDay() === dow).map((r) => r.priceCents);
      return xs.reduce((s, v) => s + v, 0) / xs.length;
    };
    expect(avg(6)).toBeGreaterThan(avg(2) * 1.2);
  });

  it("returns nothing for nothing, and survives a zero base rate", async () => {
    expect(await new SimulatedRates("s").fetchRates({ ...args, nights: [], channels: [], competitors: [] })).toEqual([]);
    const rows = await new SimulatedRates("s").fetchRates({ ...args, baseRateCents: 0 });
    expect(rows.every((r) => Number.isFinite(r.priceCents) && r.priceCents > 0)).toBe(true);
  });
});
