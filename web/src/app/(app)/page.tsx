import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ChevronRight } from "lucide-react";

import { CapacityWarning } from "@/components/capacity-warning";
import { Chat } from "@/components/chat";
import { NightStrip } from "@/components/night-strip";
import { FixCard } from "@/components/fix-card";
import { PageSkeleton } from "@/components/skeleton";
import { Section, Stat } from "@/components/page-kit";
import { loadDashboard } from "@/lib/dashboard";
import { dollars, dollarsExact } from "@/lib/domain/money";
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

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[22px] bg-dark p-5 text-dark-text" aria-label="Your nights">
        <p className="text-[13px] text-dark-text/75">
          {property.name}
          {d.hasAnyData ? ` · ${d.windowLabel}` : ""}
        </p>
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
