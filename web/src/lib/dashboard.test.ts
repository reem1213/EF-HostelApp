import { describe, expect, it } from "vitest";

import { loadDashboard } from "./dashboard";
import { MemoryStore } from "./data/memory-store";
import { seedDemo } from "./data/demo-seed";
import { emptyCostInputs } from "./domain/costs";
import { parseBookingsCsv } from "./domain/import/parsers";
import { monthOf } from "./period";

const now = new Date(Date.UTC(2026, 10, 24, 12));

async function demo() {
  const store = new MemoryStore();
  const property = await seedDemo(store, "u1", now);
  return { store, property };
}

describe("dashboard on the demo hostel", () => {
  it("computes occupancy near 78% and a cost per bed from the five lines", async () => {
    const { store, property } = await demo();
    const d = await loadDashboard(store, property, now);
    expect(d.metrics.occupancyRate).toBeGreaterThan(0.7);
    expect(d.metrics.occupancyRate).toBeLessThan(0.85);
    expect(d.breakdown.missing).toEqual([]); // entered costs plus imported laundry
    expect(d.breakdown.lines.find((l) => l.line === "laundry")?.source).toBe("imported");
    expect(d.breakdown.lines.find((l) => l.line === "rent")?.source).toBe("entered");
    // five-line cost per bed drives the audit figure
    expect(d.audit.costPerBedNightCents).toBe(d.breakdown.perBedNightCents);
    expect(d.breakdown.perBedNightCents).toBeGreaterThan(400);
    expect(d.breakdown.perBedNightCents).toBeLessThan(900);
  });

  it("finds the seeded leaks, each with fix steps", async () => {
    const { store, property } = await demo();
    const d = await loadDashboard(store, property, now);
    const ids = d.audit.findings.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(["laundry-peer", "ota-commission", "dupe-mailchimp", "spike-supplies"]));
    expect(d.actions.every((a) => a.steps.length > 0)).toBe(true);
  });

  it("measures retention from guest identity", async () => {
    const { store, property } = await demo();
    const d = await loadDashboard(store, property, now);
    expect(d.metrics.returningGuestShare).not.toBeNull();
    expect(d.metrics.returningGuestShare!).toBeGreaterThan(0.05);
    expect(d.metrics.returningGuestShare!).toBeLessThan(0.2);
    expect(d.actions.some((a) => a.id === "retention-discount")).toBe(true);
  });

  it("moves addressed leaks to recovered and drops them from the next steps", async () => {
    const { store, property } = await demo();
    const before = await loadDashboard(store, property, now);
    const top = before.actions.find((a) => a.kind === "leak")!;
    await store.markAddressed(property.id, top.id);
    const after = await loadDashboard(store, property, now);
    expect(after.actions.some((a) => a.id === top.id)).toBe(false);
    expect(after.audit.recoveredCents).toBe(top.monthlyImpactCents);
    expect(after.audit.openLeakCents).toBe(before.audit.openLeakCents - top.monthlyImpactCents);
  });

  it("compares this window with the previous one", async () => {
    const { store, property } = await demo();
    const d = await loadDashboard(store, property, now);
    expect(d.prevMetrics.bookingsCount).toBeGreaterThan(0);
    expect(d.prevBreakdown.lines.find((l) => l.line === "utilities")?.totalCents).toBe(62_000);
  });
});

describe("dashboard with no data", () => {
  it("asks for the data it needs, in order, and never shows NaN", async () => {
    const store = new MemoryStore();
    const property = await store.createProperty("u2", { name: "Empty", beds: 10, currency: "USD", country: "US" });
    const d = await loadDashboard(store, property, now);
    expect(d.hasAnyData).toBe(false);
    expect(d.actions[0].id).toBe("setup-bookings");
    expect(d.actions.map((a) => a.id)).toEqual(expect.arrayContaining(["setup-costs", "setup-bank", "setup-reviews"]));
    expect(d.audit.profitHealth).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(d.breakdown.perBedNightCents)).toBe(true);
  });
});

describe("importing then analysing", () => {
  it("analyses an uploaded bookings file and anchors on the latest stays", async () => {
    const store = new MemoryStore();
    const property = await store.createProperty("u3", { name: "Csv Hostel", beds: 10, currency: "USD", country: "US" });
    const csv = ["Reservation ID,Email,Source,Check-in,Check-out,Total"]
      .concat(Array.from({ length: 20 }, (_, i) => `R${i},g${i % 5}@x.com,${i % 2 ? "Booking.com" : "Direct"},2026-09-${String(1 + i).padStart(2, "0")},2026-09-${String(3 + i).padStart(2, "0")},60`))
      .join("\n");
    const parsed = parseBookingsCsv(csv);
    expect(parsed.errors).toEqual([]);
    await store.addBookings(property.id, "imp", parsed.rows);
    await store.saveCostInputs(property.id, { ...emptyCostInputs(monthOf(now)), rentCents: 100_000 });

    const d = await loadDashboard(store, property, now);
    // September data is older than 30 days, so the window moves to it.
    expect(d.metrics.bookingsCount).toBeGreaterThan(0);
    expect(d.window.end.getUTCMonth()).toBe(8);
    expect(d.dataState.hasBookings).toBe(true);
  });

  it("re-importing the same bookings updates rather than duplicates", async () => {
    const store = new MemoryStore();
    const p = await store.createProperty("u4", { name: "X", beds: 5, currency: "USD", country: "US" });
    const rows = parseBookingsCsv("Reservation ID,Check-in,Check-out,Total\nA,2026-11-01,2026-11-03,50").rows;
    expect(await store.addBookings(p.id, "i1", rows)).toEqual({ inserted: 1, updated: 0 });
    expect(await store.addBookings(p.id, "i2", rows)).toEqual({ inserted: 0, updated: 1 });
    expect(await store.listBookings(p.id)).toHaveLength(1);
  });
});
