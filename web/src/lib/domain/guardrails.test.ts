import { describe, expect, it } from "vitest";

import { checkPriceChange, defaultGuardrails, DORM_BED, priceFloorCents } from "./guardrails";

const d = (day: number) => new Date(Date.UTC(2026, 10, day));
const ok = { currentCents: 1000, proposedCents: 1100, floorCents: 600, ceilingCents: 2000 as number | null, maxChangePct: 0.15, stayDate: d(30), today: d(25), roomType: DORM_BED };

describe("priceFloorCents", () => {
  it("is cost per bed plus the minimum margin, rounded up", () => {
    expect(priceFloorCents(500, 0.2)).toBe(600);
    expect(priceFloorCents(637, 0.2)).toBe(765); // 764.4 rounds up
    expect(priceFloorCents(0, 0.2)).toBe(0);
  });

  it("defaults: 20% margin, no fixed ceiling, 15% max change a day", () => {
    expect(defaultGuardrails).toEqual({ minMarginPct: 0.2, ceilingCents: null, maxChangePctPerDay: 0.15 });
  });
});

describe("checkPriceChange", () => {
  it("allows a change inside every limit", () => {
    expect(checkPriceChange(ok)).toEqual({ ok: true });
  });

  it("allows exactly the floor and exactly the ceiling, blocks one cent beyond", () => {
    expect(checkPriceChange({ ...ok, proposedCents: 600, maxChangePct: 1 })).toEqual({ ok: true });
    expect(checkPriceChange({ ...ok, proposedCents: 599, maxChangePct: 1 })).toEqual({ ok: false, reasons: ["below_floor"] });
    expect(checkPriceChange({ ...ok, currentCents: 1900, proposedCents: 2000 })).toEqual({ ok: true });
    expect(checkPriceChange({ ...ok, currentCents: 1900, proposedCents: 2001, maxChangePct: 1 })).toEqual({ ok: false, reasons: ["above_ceiling"] });
  });

  it("with no ceiling set, the ceiling is twice the current price", () => {
    expect(checkPriceChange({ ...ok, ceilingCents: null, currentCents: 800, proposedCents: 1600, maxChangePct: 2 })).toEqual({ ok: true });
    expect(checkPriceChange({ ...ok, ceilingCents: null, currentCents: 800, proposedCents: 1601, maxChangePct: 2 })).toEqual({ ok: false, reasons: ["above_ceiling"] });
  });

  it("blocks a move bigger than the daily limit, allowing exactly the limit", () => {
    expect(checkPriceChange({ ...ok, proposedCents: 1150 })).toEqual({ ok: true });
    expect(checkPriceChange({ ...ok, proposedCents: 1151 })).toEqual({ ok: false, reasons: ["change_too_large"] });
    expect(checkPriceChange({ ...ok, proposedCents: 850 })).toEqual({ ok: true });
    expect(checkPriceChange({ ...ok, proposedCents: 849 })).toEqual({ ok: false, reasons: ["change_too_large"] });
  });

  it("rejects prices that are not valid money", () => {
    for (const bad of [Number.NaN, -5, 0, Number.POSITIVE_INFINITY, 1000.5]) {
      expect(checkPriceChange({ ...ok, proposedCents: bad }), String(bad)).toEqual({ ok: false, reasons: ["invalid_price"] });
    }
  });

  it("will not change a night that has already passed, but allows tonight", () => {
    expect(checkPriceChange({ ...ok, stayDate: d(24) })).toEqual({ ok: false, reasons: ["night_passed"] });
    expect(checkPriceChange({ ...ok, stayDate: d(25) })).toEqual({ ok: true });
  });

  it("the floor only protects dorm beds; private rooms have no automatic floor", () => {
    expect(checkPriceChange({ ...ok, roomType: "Private room", proposedCents: 500, maxChangePct: 1 })).toEqual({ ok: true });
  });

  it("reports every reason that applies", () => {
    const r = checkPriceChange({ ...ok, proposedCents: 100, stayDate: d(1) });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reasons.sort()).toEqual(["below_floor", "change_too_large", "night_passed"]);
  });

  it("with no current price there is nothing to compare the size of the change against", () => {
    expect(checkPriceChange({ ...ok, currentCents: 0, proposedCents: 900, ceilingCents: 2000 })).toEqual({ ok: true });
  });
});
