import { checkPriceChange, type GuardrailResult, type Guardrails } from "../domain/guardrails";

/**
 * Checks a price_update run's parameters against the current limits. Used when an action is
 * proposed and again when it is approved, because the limits (or the cost floor) may have changed.
 * Malformed parameters are an invalid price, never an exception.
 */
export function checkRunParams(params: Record<string, unknown>, ctx: { floorCents: number; guardrails: Guardrails; today: Date }): GuardrailResult {
  const { stayDate, channel, roomType, currentCents, priceCents } = params;
  const date = typeof stayDate === "string" ? new Date(`${stayDate.slice(0, 10)}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || typeof channel !== "string" || typeof roomType !== "string" || typeof currentCents !== "number" || typeof priceCents !== "number") {
    return { ok: false, reasons: ["invalid_price"] };
  }
  return checkPriceChange({
    currentCents,
    proposedCents: priceCents,
    floorCents: ctx.floorCents,
    ceilingCents: ctx.guardrails.ceilingCents,
    maxChangePct: ctx.guardrails.maxChangePctPerDay,
    stayDate: date,
    today: ctx.today,
    roomType,
  });
}
