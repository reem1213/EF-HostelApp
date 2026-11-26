import { describe, expect, it } from "vitest";

import { buildRunnerDeps } from "../automation/registry";
import { approveRun } from "../automation/runner";
import { MemoryStore } from "../data/memory-store";
import { defaultGuardrails, DORM_BED } from "../domain/guardrails";
import type { RateSnapshot } from "../domain/rates";
import { storeRateWriter } from "./writer";
import { DEMO_COMPETITORS, importRatesText, loadSimulatedExample, proposeRateChange } from "./service";

const TODAY = new Date(Date.UTC(2026, 10, 27));
const d = (day: number) => new Date(Date.UTC(2026, 10, day));
const snap = (over: Partial<RateSnapshot>): RateSnapshot => ({
  stayDate: d(28), channel: "direct", competitorId: null, roomType: DORM_BED, priceCents: 3000,
  discountedPriceCents: null, discountLabel: null, source: "simulated", capturedAt: d(26), ...over,
});

async function setup() {
  const store = new MemoryStore();
  const property = await store.createProperty("u1", { name: "H", beds: 10, currency: "USD", country: "US", otas: ["booking_com", "hostelworld"] });
  const deps = buildRunnerDeps(store, { now: () => TODAY });
  return { store, property, deps };
}
const ctx = (s: Awaited<ReturnType<typeof setup>>) => ({ store: s.store, deps: s.deps, property: s.property, userId: "u1", floorCents: 2400, guardrails: defaultGuardrails, today: TODAY });

describe("proposeRateChange", () => {
  it("proposes a price change inside the limits, with the current price read from the store (not the browser)", async () => {
    const s = await setup();
    await s.store.saveRates(s.property.id, [snap({ priceCents: 3000 })]);
    const r = await proposeRateChange(ctx(s), { stayDate: "2026-11-28", channel: "direct", priceCents: 3300 });
    expect(r).toMatchObject({ ok: true });
    const run = (await s.store.listRuns(s.property.id, 5))[0];
    expect(run.status).toBe("proposed");
    expect(run.params).toMatchObject({ stayDate: "2026-11-28", channel: "direct", roomType: DORM_BED, currentCents: 3000, priceCents: 3300 });
  });

  it("blocks a price below the floor and says why, creating no run", async () => {
    const s = await setup();
    await s.store.saveRates(s.property.id, [snap({ priceCents: 2500 })]);
    const r = await proposeRateChange(ctx(s), { stayDate: "2026-11-28", channel: "direct", priceCents: 2300 });
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toMatch(/floor/);
    expect(await s.store.listRuns(s.property.id, 5)).toHaveLength(0);
  });

  it("blocks a jump bigger than the daily limit", async () => {
    const s = await setup();
    await s.store.saveRates(s.property.id, [snap({ priceCents: 3000 })]);
    const r = await proposeRateChange(ctx(s), { stayDate: "2026-11-28", channel: "direct", priceCents: 4000 });
    expect((r as { error: string }).error).toMatch(/daily limit/);
  });

  it("refuses a channel the hostel does not sell on, and a night with no rate", async () => {
    const s = await setup();
    await s.store.saveRates(s.property.id, [snap({})]);
    expect(await proposeRateChange(ctx(s), { stayDate: "2026-11-28", channel: "agoda", priceCents: 3100 })).toMatchObject({ ok: false });
    expect(await proposeRateChange(ctx(s), { stayDate: "2026-11-29", channel: "direct", priceCents: 3100 })).toMatchObject({ ok: false });
  });

  it("refuses a malformed date or a price that is not whole cents", async () => {
    const s = await setup();
    await s.store.saveRates(s.property.id, [snap({})]);
    expect(await proposeRateChange(ctx(s), { stayDate: "nope", channel: "direct", priceCents: 3100 })).toMatchObject({ ok: false });
    expect(await proposeRateChange(ctx(s), { stayDate: "2026-11-28", channel: "direct", priceCents: 31.5 })).toMatchObject({ ok: false });
  });

  it("says so when the price is already that", async () => {
    const s = await setup();
    await s.store.saveRates(s.property.id, [snap({ priceCents: 3000 })]);
    const r = await proposeRateChange(ctx(s), { stayDate: "2026-11-28", channel: "direct", priceCents: 3000 });
    expect(r).toMatchObject({ ok: false });
  });

  it("applies once approved, using the store writer, and the new price wins over the simulated one", async () => {
    const s = await setup();
    await s.store.saveRates(s.property.id, [snap({ priceCents: 3000 })]);
    const deps = buildRunnerDeps(s.store, { rateWriter: storeRateWriter(s.store, () => TODAY), now: () => TODAY });
    const r = await proposeRateChange({ ...ctx(s), deps }, { stayDate: "2026-11-28", channel: "direct", priceCents: 3300 });
    const run = await approveRun(deps, s.property.id, (r as { runId: string }).runId, "u1");
    expect(run.status).toBe("applied");
    expect(run.simulated).toBe(true);
    expect(await storeRateWriter(s.store).getRate({ propertyId: s.property.id, stayDate: d(28), channel: "direct", roomType: DORM_BED })).toBe(3300);
  });
});

