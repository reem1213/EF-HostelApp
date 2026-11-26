import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ChevronRight, Zap } from "lucide-react";

import { CapacityWarning } from "@/components/capacity-warning";
import { Chat } from "@/components/chat";
import { QuietNights, type QuietView } from "@/components/quiet-nights";
import { NightStrip } from "@/components/night-strip";
import { FixCard } from "@/components/fix-card";
import { PageSkeleton } from "@/components/skeleton";
import { Section, Stat } from "@/components/page-kit";
import { loadDashboard } from "@/lib/dashboard";
import { dollars, dollarsExact } from "@/lib/domain/money";
import { DORM_BED } from "@/lib/domain/guardrails";
import { suggestPrice } from "@/lib/domain/quiet";
import { currentSnapshot } from "@/lib/domain/rates";
import { utcDay } from "@/lib/period";
import { requireProperty } from "@/lib/session";

export default function HomePage() {
  // The shell prerenders; the figures stream in per request so money is never stale.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomeView />
    </Suspense>
  );
}

const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PAGE_PATH = { costs: "/costs", profit: "/profit", reports: "/reports", setup: "/connections", home: "/" } as const;

async function HomeView() {
  await connection();
  const { store, property } = await requireProperty();
  const d = await loadDashboard(store, property);

  const next = d.actions[0] ?? null;
  const more = d.actions.slice(1, 4);
  const biggest = d.audit.openLeaks[0] ?? null;
  const perBed = d.breakdown.perBedNightCents;

  // Suggested prices come from code, cut by the occupancy gap and held to the owner's limits. They need a loaded direct rate.
  const today = utcDay(new Date());
  const rates = d.quiet.length > 0 ? await store.listRates(property.id, { start: today, end: new Date(today.getTime() + 30 * 86_400_000) }) : [];
  const quiet: QuietView[] = d.quiet.map((n) => {
    const day = n.date.getTime();
    const snap = currentSnapshot(rates.filter((r) => r.channel === "direct" && r.competitorId === null && r.roomType === DORM_BED && r.stayDate.getTime() === day));
    const cur = snap?.priceCents ?? null;
    const sug = cur === null ? null : suggestPrice({ currentCents: cur, gap: n.gap, floorCents: d.floorCents, ceilingCents: d.guardrails.ceilingCents, maxChangePct: d.guardrails.maxChangePctPerDay });
    const hasSuggestion = cur !== null && sug !== null && sug !== cur;
    return {
      date: n.date.toISOString().slice(0, 10),
      label: n.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }),
      occupancyPct: Math.round(n.occupancy * 100),
      usualPct: Math.round(n.weekdayAvg * 100),
      simulated: snap?.source === "simulated",
      current: cur === null ? null : dollarsExact(cur),
      suggested: hasSuggestion ? dollarsExact(sug) : null,
      suggestedRaw: hasSuggestion ? (sug / 100).toFixed(2) : null,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[22px] bg-dark p-5 text-dark-text" aria-label="Your nights">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[13px] text-dark-text/75">
            {property.name}
            {d.hasAnyData ? ` · ${d.windowLabel}` : ""}
          </p>
          <Link href="/actions" className="-mr-1 -mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12.5px] font-medium text-white">
            <Zap className="size-3.5" aria-hidden />
            Actions
            {d.pendingRuns > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-gold px-1 text-[11px] font-bold text-dark">{d.pendingRuns}</span>}
          </Link>
        </div>
        <h1 className="mt-1.5 font-serif text-[27px] font-semibold leading-[1.1] text-white">
          {d.quietestWeekday
            ? `${WEEKDAYS_LONG[d.quietestWeekday.weekday]}s are your quietest nights, ${Math.round(d.quietestWeekday.occupancy * 100)}% full.`
            : d.metrics.bookingsCount > 0
              ? `You were ${Math.round(d.metrics.occupancyRate * 100)}% full over the last 30 days.`
              : "Add your bookings to see your nights."}
        </h1>
        <div className="mt-6">
          <NightStrip
            tone="dark"
            label="Occupancy by night, 20 nights back and 10 ahead"
            cells={d.nights.map((n) => ({ date: n.date.toISOString(), occupancy: n.occupancy, future: n.future, isToday: n.isToday }))}
          />
        </div>
      </section>

      {d.capacity.exceeded && d.capacity.peakDate && (
        <CapacityWarning
          info={{ peak: d.capacity.peak, peakDate: d.capacity.peakDate.toISOString().slice(0, 10), nightsOver: d.capacity.nightsOver, beds: property.beds }}
        />
      )}

      <Chat />

      <Section title="Recommended next step" eyebrow="Do this first">
        {next ? (
          <FixCard finding={next} defaultOpen />
        ) : (
          <div className="rounded-2xl border border-hairline bg-surface p-4 text-[14px] text-muted">
            You&apos;re all caught up. New fixes appear when your data changes.
          </div>
        )}
      </Section>

      {quiet.length > 0 && (
        <Section title="Quietest nights coming up">
          <QuietNights nights={quiet} />
        </Section>
      )}

      <Section title="At a glance">
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Cost per bed"
            value={perBed > 0 ? dollarsExact(perBed) : "—"}
            sub={perBed > 0 ? (d.metrics.adrCents > 0 ? `You earn ${dollarsExact(d.metrics.adrCents)} per bed-night` : "per occupied bed-night") : "Enter your monthly costs"}
            tone={perBed > 0 && d.metrics.adrCents > perBed ? "good" : "neutral"}
          />
          <Stat
            label="Biggest leak"
            value={biggest ? `${dollars(biggest.monthlyImpactCents)}/mo` : d.audit.findings.length > 0 || d.hasAnyData ? "None" : "—"}
            sub={biggest ? biggest.title : d.hasAnyData ? "No open leaks right now" : "Needs bookings and costs"}
            tone={biggest ? "bad" : "good"}
          />
        </div>
      </Section>

      {more.length > 0 && (
        <Section title="More next steps">
          <ul className="flex flex-col gap-2">
            {more.map((f) => (
              <li key={f.id}>
                <Link
                  href={PAGE_PATH[f.page]}
                  className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface px-4 py-3 text-[14px]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{f.title}</span>
                    {f.monthlyImpactCents > 0 && <span className="text-[12px] text-muted">about {dollars(f.monthlyImpactCents)}/mo</span>}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
