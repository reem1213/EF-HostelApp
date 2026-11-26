import { checkRunParams } from "../automation/price-guard";
import { proposeRun, type RunnerDeps } from "../automation/runner";
import type { Property, Store } from "../data/store";
import { dollarsExact } from "../domain/money";
import { REASON_COPY, DORM_BED, type Guardrails } from "../domain/guardrails";
import { parseRatesCsv } from "../domain/import/rates-csv";
import { dateOrderFor } from "../import-service";
import { resolveOta } from "../domain/ota";
import { currentSnapshot, type RateSnapshot } from "../domain/rates";
import { refreshRates } from "./refresh";
import { SimulatedRates } from "./sources";

const DAY = 86_400_000;

/** The demo comp set for the HI Chicago example. Always labelled, so nobody mistakes it for a real market scan. */
export const DEMO_COMPETITORS = ["Wrigley Hostel (example)", "Freehand Chicago (example)", "Grand House 424 (example)"];

type ProposeCtx = {
  store: Pick<Store, "listRates" | "createRun">;
  deps: RunnerDeps;
  property: Pick<Property, "id" | "otas" | "otaSettings">;
  userId: string;
  floorCents: number;
  guardrails: Guardrails;
  today: Date;
};

export type ProposeResult = { ok: true; runId: string } | { ok: false; error: string };

/**
 * Turns "set this night's price to X" into a proposed action. The current price and the floor come from
 * the server, never from the browser, so a tampered form cannot dodge the limits.
 */
export async function proposeRateChange(ctx: ProposeCtx, input: { stayDate: string; channel: string; priceCents: number }): Promise<ProposeResult> {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(input.stayDate) ? new Date(`${input.stayDate}T00:00:00Z`) : null;
  if (!day || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== input.stayDate) return { ok: false, error: "That date is not valid." };
  if (input.channel !== "direct" && !ctx.property.otas.includes(input.channel)) return { ok: false, error: "That booking site is not one of yours." };
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) return { ok: false, error: REASON_COPY.invalid_price };

  const rows = (await ctx.store.listRates(ctx.property.id, { start: day, end: new Date(day.getTime() + DAY) })).filter(
    (r) => r.channel === input.channel && r.roomType === DORM_BED && r.competitorId === null,
  );
  const current = currentSnapshot(rows);
  if (!current) return { ok: false, error: "There is no rate for that night yet. Load rates first." };
  if (current.priceCents === input.priceCents) return { ok: false, error: "That is already the price." };

  const params = { stayDate: input.stayDate, channel: input.channel, roomType: DORM_BED, currentCents: current.priceCents, priceCents: input.priceCents };
  const check = checkRunParams(params, { floorCents: ctx.floorCents, guardrails: ctx.guardrails, today: ctx.today });
  if (!check.ok) return { ok: false, error: check.reasons.map((r) => REASON_COPY[r]).join(" ") };

  // On a booking site the floor is about what the hostel keeps, not the list price: member discount and commission come off first.
  if (input.channel !== "direct") {
    const ota = resolveOta(input.channel, ctx.property.otaSettings);
    const keep = input.priceCents * (1 - (ota.memberDiscount ?? 0)) * (1 - ota.defaultCommission);
    if (keep < ctx.floorCents - 1e-9) return { ok: false, error: `After the member discount and commission you would keep ${dollarsExact(Math.round(keep))}, which is below your price floor.` };
  }

  const label = input.channel === "direct" ? "Direct" : resolveOta(input.channel).name;
  const date = day.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const run = await proposeRun(ctx.deps, ctx.property.id, {
    kind: "price_update",
    title: `Change ${label} price for ${date} to ${dollarsExact(input.priceCents)}`,
    params,
    createdBy: ctx.userId,
  });
  return { ok: true, runId: run.id };
}

