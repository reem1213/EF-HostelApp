import { Suspense } from "react";
import { connection } from "next/server";

import { NightStrip, type StripCell } from "@/components/night-strip";
import { Notice, PageHeader, Section } from "@/components/page-kit";
import { CompSet } from "@/components/comp-set";
import { RateTable, type CellView, type ColumnView, type RowView } from "@/components/rate-table";
import { LoadExampleButton, OtaFeesForm, RatesUpload, type OtaFeeRow } from "@/components/rates-tools";
import { PageSkeleton } from "@/components/skeleton";
import { dollarsExact } from "@/lib/domain/money";
import { KNOWN_OTAS, resolveOta } from "@/lib/domain/ota";
import { loadDashboard } from "@/lib/dashboard";
import { utcDay } from "@/lib/period";
import { REFRESH_NIGHTS } from "@/lib/rates/refresh";
import { buildRateView } from "@/lib/rates/view";
import { requireProperty } from "@/lib/session";

export default function RatesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RatesView />
    </Suspense>
  );
}

const DAY = 86_400_000;
const dayLabel = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const pctText = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(Math.round(n * 1000) / 10));

async function RatesView() {
  await connection();
  const { store, property } = await requireProperty();
  const today = utcDay(new Date());
  const [d, snaps, competitors] = await Promise.all([
    loadDashboard(store, property),
    store.listRates(property.id, { start: today, end: new Date(today.getTime() + REFRESH_NIGHTS * DAY) }),
    store.listCompetitors(property.id),
  ]);
  const view = buildRateView({ snaps, today, nightsCount: REFRESH_NIGHTS, otas: property.otas, otaSettings: property.otaSettings, competitors, floorCents: d.floorCents });

  const columns: ColumnView[] = view.columns.map((c) => ({ key: c.key, label: c.label, kind: c.kind }));
  const rows: RowView[] = view.rows.map((r) => ({
    date: r.night.toISOString().slice(0, 10),
    label: dayLabel(r.night),
    flags: r.flags,
    cells: Object.fromEntries(
      view.columns.map((c) => {
        const x = r.cells[c.key];
        const cell: CellView = x
          ? {
              list: dollarsExact(x.listCents),
              member: x.memberCents === null ? null : dollarsExact(x.memberCents),
              memberLabel: x.memberLabel,
              keep: x.keepCents === null || c.kind === "direct" ? null : dollarsExact(x.keepCents),
              simulated: x.source === "simulated",
              editable: c.kind !== "competitor",
              rawDollars: (x.listCents / 100).toFixed(2),
            }
          : null;
        return [c.key, cell];
      }),
    ),
  }));

  const priced = view.directPrices.filter((p): p is number => p !== null);
  const lo = Math.min(...priced);
  const hi = Math.max(...priced);
  const strip: StripCell[] = view.rows.map((r, i) => {
    const p = view.directPrices[i];
    return {
      date: r.night.toISOString(),
      // Higher price = brighter window, scaled across the shown nights.
      occupancy: p === null ? 0 : hi === lo ? 0.5 : 0.1 + 0.9 * ((p - lo) / (hi - lo)),
      future: p === null,
      isToday: i === 0,
      note: p === null ? `${dayLabel(r.night)}: no direct rate` : `${dayLabel(r.night)}: ${dollarsExact(p)} direct`,
    };
  });

  const feeRows: OtaFeeRow[] = property.otas.map((id) => {
    const known = KNOWN_OTAS[id];
    const ov = property.otaSettings[id] ?? {};
    return {
      id,
      name: resolveOta(id, property.otaSettings).name,
      commissionPct: pctText(ov.commission),
      memberPct: pctText(ov.memberDiscount),
      defaultCommissionPct: pctText(known?.defaultCommission ?? 0.15),
      defaultMemberPct: pctText(known?.memberDiscount),
    };
  });

  const trail = [{ label: "Profit", href: "/profit" }, { label: "Direct bookings", href: "/profit/direct" }, { label: "Prices", href: "/profit/direct/rates" }];

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title="Nightly prices" trail={trail} subtitle={`Next ${REFRESH_NIGHTS} nights, per bed, compared like for like (dorm bed).`} />

      {view.hasSimulated && (
        <div role="note" className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-[13.5px]">
          <strong>Simulated data.</strong> These prices are examples, not live prices. Changes you approve are saved inside HostelPulse only; nothing is sent to your PMS or booking sites yet.
        </div>
      )}

      {!view.hasRates ? (
        <Section title="No prices yet">
          <Notice>
            Prices appear here once your PMS is connected, or after you upload them. To see how the table works, load an example. It is clearly labelled, and you can remove it any time.
          </Notice>
          <LoadExampleButton />
        </Section>
      ) : (
        <>
          <Section title="Your direct price">
            <div className="rounded-2xl border border-hairline bg-surface p-4">
              <NightStrip cells={strip} label="Your direct price for the next 14 nights" />
              <p className="mt-2 text-[12px] text-muted">Brighter nights cost more. Your floor is {dollarsExact(d.floorCents)} a bed.</p>
            </div>
          </Section>
          <Section title="Every channel, night by night">
            <RateTable columns={columns} rows={rows} />
            <p className="text-[12px] text-muted">
              &ldquo;You keep&rdquo; is what you receive after the member discount you fund and the site&apos;s commission. Competitor prices are public list prices for the same night and bed type.
            </p>
          </Section>
        </>
      )}

      <Section title="Who you compare against">
        <CompSet competitors={competitors} />
        {view.hasRates && <LoadExampleButton label="Refresh simulated example" />}
      </Section>

      <Section title="Booking site fees">
        <OtaFeesForm rows={feeRows} />
      </Section>

      <Section title="Upload rates">
        <RatesUpload />
      </Section>
    </div>
  );
}
