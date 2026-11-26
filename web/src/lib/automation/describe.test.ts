import { describe, expect, it } from "vitest";

import { describeRun } from "./describe";
import type { ActionRun } from "./types";

const run = (over: Partial<ActionRun>): ActionRun => ({
  id: "r", propertyId: "p", kind: "price_update", title: "t", params: {}, before: null, after: null, status: "proposed",
  reversible: false, simulated: true, createdBy: "u", approvedBy: null, createdAt: new Date(), appliedAt: null, error: null, ...over,
});
const params = { stayDate: "2026-11-28", channel: "direct", roomType: "Dorm bed", currentCents: 3000, priceCents: 3300 };

describe("describeRun", () => {
  it("describes a proposed price change from its parameters", () => {
    expect(describeRun(run({ params }))).toEqual(["Sat, Nov 28 · Direct · Dorm bed", "$30.00 → $33.00"]);
  });

  it("uses what actually happened once applied", () => {
    expect(describeRun(run({ params, status: "applied", before: 3100, after: 3300 }))).toEqual(["Sat, Nov 28 · Direct · Dorm bed", "$31.00 → $33.00"]);
  });

  it("shows a new price with no previous one", () => {
    expect(describeRun(run({ params: { ...params, currentCents: undefined }, status: "applied", before: null, after: 3300 }))[1]).toBe("New price $33.00");
  });

  it("names the OTA channel nicely and survives malformed parameters", () => {
    expect(describeRun(run({ params: { ...params, channel: "booking_com" } }))[0]).toContain("Booking.com");
    expect(describeRun(run({ params: {} }))).toEqual([]);
  });

  it("describes other kinds by their summary line, or nothing", () => {
    expect(describeRun(run({ kind: "content_draft", params: { summary: "New page title and description" } }))).toEqual(["New page title and description"]);
    expect(describeRun(run({ kind: "ticket_draft", params: {} }))).toEqual([]);
  });
});