/** The price a night has right now, read from the store (never from a run's own parameters). */
export async function currentPriceFor(store: Pick<Store, "listRates">, propertyId: string, p: { stayDate: string; channel: string; roomType: string }): Promise<number | null> {
  const day = new Date(`${p.stayDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return null;
  const rows = (await store.listRates(propertyId, { start: day, end: new Date(day.getTime() + DAY) })).filter((r) => r.channel === p.channel && r.roomType === p.roomType && r.competitorId === null);
  return currentSnapshot(rows)?.priceCents ?? null;
}

/** Adds the labelled example competitors (as many as fit) and fills 14 nights of simulated rates. Safe to repeat. */
export async function loadSimulatedExample(a: { store: Store; property: Property; today: Date }): Promise<number> {
  const existing = await a.store.listCompetitors(a.property.id);
  for (const name of DEMO_COMPETITORS) {
    if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase())) continue;
    try {
      await a.store.addCompetitor(a.property.id, name);
    } catch {
      break; // the comp set is full
    }
  }
  return refreshRates({ store: a.store, adapter: new SimulatedRates(a.property.id), property: a.property, now: () => a.today });
}

export type RatesImportOutcome = { ok: boolean; message: string; saved: number; details: string[] };

/** Saves a rates CSV as hand-entered rates. Competitors named in the file join the comp set (up to 8). */
export async function importRatesText(a: { store: Store; property: Property; text: string; now?: () => Date }): Promise<RatesImportOutcome> {
  const parsed = parseRatesCsv(a.text, dateOrderFor(a.property.country));
  const details = parsed.errors.slice(0, 8).map((e) => (e.line > 0 ? `Line ${e.line}: ${e.message}` : e.message));
  if (parsed.rows.length === 0) return { ok: false, message: `Nothing was imported. ${parsed.errors[0]?.message ?? "No usable rows were found."}`, saved: 0, details };

  const known = new Map((await a.store.listCompetitors(a.property.id)).map((c) => [c.name.toLowerCase(), c]));
  const notes = new Set<string>();
  const capturedAt = (a.now ?? (() => new Date()))();
  const snaps: RateSnapshot[] = [];

  for (const r of parsed.rows) {
    let channel = r.channel ?? "market";
    let competitorId: string | null = null;
    if (r.kind === "own") {
      if (channel !== "direct" && !a.property.otas.includes(channel)) {
        notes.add(`${resolveOta(channel).name} is not one of your booking sites, so its rows were skipped. Add it in More > Property.`);
        continue;
      }
    } else {
      const key = r.competitorName!.trim().toLowerCase();
      let comp = known.get(key);
      if (!comp) {
        try {
          comp = await a.store.addCompetitor(a.property.id, r.competitorName!.trim());
          known.set(key, comp);
        } catch {
          notes.add(`You can compare against up to 8 competitors, so rows for ${r.competitorName} were skipped.`);
          continue;
        }
      }
      competitorId = comp.id;
      channel = "market";
    }
    const member = r.discountedPriceCents;
    const ota = r.kind === "own" && channel !== "direct" ? resolveOta(channel) : null;
    snaps.push({
      stayDate: r.stayDate, channel, competitorId, roomType: r.roomType, priceCents: r.priceCents,
      discountedPriceCents: member, discountLabel: member === null ? null : (ota?.memberLabel ?? "Member price"),
      source: "manual", capturedAt,
    });
  }

  if (snaps.length === 0) return { ok: false, message: "Nothing was imported. No rows matched your booking sites or competitors.", saved: 0, details: [...details, ...notes] };
  await a.store.saveRates(a.property.id, snaps);
  const skipped = parsed.rows.length - snaps.length + parsed.errors.length;
  return { ok: true, message: `Saved ${snaps.length} rate${snaps.length === 1 ? "" : "s"}.${skipped > 0 ? ` ${skipped} row${skipped === 1 ? " was" : "s were"} skipped.` : ""}`, saved: snaps.length, details: [...details, ...notes] };
}
