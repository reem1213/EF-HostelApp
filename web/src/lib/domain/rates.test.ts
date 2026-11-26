import { describe, expect, it } from "vitest";

import { buildRateTable, columnKeyFor, currentSnapshot, netAfterCommission, rateFlags, type RateColumn, type RateSnapshot, type RateTableRow } from "./rates";

const d = (day: number) => new Date(Date.UTC(2026, 10, day));
const snap = (over: Partial<RateSnapshot>): RateSnapshot => ({
  stayDate: d(28), channel: "direct", competitorId: null, roomType: "Dorm bed", priceCents: 3000,
  discountedPriceCents: null, discountLabel: null, source: "simulated", capturedAt: d(25), ...over,
});

describe("netAfterCommission", () => {
  it("a Genius-style member price: list 4000, 10% off, 15% commission on the discounted price", () => {
    expect(netAfterCommission({ priceCents: 4000, discountPct: 0.1, commission: 0.15 })).toEqual({ listCents: 4000, discountedCents: 3600, keepCents: 3060 });
  });

  it("with no member discount the commission applies to the list price", () => {
    expect(netAfterCommission({ priceCents: 4000, discountPct: null, commission: 0.15 })).toEqual({ listCents: 4000, discountedCents: 4000, keepCents: 3400 });
  });

  it("direct bookings have no commission", () => {
    expect(netAfterCommission({ priceCents: 4000, discountPct: null, commission: 0 }).keepCents).toBe(4000);
  });

  it("rounds to whole cents and never goes negative", () => {
    expect(netAfterCommission({ priceCents: 3333, discountPct: 0.1, commission: 0.15 }).keepCents).toBe(Math.round(Math.round(3333 * 0.9) * 0.85));
    expect(netAfterCommission({ priceCents: 0, discountPct: 0.1, commission: 0.15 }).keepCents).toBe(0);
  });
});

describe("columnKeyFor", () => {
  it("own channels use their id, competitors use comp:<id>", () => {
    expect(columnKeyFor(snap({ channel: "booking_com" }))).toBe("booking_com");
    expect(columnKeyFor(snap({ channel: "market", competitorId: "c1" }))).toBe("comp:c1");
  });
});

describe("buildRateTable", () => {
  const columns: RateColumn[] = [
    { key: "direct", label: "Direct", kind: "direct" },
    { key: "booking_com", label: "Booking.com", kind: "ota" },
    { key: "comp:c1", label: "Wrigley Hostel", kind: "competitor" },
  ];
  const nights = [d(28), d(29)];

  it("lays out one row per night and one cell per column, with null where there is no rate", () => {
    const rows = buildRateTable([snap({ priceCents: 3000 }), snap({ channel: "booking_com", priceCents: 3200, discountedPriceCents: 2880, discountLabel: "Genius" })], nights, columns);
    expect(rows).toHaveLength(2);
    expect(rows[0].cells.direct).toMatchObject({ listCents: 3000, discountedCents: null });
    expect(rows[0].cells.booking_com).toMatchObject({ listCents: 3200, discountedCents: 2880, discountLabel: "Genius" });
    expect(rows[0].cells["comp:c1"]).toBeNull();
    expect(rows[1].cells.direct).toBeNull();
  });

  it("the most recent snapshot for a cell wins", () => {
    const rows = buildRateTable([snap({ priceCents: 3000, capturedAt: d(20) }), snap({ priceCents: 3500, capturedAt: d(24), source: "manual" })], [d(28)], columns);
    expect(rows[0].cells.direct).toMatchObject({ listCents: 3500, source: "manual" });
  });

  it("a manual price is not replaced by a later simulated refresh", () => {
    const rows = buildRateTable([snap({ priceCents: 3500, source: "manual", capturedAt: d(24) }), snap({ priceCents: 3000, capturedAt: d(26) })], [d(28)], columns);
    expect(rows[0].cells.direct).toMatchObject({ listCents: 3500, source: "manual" });
  });

  it("only shows the requested room type", () => {
    const rows = buildRateTable([snap({ roomType: "Private room", priceCents: 9000 })], [d(28)], columns);
    expect(rows[0].cells.direct).toBeNull();
  });
});

describe("currentSnapshot", () => {
  it("returns null for nothing", () => {
    expect(currentSnapshot([])).toBeNull();
  });

  it("a hand-set rate keeps winning over a newer simulated refresh", () => {
    const manual = snap({ priceCents: 3400, source: "manual", capturedAt: d(24) });
    const refreshed = snap({ priceCents: 3000, source: "simulated", capturedAt: d(26) });
    expect(currentSnapshot([manual, refreshed])?.priceCents).toBe(3400);
    expect(currentSnapshot([refreshed, manual])?.priceCents).toBe(3400);
  });

  it("among live or manual rates the newest wins, and a live feed beats an older manual price", () => {
    const manual = snap({ priceCents: 3400, source: "manual", capturedAt: d(24) });
    const pms = snap({ priceCents: 3500, source: "pms", capturedAt: d(26) });
    expect(currentSnapshot([manual, pms])?.priceCents).toBe(3500);
  });

  it("falls back to the newest simulated rate when nothing else exists", () => {
    expect(currentSnapshot([snap({ priceCents: 3000, capturedAt: d(20) }), snap({ priceCents: 3100, capturedAt: d(24) })])?.priceCents).toBe(3100);
  });
});

describe("rateFlags", () => {
  const cell = (listCents: number) => ({ listCents, discountedCents: null, discountLabel: null, source: "simulated" as const });
  const row = (cells: RateTableRow["cells"]): RateTableRow => ({ night: d(28), cells });

  it("flags direct priced above an OTA", () => {
    expect(rateFlags({ row: row({ direct: cell(4500), booking_com: cell(4000) }), floorCents: 765, compMedianCents: null })).toContain("direct_above_ota");
    expect(rateFlags({ row: row({ direct: cell(3900), booking_com: cell(4000) }), floorCents: 765, compMedianCents: null })).not.toContain("direct_above_ota");
  });

  it("flags a direct price below the cost-based floor, allowing exactly the floor", () => {
    expect(rateFlags({ row: row({ direct: cell(599) }), floorCents: 600, compMedianCents: null })).toContain("below_floor");
    expect(rateFlags({ row: row({ direct: cell(600) }), floorCents: 600, compMedianCents: null })).not.toContain("below_floor");
  });

  it("flags more than 15% above or below the competitor median", () => {
    expect(rateFlags({ row: row({ direct: cell(3600) }), floorCents: 0, compMedianCents: 3000 })).toContain("above_comp");
    expect(rateFlags({ row: row({ direct: cell(3450) }), floorCents: 0, compMedianCents: 3000 })).toEqual([]);
    expect(rateFlags({ row: row({ direct: cell(2500) }), floorCents: 0, compMedianCents: 3000 })).toContain("below_comp");
  });

  it("returns nothing, never throws, when the row has no direct rate", () => {
    expect(rateFlags({ row: row({ direct: null, booking_com: cell(4000) }), floorCents: 600, compMedianCents: 3000 })).toEqual([]);
  });
});
