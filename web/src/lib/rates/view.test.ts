import { describe, expect, it } from "vitest";

import { DORM_BED } from "../domain/guardrails";
import type { RateSnapshot } from "../domain/rates";
import { buildRateView } from "./view";

const d = (day: number) => new Date(Date.UTC(2026, 10, day));
const snap = (over: Partial<RateSnapshot>): RateSnapshot => ({
  stayDate: d(27), channel: "direct", competitorId: null, roomType: DORM_BED, priceCents: 3000,
  discountedPriceCents: null, discountLabel: null, source: "simulated", capturedAt: d(26), ...over,
});
const base = { today: d(27), floorCents: 2400, otaSettings: {}, otas: ["booking_com", "hostelworld"], competitors: [{ id: "c1", name: "Wrigley" }], nightsCount: 3 };

describe("buildRateView", () => {
  it("has columns for direct, each OTA, then each competitor, and one row per night", () => {
    const v = buildRateView({ ...base, snaps: [] });
    expect(v.columns.map((c) => c.key)).toEqual(["direct", "booking_com", "hostelworld", "comp:c1"]);
    expect(v.columns.map((c) => c.label)).toEqual(["Direct", "Booking.com", "Hostelworld", "Wrigley"]);
    expect(v.rows.map((r) => r.night.getTime())).toEqual([d(27).getTime(), d(28).getTime(), d(29).getTime()]);
  });

  it("is empty when no rates exist, and says nothing is simulated", () => {
    const v = buildRateView({ ...base, snaps: [] });
    expect(v.hasRates).toBe(false);
    expect(v.hasSimulated).toBe(false);
  });

  it("shows what you keep after the OTA's member discount and commission, 15% by default", () => {
    const v = buildRateView({ ...base, snaps: [snap({ channel: "booking_com", priceCents: 4000, discountedPriceCents: 3600, discountLabel: "Genius" })] });
    const cell = v.rows[0].cells.booking_com!;
    expect(cell.listCents).toBe(4000);
    expect(cell.memberCents).toBe(3600);
    expect(cell.memberLabel).toBe("Genius");
    expect(cell.keepCents).toBe(3060); // 3600 less 15%
  });

  it("uses the hostel's own commission override and shows direct at its full price", () => {
    const v = buildRateView({ ...base, otaSettings: { hostelworld: { commission: 0.2 } }, snaps: [snap({ channel: "hostelworld", priceCents: 3000 }), snap({ channel: "direct", priceCents: 3000 })] });
    expect(v.rows[0].cells.hostelworld!.keepCents).toBe(2400);
    expect(v.rows[0].cells.direct!.keepCents).toBe(3000);
    expect(v.rows[0].cells.direct!.memberCents).toBeNull();
  });

  it("does not show a competitor's cell as 'you keep'", () => {
    const v = buildRateView({ ...base, snaps: [snap({ channel: "market", competitorId: "c1", priceCents: 3200 })] });
    expect(v.rows[0].cells["comp:c1"]!.keepCents).toBeNull();
  });

  it("flags a night where direct is under the floor, and where it is dearer than an OTA", () => {
    const v = buildRateView({ ...base, snaps: [snap({ priceCents: 2000 }), snap({ channel: "hostelworld", priceCents: 1900 })] });
    expect(v.rows[0].flags).toEqual(expect.arrayContaining(["below_floor", "direct_above_ota"]));
  });

  it("marks the view simulated when any shown rate is simulated, but not when all are hand-set", () => {
    expect(buildRateView({ ...base, snaps: [snap({ source: "simulated" })] }).hasSimulated).toBe(true);
    expect(buildRateView({ ...base, snaps: [snap({ source: "manual" })] }).hasSimulated).toBe(false);
  });

  it("ignores rates for nights outside the window", () => {
    const v = buildRateView({ ...base, snaps: [snap({ stayDate: d(40) })] });
    expect(v.hasRates).toBe(false);
  });

  it("gives the direct price per night for the strip, null where there is none", () => {
    const v = buildRateView({ ...base, snaps: [snap({ priceCents: 3000 }), snap({ stayDate: d(29), priceCents: 3600 })] });
    expect(v.directPrices).toEqual([3000, null, 3600]);
  });
});
