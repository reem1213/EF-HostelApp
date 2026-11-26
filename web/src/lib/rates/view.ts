import { resolveOta, type OtaSettings } from "../domain/ota";
import { buildRateTable, competitorMedian, netAfterCommission, rateFlags, type Competitor, type RateColumn, type RateFlag, type RateSnapshot, type RateSource } from "../domain/rates";

const DAY = 86_400_000;

export type RateCellView = {
  listCents: number;
  /** Member price (for example Genius), or null. */
  memberCents: number | null;
  memberLabel: string | null;
  /** What the hostel keeps after member discount and commission. Null for competitors, whose costs are not ours. */
  keepCents: number | null;
  source: RateSource;
};

export type RateRowView = { night: Date; cells: Record<string, RateCellView | null>; flags: RateFlag[] };

export type RateView = {
  columns: RateColumn[];
  rows: RateRowView[];
  /** Direct price per night in row order, for the Night Strip. */
  directPrices: (number | null)[];
  hasRates: boolean;
  /** True while any shown rate is simulated. The page must say so. */
  hasSimulated: boolean;
};

/** Everything the rate table page shows, worked out in one place so it can be tested. */
export function buildRateView(a: {
  snaps: RateSnapshot[];
  today: Date;
  nightsCount: number;
  otas: string[];
  otaSettings: OtaSettings;
  competitors: Competitor[];
  floorCents: number;
}): RateView {
  const columns: RateColumn[] = [
    { key: "direct", label: "Direct", kind: "direct" },
    ...a.otas.map((id) => ({ key: id, label: resolveOta(id, a.otaSettings).name, kind: "ota" as const })),
    ...a.competitors.map((c) => ({ key: `comp:${c.id}`, label: c.name, kind: "competitor" as const })),
  ];
  const nights = Array.from({ length: a.nightsCount }, (_, i) => new Date(a.today.getTime() + i * DAY));
  const table = buildRateTable(a.snaps, nights, columns);

  let hasRates = false;
  let hasSimulated = false;
  const rows: RateRowView[] = table.map((row) => {
    const cells: Record<string, RateCellView | null> = {};
    for (const col of columns) {
      const c = row.cells[col.key];
      if (!c) {
        cells[col.key] = null;
        continue;
      }
      hasRates = true;
      if (c.source === "simulated") hasSimulated = true;
      let keepCents: number | null = null;
      let memberCents: number | null = null;
      if (col.kind === "direct") keepCents = c.listCents;
      if (col.kind === "ota") {
        const commission = resolveOta(col.key, a.otaSettings).defaultCommission;
        // Use the member price actually quoted; derive the discount from it so the maths matches what is shown.
        const discountPct = c.discountedCents !== null && c.listCents > 0 ? 1 - c.discountedCents / c.listCents : null;
        const net = netAfterCommission({ priceCents: c.listCents, discountPct, commission });
        memberCents = c.discountedCents;
        keepCents = c.discountedCents !== null ? Math.max(0, Math.round(c.discountedCents * (1 - commission))) : net.keepCents;
      }
      cells[col.key] = { listCents: c.listCents, memberCents, memberLabel: c.discountLabel, keepCents, source: c.source };
    }
    return { night: row.night, cells, flags: rateFlags({ row, floorCents: a.floorCents, compMedianCents: competitorMedian(row) }) };
  });

  return { columns, rows, directPrices: rows.map((r) => r.cells.direct?.listCents ?? null), hasRates, hasSimulated };
}
