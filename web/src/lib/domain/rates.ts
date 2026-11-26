import { DORM_BED } from "./guardrails";

/**
 * Per-night rates across the hostel's own channels and its competitors. A rate has a source:
 * "simulated" until a real feed exists, "manual" when typed or uploaded, "pms"/"provider" for live data.
 */
export type RateSource = "pms" | "manual" | "provider" | "simulated";

export type Competitor = { id: string; name: string };

export type RateSnapshot = {
  stayDate: Date;
  /** "direct", an OTA id, or "market" for a competitor's published rate. */
  channel: string;
  competitorId: string | null;
  roomType: string;
  priceCents: number;
  /** Member price (for example Booking.com Genius), or null. */
  discountedPriceCents: number | null;
  discountLabel: string | null;
  source: RateSource;
  capturedAt: Date;
};

/** What the hostel keeps from one booking at `priceCents`, after a member discount it funds and the OTA's commission. */
export function netAfterCommission(a: { priceCents: number; discountPct: number | null; commission: number }): { listCents: number; discountedCents: number; keepCents: number } {
  const discountedCents = a.discountPct === null ? a.priceCents : Math.round(a.priceCents * (1 - a.discountPct));
  return { listCents: a.priceCents, discountedCents, keepCents: Math.max(0, Math.round(discountedCents * (1 - a.commission))) };
}

export type RateColumn = { key: string; label: string; kind: "direct" | "ota" | "competitor" };
export type RateCell = { listCents: number; discountedCents: number | null; discountLabel: string | null; source: RateSource };
export type RateTableRow = { night: Date; cells: Record<string, RateCell | null> };

export const columnKeyFor = (s: Pick<RateSnapshot, "channel" | "competitorId">): string => (s.competitorId ? `comp:${s.competitorId}` : s.channel);

/**
 * The rate that counts for one night/channel. Hand-set and live rates beat simulated ones even when the
 * simulated one is newer (a nightly refresh must never undo an owner's price). Among the rest the newest wins.
 */
export function currentSnapshot(rows: RateSnapshot[]): RateSnapshot | null {
  if (rows.length === 0) return null;
  const real = rows.filter((r) => r.source !== "simulated");
  const pool = real.length > 0 ? real : rows;
  return pool.reduce((best, r) => (r.capturedAt.getTime() >= best.capturedAt.getTime() ? r : best));
}

/** One row per night, one cell per column. The newest snapshot wins; a missing rate is null, never zero. */
export function buildRateTable(snaps: RateSnapshot[], nights: Date[], columns: RateColumn[], roomType: string = DORM_BED): RateTableRow[] {
  const byCell = new Map<string, RateSnapshot[]>();
  for (const s of snaps) {
    if (s.roomType !== roomType) continue;
    const k = `${s.stayDate.getTime()}|${columnKeyFor(s)}`;
    byCell.set(k, [...(byCell.get(k) ?? []), s]);
  }
  return nights.map((night) => ({
    night,
    cells: Object.fromEntries(
      columns.map((c) => {
        const s = currentSnapshot(byCell.get(`${night.getTime()}|${c.key}`) ?? []);
        const cell: RateCell | null = s ? { listCents: s.priceCents, discountedCents: s.discountedPriceCents, discountLabel: s.discountLabel, source: s.source } : null;
        return [c.key, cell];
      }),
    ),
  }));
}

export type RateFlag = "below_floor" | "direct_above_ota" | "above_comp" | "below_comp";

/** Things worth a look about a night's direct price. Competitor flags use a ±15% band around the median. */
export function rateFlags(a: { row: RateTableRow; floorCents: number; compMedianCents: number | null }): RateFlag[] {
  const direct = a.row.cells.direct;
  if (!direct) return [];
  const flags: RateFlag[] = [];
  if (direct.listCents < a.floorCents) flags.push("below_floor");

  const otaPrices = Object.entries(a.row.cells).filter(([k, v]) => k !== "direct" && !k.startsWith("comp:") && v).map(([, v]) => v!.listCents);
  if (otaPrices.length > 0 && direct.listCents > Math.min(...otaPrices)) flags.push("direct_above_ota");

  if (a.compMedianCents !== null && a.compMedianCents > 0) {
    // Integer maths: 3000 * 1.15 is 3449.9999999999995 in floating point, which would flag a price exactly 15% above.
    if (direct.listCents * 100 > a.compMedianCents * 115) flags.push("above_comp");
    if (direct.listCents * 100 < a.compMedianCents * 85) flags.push("below_comp");
  }
  return flags;
}

/** Median of the competitors' list prices for a night, or null with none. */
export function competitorMedian(row: RateTableRow): number | null {
  const prices = Object.entries(row.cells).filter(([k, v]) => k.startsWith("comp:") && v).map(([, v]) => v!.listCents).sort((x, y) => x - y);
  if (prices.length === 0) return null;
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
}
