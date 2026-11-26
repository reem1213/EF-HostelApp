import type { ActionRun, AutomationKind, ExecCtx, Executor } from "./types";

type RateKey = { propertyId: string; stayDate: Date; channel: string; roomType: string };

/** Where a rate lives. The Store implements this (Task 8); tests use a fake. A PMS writer would implement it too. */
export interface RateWriter {
  getRate(a: RateKey): Promise<number | null>;
  setRate(a: RateKey & { priceCents: number }): Promise<void>;
  clearRate(a: RateKey): Promise<void>;
}

type PriceParams = { stayDate: Date; channel: string; roomType: string; priceCents: number };

function readPriceParams(run: ActionRun): PriceParams {
  const p = run.params as Record<string, unknown>;
  const stayDate = typeof p.stayDate === "string" ? new Date(`${p.stayDate.slice(0, 10)}T00:00:00Z`) : null;
  const price = p.priceCents;
  if (!stayDate || Number.isNaN(stayDate.getTime()) || typeof p.channel !== "string" || !p.channel || typeof p.roomType !== "string" || !p.roomType || typeof price !== "number" || !Number.isInteger(price) || price <= 0) {
    throw new Error("Invalid price change.");
  }
  return { stayDate, channel: p.channel, roomType: p.roomType, priceCents: price };
}

const dayStart = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/**
 * Changes a night's price inside HostelPulse only. It is always reported as simulated: nothing is
 * pushed to a PMS or OTA until a live writer replaces `writer`.
 */
export function localRateExecutor(writer: RateWriter): Executor {
  return {
    kind: "price_update",
    async apply(run, ctx: ExecCtx) {
      const p = readPriceParams(run);
      const key = { propertyId: ctx.propertyId, stayDate: p.stayDate, channel: p.channel, roomType: p.roomType };
      const before = await writer.getRate(key);
      await writer.setRate({ ...key, priceCents: p.priceCents });
      return { before, after: p.priceCents, simulated: true, reversible: true };
    },
    async undo(run, ctx) {
      const p = readPriceParams(run);
      const key = { propertyId: ctx.propertyId, stayDate: p.stayDate, channel: p.channel, roomType: p.roomType };
      if (typeof run.before === "number") await writer.setRate({ ...key, priceCents: run.before });
      else await writer.clearRate(key);
    },
    canUndo(run, ctx) {
      return dayStart(readPriceParams(run).stayDate) >= dayStart(ctx.now);
    },
  };
}

/** For drafts (tickets, website copy): remember what was produced; there is no side effect to undo. */
export function recordOnlyExecutor(kind: AutomationKind): Executor {
  return {
    kind,
    async apply(run) {
      return { before: null, after: run.params, simulated: false, reversible: false };
    },
  };
}
