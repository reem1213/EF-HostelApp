import { describe, expect, it } from "vitest";

import { localRateExecutor } from "../automation/executors";
import { approveRun, proposeRun, undoRun } from "../automation/runner";
import { MemoryStore } from "../data/memory-store";
import { DORM_BED } from "../domain/guardrails";
import type { RateSnapshot } from "../domain/rates";
import { storeRateWriter } from "./writer";

const DAY = 86_400_000;
const d = (day: number) => new Date(Date.UTC(2026, 10, day));
const snap = (over: Partial<RateSnapshot>): RateSnapshot => ({
  stayDate: d(28), channel: "direct", competitorId: null, roomType: DORM_BED, priceCents: 3000,
  discountedPriceCents: null, discountLabel: null, source: "simulated", capturedAt: d(25), ...over,
});

async function setup() {
  const store = new MemoryStore();
  const property = await store.createProperty("u1", { name: "H", beds: 10, currency: "USD", country: "US" });
  return { store, property };
}

describe("rates in the store", () => {
  it("lists rates for nights in [start, end) only", async () => {
    const { store, property } = await setup();
    await store.saveRates(property.id, [snap({ stayDate: d(27) }), snap({ stayDate: d(28) }), snap({ stayDate: d(29) })]);
    const r = await store.listRates(property.id, { start: d(28), end: d(29) });
    expect(r.map((x) => x.stayDate.getTime())).toEqual([d(28).getTime()]);
  });

  it("keeps rates per property", async () => {
    const { store, property } = await setup();
    const other = await store.createProperty("u2", { name: "O", beds: 4, currency: "USD", country: "US" });
    await store.saveRates(property.id, [snap({})]);
    expect(await store.listRates(other.id, { start: d(1), end: d(30) })).toEqual([]);
  });

  it("deleting a manual rate leaves the underlying simulated one", async () => {
    const { store, property } = await setup();
    await store.saveRates(property.id, [snap({ priceCents: 3000 }), snap({ priceCents: 3400, source: "manual", capturedAt: d(26) })]);
    await store.deleteManualRate(property.id, { stayDate: d(28), channel: "direct", roomType: DORM_BED });
    const left = await store.listRates(property.id, { start: d(28), end: d(29) });
    expect(left.map((x) => [x.source, x.priceCents])).toEqual([["simulated", 3000]]);
  });
});

describe("competitors", () => {
  it("adds, lists and removes, rejecting duplicates regardless of case", async () => {
    const { store, property } = await setup();
    const a = await store.addCompetitor(property.id, "Wrigley Hostel");
    await expect(store.addCompetitor(property.id, "  wrigley hostel ")).rejects.toThrow(/already/i);
    expect((await store.listCompetitors(property.id)).map((c) => c.name)).toEqual(["Wrigley Hostel"]);
    await store.removeCompetitor(property.id, a.id);
    expect(await store.listCompetitors(property.id)).toEqual([]);
  });

  it("allows at most 8 and removing one also removes its rates", async () => {
    const { store, property } = await setup();
    const made = [];
    for (let i = 0; i < 8; i++) made.push(await store.addCompetitor(property.id, `Hostel ${i}`));
    await expect(store.addCompetitor(property.id, "Hostel 9")).rejects.toThrow(/8/);
    await store.saveRates(property.id, [snap({ channel: "market", competitorId: made[0].id })]);
    await store.removeCompetitor(property.id, made[0].id);
    expect(await store.listRates(property.id, { start: d(1), end: d(30) })).toEqual([]);
  });
});

describe("the rate writer and the approval runner together", () => {
  const params = { stayDate: "2026-11-28", channel: "direct", roomType: DORM_BED, currentCents: 3000, priceCents: 3300 };

  it("an approved price change updates the current rate, and undo puts the old one back", async () => {
    const { store, property } = await setup();
    await store.saveRates(property.id, [snap({ priceCents: 3000 })]);
    let t = d(26).getTime();
    const writer = storeRateWriter(store, () => new Date((t += 1000))); // an advancing fake clock
    const deps = { store, executors: { price_update: localRateExecutor(writer) }, now: () => new Date(d(26).getTime() + DAY / 2) };

    const run = await proposeRun(deps, property.id, { kind: "price_update", title: "Set Sat to $33", params, createdBy: "u1" });
    const done = await approveRun(deps, property.id, run.id, "u1");
    expect(done).toMatchObject({ status: "applied", before: 3000, after: 3300, simulated: true });
    expect(await writer.getRate({ propertyId: property.id, stayDate: d(28), channel: "direct", roomType: DORM_BED })).toBe(3300);

    await undoRun(deps, property.id, run.id, "u1");
    expect(await writer.getRate({ propertyId: property.id, stayDate: d(28), channel: "direct", roomType: DORM_BED })).toBe(3000);
  });

  it("getRate keeps returning a hand-set price after a newer simulated refresh", async () => {
    const { store, property } = await setup();
    const writer = storeRateWriter(store, () => d(26));
    await writer.setRate({ propertyId: property.id, stayDate: d(28), channel: "direct", roomType: DORM_BED, priceCents: 3500 });
    await store.saveRates(property.id, [snap({ priceCents: 3000, capturedAt: d(27) })]); // tomorrow's nightly refresh
    expect(await writer.getRate({ propertyId: property.id, stayDate: d(28), channel: "direct", roomType: DORM_BED })).toBe(3500);
  });

  it("getRate is null when nothing has a price for that night", async () => {
    const { store, property } = await setup();
    expect(await storeRateWriter(store).getRate({ propertyId: property.id, stayDate: d(28), channel: "direct", roomType: DORM_BED })).toBeNull();
  });
});
