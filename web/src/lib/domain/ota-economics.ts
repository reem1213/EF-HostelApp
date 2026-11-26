import { resolveOta, type OtaSettings } from "./ota";

/** Share of a direct booking's price lost to payment processing. Editable later. */
export const DEFAULT_DIRECT_FEE = 0.03;
const DEFAULT_COMMISSION = 0.15;

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/** Money the hostel keeps from `revenueCents` when `directShare` of it comes direct. */
export function netForMix(a: { revenueCents: number; directShare: number; otaCommission: number; directFee: number }): number {
  const share = clamp01(a.directShare);
  return Math.round(a.revenueCents * share * (1 - a.directFee) + a.revenueCents * (1 - share) * (1 - a.otaCommission));
}

/** What changes if the direct share moves from `currentDirectShare` to `newDirectShare`. */
export function directWhatIf(a: {
  revenueCents: number;
  currentDirectShare: number;
  newDirectShare: number;
  otaCommission: number;
  directFee: number;
}): { currentNetCents: number; newNetCents: number; deltaCents: number } {
  const currentNetCents = netForMix({ ...a, directShare: a.currentDirectShare });
  const newNetCents = netForMix({ ...a, directShare: a.newDirectShare });
  return { currentNetCents, newNetCents, deltaCents: newNetCents - currentNetCents };
}

/** Average commission across OTAs, weighted by the revenue each brings. */
export function blendedCommission(revenueByOta: Record<string, number>, settings: OtaSettings): number {
  let total = 0;
  let weighted = 0;
  for (const [id, revenue] of Object.entries(revenueByOta)) {
    if (revenue <= 0) continue;
    total += revenue;
    weighted += revenue * resolveOta(id, settings).defaultCommission;
  }
  return total > 0 ? weighted / total : DEFAULT_COMMISSION;
}
