import { describe, expect, it } from "vitest";

import { blendedCommission, DEFAULT_DIRECT_FEE, directWhatIf, netForMix } from "./ota-economics";

const base = { revenueCents: 100_000, otaCommission: 0.15, directFee: 0.03 };

describe("netForMix", () => {
  it("keeps 85% of OTA revenue and 97% of direct revenue", () => {
    expect(netForMix({ ...base, directShare: 0 })).toBe(85_000);
    expect(netForMix({ ...base, directShare: 1 })).toBe(97_000);
  });

  it("blends the two by share: 40% direct = 40000 x 0.97 + 60000 x 0.85", () => {
    expect(netForMix({ ...base, directShare: 0.4 })).toBe(89_800);
  });

  it("clamps shares outside 0..1 and survives zero revenue", () => {
    expect(netForMix({ ...base, directShare: 1.5 })).toBe(97_000);
    expect(netForMix({ ...base, directShare: -1 })).toBe(85_000);
    expect(netForMix({ revenueCents: 0, directShare: 0.5, otaCommission: 0.15, directFee: 0.03 })).toBe(0);
  });
});

describe("directWhatIf", () => {
  it("moving from 25% to 50% direct earns 25000 x (0.97 - 0.85) = 3000 more", () => {
    expect(directWhatIf({ ...base, currentDirectShare: 0.25, newDirectShare: 0.5 })).toEqual({ currentNetCents: 88_000, newNetCents: 91_000, deltaCents: 3_000 });
  });

  it("shows a loss when direct share falls", () => {
    expect(directWhatIf({ ...base, currentDirectShare: 0.5, newDirectShare: 0.25 }).deltaCents).toBe(-3_000);
  });

  it("is all zeros with no revenue, and the same share changes nothing", () => {
    expect(directWhatIf({ revenueCents: 0, currentDirectShare: 0.2, newDirectShare: 0.9, otaCommission: 0.15, directFee: 0.03 })).toEqual({ currentNetCents: 0, newNetCents: 0, deltaCents: 0 });
    expect(directWhatIf({ ...base, currentDirectShare: 0.3, newDirectShare: 0.3 }).deltaCents).toBe(0);
  });

  it("slider endpoints 0% and 100% give finite numbers", () => {
    const r = directWhatIf({ ...base, currentDirectShare: 0.25, newDirectShare: 1 });
    expect(r.newNetCents).toBe(97_000);
    expect(Number.isFinite(r.deltaCents)).toBe(true);
  });
});

describe("blendedCommission", () => {
  it("weights each OTA's commission by its revenue, honouring overrides", () => {
    expect(blendedCommission({ booking_com: 100, hostelworld: 100 }, { hostelworld: { commission: 0.1 } })).toBeCloseTo(0.125, 9);
    expect(blendedCommission({ booking_com: 300, hostelworld: 100 }, { hostelworld: { commission: 0.1 } })).toBeCloseTo(0.1375, 9);
  });

  it("falls back to the 15% default with no revenue or no OTAs", () => {
    expect(blendedCommission({}, {})).toBe(0.15);
    expect(blendedCommission({ booking_com: 0 }, {})).toBe(0.15);
  });

  it("direct payment fee defaults to 3%", () => {
    expect(DEFAULT_DIRECT_FEE).toBe(0.03);
  });
});
