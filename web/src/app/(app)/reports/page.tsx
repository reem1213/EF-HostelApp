import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Check } from "lucide-react";

import { FixCard, FixList } from "@/components/fix-card";
import { Notice, PageHeader, Section, Stat, signedPct } from "@/components/page-kit";
import { ReviewForm } from "@/components/review-form";
import { PageSkeleton } from "@/components/skeleton";
import { actionsFor, loadDashboard } from "@/lib/dashboard";
import { pctChange } from "@/lib/domain/metrics";
import { dollars } from "@/lib/domain/money";
import { requireProperty } from "@/lib/session";
import { cn } from "@/lib/utils";

export default function ReportsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReportsView />
    </Suspense>
  );
}

async function ReportsView() {
  await connection();
  const { store, property } = await requireProperty();
  const d = await loadDashboard(store, property);
  const a = d.audit;
  const m = d.metrics;
  const p = d.prevMetrics;

  // C. calculated decrease: previous period minus this period, per cost line
  const rows = d.breakdown.lines.map((l, i) => {
    const before = d.prevBreakdown.lines[i].totalCents;
    return { label: l.label, before, now: l.totalCents, saved: before - l.totalCents };
  });
  const comparable = d.prevBreakdown.totalCents > 0 && d.breakdown.totalCents > 0;
  const netSaved = rows.reduce((s, r) => s + r.saved, 0);
  const rose = rows.filter((r) => r.saved < 0 && r.before > 0).sort((x, y) => x.saved - y.saved);
  const cardNow = d.expenses.reduce((s, e) => s + e.amountCents, 0);
  const cardBefore = d.prevExpenses.reduce((s, e) => s + e.amountCents, 0);

  const bookingsChange = pctChange(m.bookingsCount, p.bookingsCount);
  const revenueChange = pctChange(m.revenueCents, p.revenueCents);

  const rev = d.reviews.at(-1);
  const revPrev = d.reviews.at(-2);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Reports" subtitle={d.hasAnyData ? `${d.windowLabel} compared with the 30 days before` : "Reports fill in as you add data"} />

      <Section title="A. Leaks we found" eyebrow="Identified">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Still open" value={`${dollars(a.openLeakCents)}/mo`} sub={`${a.openLeaks.length} leaks`} tone={a.openLeaks.length > 0 ? "bad" : "good"} />
          <Stat label="Recovered" value={`${dollars(a.recoveredCents)}/mo`} sub={`${a.addressedLeaks.length} fixed`} tone="good" />
        </div>
        {a.openLeaks.map((f, i) => (
          <FixCard key={f.id} finding={f} defaultOpen={i === 0} />
        ))}
        {a.addressedLeaks.map((f) => (
          <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface px-4 py-3 text-[14px]">
            <Check className="size-4 text-green" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{f.title}</span>
            <span className="font-semibold text-green">{dollars(f.monthlyImpactCents)}/mo</span>
          </div>
        ))}
        {a.findings.filter((f) => f.kind === "leak").length === 0 && (
          <Notice>No leaks found yet. Add bookings, monthly costs and a bank summary so we can look for them.</Notice>
        )}
      </Section>

      <Section title="B. Bookings this period" eyebrow="Growth">
        {p.bookingsCount > 0 && m.bookingsCount > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Bookings" value={String(m.bookingsCount)} sub={signedPct(bookingsChange)} tone={(bookingsChange ?? 0) >= 0 ? "good" : "bad"} />
              <Stat label="Revenue" value={dollars(m.revenueCents)} sub={signedPct(revenueChange)} tone={(revenueChange ?? 0) >= 0 ? "good" : "bad"} />
            </div>
            <p className="text-[13.5px]">
              <strong>Next step: </strong>
              {(bookingsChange ?? 0) > 0.005 ? (
                <>Bookings are up. Lock it in by moving more of them direct. </>
              ) : (bookingsChange ?? 0) < -0.005 ? (
                <>Bookings are down. Check your busiest-to-quietest nights and run a midweek offer. </>
              ) : (
                <>Bookings are steady. The quickest gain is moving more of them direct. </>
              )}
              <Link href="/profit" className="font-semibold text-teal">
                See the plan
              </Link>
            </p>
          </>
        ) : (
          <>
            <Notice>We need bookings for two periods to show growth. Import last period&apos;s bookings, or connect your PMS so this updates by itself.</Notice>
            <FixList items={actionsFor(d, "reports").filter((f) => f.id === "setup-bookings")} emptyText="" />
          </>
        )}
      </Section>

      <Section title="C. Costs we have cut" eyebrow="Savings">
        {comparable ? (
          <>
            <Stat
              label={netSaved >= 0 ? "Total decrease" : "Total increase"}
              value={`${dollars(Math.abs(netSaved))}/mo`}
              sub="Tracked costs vs the previous period"
              tone={netSaved >= 0 ? "good" : "bad"}
            />
            <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
              <table className="w-full text-[13.5px]">
                <thead className="text-left text-[11.5px] uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Cost</th>
                    <th className="px-2 py-2 text-right font-medium">Before</th>
                    <th className="px-2 py-2 text-right font-medium">Now</th>
                    <th className="px-4 py-2 text-right font-medium">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {rows.map((r) => (
                    <tr key={r.label}>
                      <td className="px-4 py-2.5">{r.label}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{dollars(r.before)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{dollars(r.now)}</td>
                      <td className={cn("px-4 py-2.5 text-right font-semibold tabular-nums", r.saved > 0 ? "text-green" : r.saved < 0 ? "text-red" : "text-muted")}>
                        {r.saved === 0 ? "—" : `${r.saved > 0 ? "−" : "+"}${dollars(Math.abs(r.saved))}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cardBefore > 0 && cardNow > 0 && (
              <p className="text-[13px] text-muted">
                Card and bank charges from uploads: {dollars(cardBefore)} → {dollars(cardNow)} ({cardNow <= cardBefore ? "down" : "up"} {dollars(Math.abs(cardNow - cardBefore))}).
              </p>
            )}
            <p className="text-[13.5px]">
              <strong>Next step: </strong>
              {rose.length > 0 ? (
                <>
                  {rose[0].label} rose by {dollars(Math.abs(rose[0].saved))}. Find out why and ask for the old rate.{" "}
                </>
              ) : (
                <>Nothing went up. Keep going and re-check next month. </>
              )}
              <Link href="/costs" className="font-semibold text-teal">
                Open Costs
              </Link>
            </p>
          </>
        ) : (
          <Notice>
            To show what you have saved we need two periods of costs.{" "}
            <Link href="/costs#monthly-costs" className="font-semibold text-teal">
              Keep your monthly costs up to date
            </Link>{" "}
            and this fills in by itself.
          </Notice>
        )}
      </Section>

      <Section title="D. Google reviews and visibility" eyebrow="Reputation" id="reviews">
        {rev ? (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Rating" value={rev.rating.toFixed(1)} sub={revPrev ? `${rev.rating - revPrev.rating >= 0 ? "+" : ""}${(rev.rating - revPrev.rating).toFixed(1)}` : undefined} tone={revPrev && rev.rating < revPrev.rating ? "bad" : "good"} />
            <Stat label="Reviews" value={String(rev.reviewCount)} sub={revPrev ? `${rev.reviewCount - revPrev.reviewCount >= 0 ? "+" : ""}${rev.reviewCount - revPrev.reviewCount}` : undefined} tone="good" />
            <Stat label="Searches" value={rev.impressions === null ? "—" : String(rev.impressions)} sub={revPrev?.impressions && rev.impressions !== null ? signedPct(pctChange(rev.impressions, revPrev.impressions))?.replace(" vs last period", "") : undefined} tone="good" />
          </div>
        ) : null}
        <FixList items={d.actions.filter((f) => f.id.startsWith("reviews-") || f.id === "setup-reviews")} emptyText="Your reviews look healthy. Keep asking happy guests to review you." />
        <p className="text-[13px] text-muted">Enter this month&apos;s numbers from your Google Business Profile. A Google connection will fill them in automatically later.</p>
        <ReviewForm month={d.month} defaults={rev?.month === d.month ? { rating: rev.rating, reviewCount: rev.reviewCount, impressions: rev.impressions } : undefined} />
      </Section>
    </div>
  );
}
