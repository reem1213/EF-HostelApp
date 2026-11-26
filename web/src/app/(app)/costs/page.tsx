import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";

import { ChargeReview } from "@/components/charge-review";
import { FixList } from "@/components/fix-card";
import { MonthlyCostsForm } from "@/components/monthly-costs-form";
import { Notice, PageHeader, Section, Stat } from "@/components/page-kit";
import { PageSkeleton } from "@/components/skeleton";
import { Badge } from "@/components/ui/badge";
import { actionsFor, loadDashboard } from "@/lib/dashboard";
import type { CostSource } from "@/lib/domain/costs";
import { dollars, dollarsExact } from "@/lib/domain/money";
import { requireProperty } from "@/lib/session";

export default function CostsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CostsView />
    </Suspense>
  );
}

const SOURCE_LABEL: Record<CostSource, string> = {
  entered: "You entered",
  imported: "From uploads",
  schedule: "From schedule",
  missing: "Missing",
};

async function CostsView() {
  await connection();
  const { store, property } = await requireProperty();
  const d = await loadDashboard(store, property);
  const b = d.breakdown;
  const lastBank = d.imports.find((i) => i.kind === "bank");
  const charges = [...d.expenses].sort((x, y) => y.amountCents - x.amountCents).slice(0, 15);
  const margin = d.metrics.adrCents - b.perBedNightCents;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title="Costs" subtitle={d.hasAnyData ? `Based on ${d.windowLabel}` : "Enter your costs to see your cost per bed"} />

      <Section title="What to do" eyebrow="Next steps">
        <FixList items={actionsFor(d, "costs")} emptyText="No cost problems found. Keep your monthly costs up to date and we will watch for changes." />
      </Section>

      <Section title="A. Costs" eyebrow="What you spend">
        <div id="monthly-costs" className="scroll-mt-4">
          <h3 className="mb-2 text-[14px] font-semibold">Monthly costs</h3>
          <p className="mb-3 text-[13px] text-muted">Utilities, salaries, rent and the rest. Update them whenever they change; we compare each month in Reports.</p>
          <MonthlyCostsForm month={d.month} inputs={d.costInputs} />
        </div>

        <div id="bank">
          <h3 className="mb-2 mt-3 text-[14px] font-semibold">Bank and card charges</h3>
          <div className="rounded-2xl border border-hairline bg-surface p-4">
            <p className="text-[14px]">
              {lastBank ? (
                <>
                  Last upload: <strong>{lastBank.filename}</strong>, {lastBank.rowsOk} charges on {lastBank.createdAt.toISOString().slice(0, 10)}.
                </>
              ) : (
                "No bank summary uploaded yet."
              )}
            </p>
            <p className="mt-1 text-[12.5px] text-muted">Upload a CSV from your bank or card. A live card connection comes later.</p>
            <Link href="/connections#import" className="mt-3 inline-flex h-11 items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-white">
              Upload bank summary
            </Link>
          </div>
        </div>

        {charges.length > 0 && (
          <div>
            <h3 className="mb-1 mt-3 text-[14px] font-semibold">Check the categories</h3>
            <p className="mb-2 text-[12.5px] text-muted">Your biggest charges, sorted automatically. Correct any we got wrong and your numbers update.</p>
            <ChargeReview rows={charges.map((e) => ({ id: e.id, date: e.date.toISOString().slice(0, 10), merchant: e.merchant, amountCents: e.amountCents, category: e.category }))} />
          </div>
        )}

        <Notice tone="later">
          <strong className="text-ink">Cancellations and refunds</strong> — coming later. We plan to connect refund tracking so lost bookings and chargebacks show up here.
        </Notice>
      </Section>

      <Section title="B. Cost per bed" eyebrow="Rates">
        {b.totalCents > 0 && d.metrics.occupiedBedNights > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Cost per occupied bed" value={dollarsExact(b.perBedNightCents)} sub={`${dollars(b.totalCents)} over ${b.occupiedBedNights} bed-nights`} />
              <Stat
                label="Average rate you charge"
                value={d.metrics.adrCents > 0 ? dollarsExact(d.metrics.adrCents) : "—"}
                sub={d.metrics.adrCents > 0 ? `${margin >= 0 ? "Margin" : "Loss"} ${dollarsExact(Math.abs(margin))} per bed-night` : undefined}
                tone={margin >= 0 ? "good" : "bad"}
              />
            </div>

            <ul className="flex flex-col gap-2">
              {b.lines.map((l) => (
                <li key={l.line} className="rounded-2xl border border-hairline bg-surface p-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] font-semibold">{l.label}</span>
                    <span className="text-[15px] font-semibold tabular-nums">{l.source === "missing" ? "—" : `${dollarsExact(l.perBedNightCents)} / bed`}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hairline" aria-hidden>
                    <div className="h-full rounded-full bg-teal" style={{ width: `${Math.round(l.share * 100)}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[12px] text-muted">
                    <span>{l.source === "missing" ? "Not entered yet" : `${dollars(l.totalCents)} a month · ${Math.round(l.share * 100)}% of cost`}</span>
                    <Badge tone={l.source === "missing" ? "high" : "neutral"}>{SOURCE_LABEL[l.source]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[12.5px] text-muted">
              Daily rates come from your bookings. When your PMS connection goes live, this will use the exact daily rates it reports.
            </p>
          </>
        ) : (
          <Notice>
            To calculate cost per bed we need your monthly costs and your bookings (for occupied bed-nights). Fill in the form above, then{" "}
            <Link href="/connections" className="font-semibold text-teal">
              import bookings
            </Link>
            .
          </Notice>
        )}
      </Section>
    </div>
  );
}