describe("loadSimulatedExample", () => {
  it("adds the labelled example competitors and 14 nights of simulated rates", async () => {
    const s = await setup();
    const n = await loadSimulatedExample({ store: s.store, property: s.property, today: TODAY });
    const comps = await s.store.listCompetitors(s.property.id);
    expect(comps.map((c) => c.name)).toEqual(DEMO_COMPETITORS);
    expect(DEMO_COMPETITORS.every((n) => /example/i.test(n))).toBe(true);
    // 14 nights x (direct + 2 OTAs + 3 competitors)
    expect(n).toBe(14 * 6);
    const rates = await s.store.listRates(s.property.id, { start: TODAY, end: d(41) });
    expect(rates.every((r) => r.source === "simulated")).toBe(true);
  });

  it("can be run twice without duplicating competitors or breaking on the limit", async () => {
    const s = await setup();
    await loadSimulatedExample({ store: s.store, property: s.property, today: TODAY });
    await loadSimulatedExample({ store: s.store, property: s.property, today: TODAY });
    expect(await s.store.listCompetitors(s.property.id)).toHaveLength(3);
  });

  it("does not overwrite a price the owner set by hand", async () => {
    const s = await setup();
    await s.store.saveRates(s.property.id, [snap({ stayDate: TODAY, priceCents: 9900, source: "manual", capturedAt: d(20) })]);
    await loadSimulatedExample({ store: s.store, property: s.property, today: TODAY });
    const w = storeRateWriter(s.store);
    expect(await w.getRate({ propertyId: s.property.id, stayDate: TODAY, channel: "direct", roomType: DORM_BED })).toBe(9900);
  });
});

describe("importRatesText", () => {
  it("saves own-channel and competitor rows as manual rates and adds new competitors by name", async () => {
    const s = await setup();
    const csv = "Date,Channel,Price,Member price\n2026-11-28,Direct,30,\n2026-11-28,Booking.com,40,36\n2026-11-28,Freehand Chicago,35,\n";
    const out = await importRatesText({ store: s.store, property: s.property, text: csv });
    expect(out).toMatchObject({ ok: true, saved: 3 });
    const comps = await s.store.listCompetitors(s.property.id);
    expect(comps.map((c) => c.name)).toEqual(["Freehand Chicago"]);
    const rows = await s.store.listRates(s.property.id, { start: d(28), end: d(29) });
    expect(rows.every((r) => r.source === "manual")).toBe(true);
    expect(rows.find((r) => r.channel === "booking_com")).toMatchObject({ priceCents: 4000, discountedPriceCents: 3600 });
  });

  it("skips an own-channel row for an OTA the hostel does not use, and tells the user", async () => {
    const s = await setup();
    const out = await importRatesText({ store: s.store, property: s.property, text: "Date,Channel,Price\n2026-11-28,Agoda,40\n2026-11-28,Direct,30\n" });
    expect(out).toMatchObject({ ok: true, saved: 1 });
    expect(out.details.join(" ")).toMatch(/Agoda/);
  });

  it("reports an unreadable file without saving anything", async () => {
    const s = await setup();
    const out = await importRatesText({ store: s.store, property: s.property, text: "hello" });
    expect(out.ok).toBe(false);
    expect(await s.store.listRates(s.property.id, { start: d(1), end: d(40) })).toHaveLength(0);
  });

  it("stops adding competitors at the limit of 8 and reports the rest", async () => {
    const s = await setup();
    const lines = Array.from({ length: 10 }, (_, i) => `2026-11-28,Rival ${i},3${i}`).join("\n");
    const out = await importRatesText({ store: s.store, property: s.property, text: `Date,Channel,Price\n${lines}\n` });
    expect(await s.store.listCompetitors(s.property.id)).toHaveLength(8);
    expect(out.saved).toBe(8);
    expect(out.details.join(" ")).toMatch(/up to 8/);
  });
});
