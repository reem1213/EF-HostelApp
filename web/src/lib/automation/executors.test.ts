import { describe, expect, it } from "vitest";

import { localRateExecutor, recordOnlyExecutor, type RateWriter } from "./executors";
import type { ActionRun } from "./types";

const key = (a: { propertyId: string; stayDate: Date; channel: string; roomType: string }) => `${a.propertyId}|${a.stayDate.toISOString().slice(0, 10)}|${a.channel}|${a.roomType}`;

function fakeWriter(initial: Record<string, number> = {}) {
  const rates = new Map(Object.entries(initial));
  const calls: string[] = [];
  const writer: RateWriter = {
    async getRate(a) { return rates.get(key(a)) ?? null; },
    async setRate(a) { calls.push("set"); rates.set(key(a), a.priceCents); },
    async clearRate(a) { calls.push("clear"); rates.delete(key(a)); },
  };
  return { writer, rates, calls };
}

const run = (params: Record<string, unknown>, extra: Partial<ActionRun> = {}): ActionRun => ({
  id: "r1", propertyId: "p1", kind: "price_update", title: "t", params, before: null, after: null, status: "approved",
  reversible: false, simulated: true, createdBy: "u", approvedBy: "u", createdAt: new Date(), appliedAt: null, error: null, ...extra,
});
const params = { stayDate: "2026-11-28", channel: "direct", roomType: "Dorm bed", priceCents: 3400 };
const ctx = (iso: string) => ({ propertyId: "p1", now: new Date(iso) });
const K = "p1|2026-11-28|direct|Dorm bed";

describe("localRateExecutor", () => {
  it("writes the new price and reports the old one, marked simulated and reversible", async () => {
    const { writer, rates } = fakeWriter({ [K]: 3000 });
    const out = await localRateExecutor(writer).apply(run(params), ctx("2026-11-25T10:00:00Z"));
    expect(out).toEqual({ before: 3000, after: 3400, simulated: true, reversible: true });
    expect(rates.get(K)).toBe(3400);
  });

  it("records null as the old price when there was none", async () => {
    const { writer } = fakeWriter();
    expect((await localRateExecutor(writer).apply(run(params), ctx("2026-11-25T10:00:00Z"))).before).toBeNull();
  });

  it("undo puts the old price back, or removes the rate if there was none", async () => {
    const a = fakeWriter({ [K]: 3400 });
    await localRateExecutor(a.writer).undo!(run(params, { before: 3000, after: 3400, status: "applied" }), ctx("2026-11-25T10:00:00Z"));
    expect(a.rates.get(K)).toBe(3000);
    const b = fakeWriter({ [K]: 3400 });
    await localRateExecutor(b.writer).undo!(run(params, { before: null, after: 3400, status: "applied" }), ctx("2026-11-25T10:00:00Z"));
    expect(b.calls).toEqual(["clear"]);
    expect(b.rates.has(K)).toBe(false);
  });

  it("can be undone up to and including the night itself, never after it", async () => {
    const ex = localRateExecutor(fakeWriter().writer);
    expect(ex.canUndo!(run(params), ctx("2026-11-27T23:59:00Z"))).toBe(true);
    expect(ex.canUndo!(run(params), ctx("2026-11-28T08:00:00Z"))).toBe(true);
    expect(ex.canUndo!(run(params), ctx("2026-11-29T00:00:00Z"))).toBe(false);
  });

  it("refuses to run with missing or malformed parameters, writing nothing", async () => {
    const { writer, calls } = fakeWriter();
    const ex = localRateExecutor(writer);
    for (const bad of [{}, { ...params, priceCents: -1 }, { ...params, priceCents: 12.5 }, { ...params, stayDate: "soon" }, { ...params, channel: "" }]) {
      await expect(ex.apply(run(bad), ctx("2026-11-25T10:00:00Z"))).rejects.toThrow(/invalid price change/i);
    }
    expect(calls).toEqual([]);
  });
});

describe("recordOnlyExecutor", () => {
  it("keeps a record of a draft, with no side effect and nothing to undo", async () => {
    const out = await recordOnlyExecutor("ticket_draft").apply(run({ ota: "booking_com" }, { kind: "ticket_draft" }), ctx("2026-11-25T10:00:00Z"));
    expect(out).toEqual({ before: null, after: { ota: "booking_com" }, simulated: false, reversible: false });
    expect(recordOnlyExecutor("ticket_draft").kind).toBe("ticket_draft");
  });
});
