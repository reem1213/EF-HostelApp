import { describe, expect, it } from "vitest";

import { defaultGuardrails } from "../domain/guardrails";
import { checkRunParams } from "./price-guard";

const ctx = { floorCents: 765, guardrails: defaultGuardrails, today: new Date(Date.UTC(2026, 10, 25)) };
const good = { stayDate: "2026-11-28", channel: "direct", roomType: "Dorm bed", currentCents: 3000, priceCents: 3300 };

describe("checkRunParams", () => {
  it("passes a price change inside the limits", () => {
    expect(checkRunParams(good, ctx)).toEqual({ ok: true });
  });

  it("blocks a change below the cost-based floor with the reason", () => {
    expect(checkRunParams({ ...good, currentCents: 800, priceCents: 700 }, ctx)).toEqual({ ok: false, reasons: ["below_floor"] });
  });

  it("uses the saved ceiling and daily limit", () => {
    const strict = { ...ctx, guardrails: { minMarginPct: 0.2, ceilingCents: 3100, maxChangePctPerDay: 0.05 } };
    expect(checkRunParams(good, strict)).toEqual({ ok: false, reasons: ["above_ceiling", "change_too_large"] });
  });

  it("blocks a night that has passed", () => {
    expect(checkRunParams({ ...good, stayDate: "2026-11-24" }, ctx)).toEqual({ ok: false, reasons: ["night_passed"] });
  });

  it("treats missing or malformed parameters as an invalid price, never throwing", () => {
    for (const bad of [{}, { ...good, priceCents: "3300" }, { ...good, stayDate: "someday" }, { ...good, currentCents: undefined }, { ...good, roomType: 5 }]) {
      expect(checkRunParams(bad as Record<string, unknown>, ctx), JSON.stringify(bad)).toEqual({ ok: false, reasons: ["invalid_price"] });
    }
  });
});
