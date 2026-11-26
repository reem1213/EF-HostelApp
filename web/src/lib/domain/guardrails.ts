/**
 * Limits on automatic price changes. Money decisions are approval-first AND bounded: a change
 * outside these limits is blocked with the reason, whoever asks for it.
 */

export type Guardrails = {
  /** The floor is cost per bed times (1 + this). */
  minMarginPct: number;
  /** Highest allowed rate in cents. null means twice the current price. */
  ceilingCents: number | null;
  /** Largest allowed change to one night's price, as a share of its current price. */
  maxChangePctPerDay: number;
};

export const defaultGuardrails: Guardrails = { minMarginPct: 0.2, ceilingCents: null, maxChangePctPerDay: 0.15 };

/** Rows with this room type are bed prices; the cost-based floor applies to them only. */
export const DORM_BED = "Dorm bed";

/** Lowest price that still earns the minimum margin over cost per bed (rounded up to a cent). */
export const priceFloorCents = (costPerBedCents: number, minMarginPct: number): number =>
  Math.max(0, Math.ceil(costPerBedCents * (1 + minMarginPct) - 1e-9));

export type GuardrailReason = "below_floor" | "above_ceiling" | "change_too_large" | "night_passed" | "invalid_price";

export type GuardrailResult = { ok: true } | { ok: false; reasons: GuardrailReason[] };

const EPS = 1e-9;

export function checkPriceChange(a: {
  currentCents: number;
  proposedCents: number;
  floorCents: number;
  ceilingCents: number | null;
  maxChangePct: number;
  stayDate: Date;
  today: Date;
  roomType: string;
}): GuardrailResult {
  if (!Number.isFinite(a.proposedCents) || !Number.isInteger(a.proposedCents) || a.proposedCents <= 0) {
    return { ok: false, reasons: ["invalid_price"] };
  }
  const reasons: GuardrailReason[] = [];
  if (a.stayDate.getTime() < a.today.getTime()) reasons.push("night_passed");
  if (a.roomType === DORM_BED && a.proposedCents < a.floorCents) reasons.push("below_floor");

  const ceiling = a.ceilingCents ?? (a.currentCents > 0 ? a.currentCents * 2 : Number.POSITIVE_INFINITY);
  if (a.proposedCents > ceiling) reasons.push("above_ceiling");

  if (a.currentCents > 0 && Math.abs(a.proposedCents - a.currentCents) / a.currentCents > a.maxChangePct + EPS) {
    reasons.push("change_too_large");
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export const REASON_COPY: Record<GuardrailReason, string> = {
  below_floor: "That is below your price floor (cost per bed plus your minimum margin).",
  above_ceiling: "That is above your price ceiling.",
  change_too_large: "That changes the price by more than your daily limit.",
  night_passed: "That night has already passed.",
  invalid_price: "Enter a price in whole cents above zero.",
};
