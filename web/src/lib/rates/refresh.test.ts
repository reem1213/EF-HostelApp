import { describe, expect, it } from "vitest";

import { MemoryStore } from "../data/memory-store";
import type { RateSnapshot } from "../domain/rates";
import { refreshRates } from "./refresh";
import { SimulatedRates, type RateSourceAdapter } from "./sources";

const DAY = 86_400_000;
const now = () => new Date(Date.UTC(2026, 10, 25, 9, 30));
const today = new Date(Date.UTC(2026, 10, 25));

async function setup(otas = ["booking_com", "hostelworld"]) {
  const store = new MemoryStore();
  const base = await store.createProperty("u1", { name: "H", beds: 10, currency: "USD", country: "US", otas });
  await store.addCompetitor(base.id, "Wrigley Hostel");
  return { store, property: base };
}

describe("refreshRates", () => {
  it("saves 14 nights for direct, each chosen OTA and each competitor", async () => {
    const { store, property } = await setup();
    const saved = await refreshRates({ store, adapter: new SimulatedRates("s"), property, now });
    expect(saved).toBe(14 * (1 + 2 + 1));
    const rows = await store.listRates(property.id, { start: today, end: new Date(today.getTime() + 30 * DAY) });
    expect(rows).toHaveLength(56);
    expect(Math.min(...rows.map((r) => r.stayDate.getTime()))).toBe(today.getTime());
    expect(Math.max(...rows.map((r) => r.stayDate.getTime()))).toBe(today.getTime() + 13 * DAY);
    expect(new Set(rows.map((r) => r.channel))).toEqual(new Set(["direct", "booking_com", "hostelworld", "market"]));
  });

  it("anchors prices on what the hostel actually earns per bed-night", async () => {
    const { store, property } = await setup();
    const bookings = Array.from({ length: 30 }, (_, i) => ({ externalId: `b${i}`, guestKey: null, channel: "direct" as const, checkIn: new Date(today.getTime() - (i + 1) * DAY), nights: 1, revenueCents: 5000 }));
    await store.addBookings(property.id, "imp", bookings);
    await refreshRates({ store, adapter: new SimulatedRates("s"), property, now });
    const direct = (await store.listRates(property.id, { start: today, end: new Date(today.getTime() + 14 * DAY) })).filter((r) => r.channel === "direct");
    const avg = direct.reduce((s, r) => s + r.priceCents, 0) / direct.length;
    expect(avg).toBeGreaterThan(5000 * 0.8);
    expect(avg).toBeLessThan(5000 * 1.3);
  });

  it("with no bookings uses a sensible default and still works for a hostel with no OTAs or competitors", async () => {
    const store = new MemoryStore();
    const property = await store.createProperty("u2", { name: "Bare", beds: 4, currency: "USD", country: "US" });
    expect(await refreshRates({ store, adapter: new SimulatedRates("s"), property, now })).toBe(14);
  });

  it("asks the adapter for the hostel's own member-discount settings", async () => {
    const { store, property } = await setup(["hostelworld"]);
    let seen: unknown;
    const spy: RateSourceAdapter = { name: "spy", source: "simulated", async fetchRates(a) { seen = a.otaSettings; return [] as RateSnapshot[]; } };
    await refreshRates({ store, adapter: spy, property: { ...property, otaSettings: { hostelworld: { memberDiscount: 0.05 } } }, now });
    expect(seen).toEqual({ hostelworld: { memberDiscount: 0.05 } });
  });

  it("saves nothing and reports zero when the adapter returns nothing", async () => {
    const { store, property } = await setup();
    const empty: RateSourceAdapter = { name: "empty", source: "provider", async fetchRates() { return []; } };
    expect(await refreshRates({ store, adapter: empty, property, now })).toBe(0);
  });
});
