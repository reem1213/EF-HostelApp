import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Check } from "lucide-react";

import { BarChart } from "@/components/charts/bars";
import { LineChart } from "@/components/charts/line";
import { StackedBars } from "@/components/charts/stacked";
import { FixCard, FixList } from "@/components/fix-card";
import { Notice, PageHeader, Section, Stat, signedPct } from "@/components/page-kit";
import { ReviewForm } from "@/components/review-form";
import { PageSkeleton } from "@/components/skeleton";
import { actionsFor, loadDashboard } from "@/lib/dashboard";
import { COST_LINES, costLineLabel } from "@/lib/domain/costs";
import { pctChange } from "@/lib/domain/metrics";
import { dollars } from "@/lib/domain/money";
import { requireProperty } from "@/lib/session";

export default function ReportsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReportsView />
    </Suspense>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthShort = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function ReportsView() {
  await connection();
  const { store, property } = await requireProperty();
  const d = await loadDashboard(store, property);
  const a = d.audit;
  const m = d.metrics;
  const p = d.prevMetrics;

  const bookingsChange = pctChange(m.bookingsCount, p.bookingsCount);
  const revenueChange = pctChange(m.revenueCents, p.revenueCents);

  // C. costs: this period vs previous, per line
  const rows = d.breakdown.lines.map((l, i) => ({ label: l.label, saved: d.prevBreakdown.lines[i].totalCents - l.totalCents, before: d.prevBreakdown.lines[i].totalCents }));
  const comparable = d.prevBreakdown.totalCents > 0 && d.breakdown.totalCents > 0;
  const netSaved = rows.reduce((s, r) => s + r.saved, 0);
  const rose = rows.filter((r) => r.saved < 0 && r.before > 0).sort((x, y) => x.saved - y.saved);
  const hasCostHistory = d.costHistory.some((c) => COST_LINES.some((l) => c.lines[l] > 0));

  const rev = d.reviews.at(-1);
  const revPrev = d.reviews.at(-2);
  const recentReviews = d.reviews.slice(-6);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Reports" subtitle={d.hasAnyData ? `${d.windowLabel} compared with the 30 days before` : "Reports fill in as you add data"} />

      <Section title="A. Leaks we found" eyebrow="Identified">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Still open" value={`${dollars(a.openLeakCents)}/mo`} sub={`${a.openLeaks.length} leaks`} tone={a.openLeaks.length > 0 ? "bad" : "good"} />
          <Stat label="Recovered" value={`${dollars(a.recoveredCents)}/mo`} sub={`${a.addressedLeaks.length} fixed`} tone="good" />
        </div>
        {a.openLeaks.length > 0 && (
          <BarChart title="Open leaks" caption="Monthly cost of each, largest first" orientation="horizontal" data={a.openLeaks.map((f) => ({ label: f.title, value: f.monthlyImpactCents }))} valueFormat="dollars" valueHeader="Per month" />
        )}
        {a.openLeaks.map((f) => (
          <FixCard key={f.id} finding={f} />
        ))}
        {a.addressedLeaks.map((f) => (
          <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface px-4 py-3 text-[14px]">
            <Check className="size-4 text-green" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{f.title}</span>
            <span className="font-semibold text-green">{dollars(f.monthlyImpactCents)}/mo</span>
          </div>
        ))}
        {a.findings.filter((f) => f.kind === "leak").length === 0 && <Notice>No leaks found yet. Add bookings, monthly costs and a bank summary so we can look for them.</Notice>}
      </Section>

      <Section title="B. Bookings" eyebrow="Growth">
        {m.bookingsCount > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Bookings" value={String(m.bookingsCount)} sub={signedPct(bookingsChange)} tone={(bookingsChange ?? 0) >= 0 ? "good" : "bad"} />
              <Stat label="Revenue" value={dollars(m.revenueCents)} sub={signedPct(revenueChange)} tone={(revenueChange ?? 0) >= 0 ? "good" : "bad"} />
            </div>
            <BarChart title="Revenue by month" caption="By check-in month, last 6 months" data={d.monthly.map((x) => ({ label: monthShort(x.month), value: x.revenueCents }))} valueFormat="dollars" valueHeader="Revenue" />
            <BarChart title="Occupancy by weekday" caption="Your quietest weekday is the best place to run an offer" data={d.weekday.map((w) => ({ label: WEEKDAYS[w.weekday], value: w.occupancy }))} valueFormat="percent" valueHeader="Occupancy" max={1} />
            <p className="text-[13.5px]">
              <strong>Next step: </strong>
              {(bookingsChange ?? 0) > 0.005 ? "Bookings are up. Lock it in by moving more of them direct. " : (bookingsChange ?? 0) < -0.005 ? "Bookings are down. Run an offer on your quietest weekday. " : "Bookings are steady. The quickest gain is moving more of them direct. "}
              <Link href="/profit" className="font-semibold text-teal">
                See the plan
              </Link>
            </p>
          </>
        ) : (
          <>
            <Notice>We need bookings to show growth. Import them, or connect your PMS so this updates by itself.</Notice>
            <FixList items={actionsFor(d, "reports").filter((f) => f.id === "setup-bookings")} emptyText="" />
          </>
        )}
      </Section>

      <Section title="C. Costs we have cut" eyebrow="Savings">
        {hasCostHistory ? (
          <>
            {comparable && <Stat label={netSaved >= 0 ? "Total decrease" : "Total increase"} value={`${dollars(Math.abs(netSaved))}/mo`} sub="Tracked costs vs the previous period" tone={netSaved >= 0 ? "good" : "bad"} />}
            <StackedBars
              title="Monthly costs"
              caption="The five lines that make up your cost per bed"
              columns={d.costHistory.map((c) => ({ label: monthShort(c.month), parts: c.lines }))}
              series={COST_LINES.map((l) => ({ key: l, label: costLineLabel[l] }))}
              valueFormat="dollars"
            />
            <p className="text-[13.5px]">
              <strong>Next step: </strong>
              {rose.length > 0 ? `${rose[0].label} rose by ${dollars(Math.abs(rose[0].saved))}. Find out why and ask for the old rate. ` : "Nothing went up. Keep your costs updated each month. "}
              <Link href="/costs" className="font-semibold text-teal">
                Open Costs
              </Link>
            </p>
          </>
        ) : (
          <Notice>
            To show what you have saved we need your costs over time.{" "}
            <Link href="/costs#monthly-costs" className="font-semibold text-teal">
              Keep your monthly costs up to date
            </Link>{" "}
            and this fills in by itself.
          </Notice>
        )}
      </Section>

      <Section title="D. Google reviews and visibility" eyebrow="Reputation" id="reviews">
        {rev && (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Rating" value={rev.rating.toFixed(1)} sub={revPrev ? `${rev.rating - revPrev.rating >= 0 ? "+" : ""}${(rev.rating - revPrev.rating).toFixed(1)}` : undefined} tone={revPrev && rev.rating < revPrev.rating ? "bad" : "good"} />
            <Stat label="Reviews" value={String(rev.reviewCount)} sub={revPrev ? `${rev.reviewCount - revPrev.reviewCount >= 0 ? "+" : ""}${rev.reviewCount - revPrev.reviewCount}` : undefined} tone="good" />
            <Stat label="Searches" value={rev.impressions === null ? "—" : String(rev.impressions)} />
          </div>
        )}
        {recentReviews.length > 1 && (
          <>
            <LineChart title="Rating" caption="Monthly Google rating" points={recentReviews.map((r) => ({ label: monthShort(r.month), value: r.rating }))} valueFormat="rating" domain={[3, 5]} />
            <LineChart title="Reviews" caption="Total Google reviews" points={recentReviews.map((r) => ({ label: monthShort(r.month), value: r.reviewCount }))} valueFormat="count" />
          </>
        )}
        <FixList items={d.actions.filter((f) => f.id.startsWith("reviews-") || f.id === "setup-reviews")} emptyText="Your reviews look healthy. Keep asking happy guests to review you." />
        <ReviewForm month={d.month} defaults={rev?.month === d.month ? { rating: rev.rating, reviewCount: rev.reviewCount, impressions: rev.impressions } : undefined} />
      </Section>
    </div>
  );
}
