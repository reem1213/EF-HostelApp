import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";

import { DirectSlider } from "@/components/direct-slider";
import { FixList } from "@/components/fix-card";
import { Notice, PageHeader, Section, Stat, signedPct } from "@/components/page-kit";
import { PageSkeleton } from "@/components/skeleton";
import { actionsFor, loadDashboard } from "@/lib/dashboard";
import { pctChange } from "@/lib/domain/metrics";
import { resolveOta } from "@/lib/domain/ota";
import { blendedCommission, DEFAULT_DIRECT_FEE } from "@/lib/domain/ota-economics";
import { dollars, dollarsExact } from "@/lib/domain/money";
import { DIRECT_BOOKING_PLAN } from "@/lib/domain/next-steps";
import { requireProperty } from "@/lib/session";

export default function ProfitPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProfitView />
    </Suspense>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

async function ProfitView() {
  await connection();
  const { store, property } = await requireProperty();
  const d = await loadDashboard(store, property);
  const m = d.metrics;
  const prev = d.prevMetrics;
  const hasBookings = d.dataState.hasBookings && m.bookingsCount > 0;
  const live = d.connections.length > 0;

  const bookingsChange = pctChange(m.bookingsCount, prev.bookingsCount);
  const occChange = prev.occupancyRate > 0 ? m.occupancyRate - prev.occupancyRate : null;
  const other = Math.max(0, 1 - m.directShare - m.otaShare);
  // Bookings record the channel, not which OTA, so use the average commission of the OTAs the hostel selected.
  const otaCommission = blendedCommission(Object.fromEntries(property.otas.map((id) => [id, 1])), property.otaSettings);
  const otaNames = property.otas.map((id) => resolveOta(id, property.otaSettings).name);

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title="Profit" subtitle={hasBookings ? `Based on ${d.windowLabel}` : "Bookings unlock this page"} />

      <Section title="What to do" eyebrow="Next steps">
        <FixList items={actionsFor(d, "profit")} emptyText="Your bookings look healthy. We will flag any change." />
      </Section>

      {hasBookings ? (
        <>
          <Section title="Bookings, occupancy and retention" eyebrow="How you are doing">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Bookings" value={String(m.bookingsCount)} sub={signedPct(bookingsChange)} tone={bookingsChange === null ? "neutral" : bookingsChange >= 0 ? "good" : "bad"} />
              <Stat
                label="Occupancy"
                value={pct(m.occupancyRate)}
                sub={occChange === null ? `${m.occupiedBedNights} bed-nights` : `${occChange >= 0 ? "+" : ""}${Math.round(occChange * 100)} pts vs last period`}
                tone={occChange === null ? "neutral" : occChange >= 0 ? "good" : "bad"}
              />
              <Stat
                label="Retention"
                value={m.returningGuestShare === null ? "—" : pct(m.returningGuestShare)}
                sub={m.returningGuestShare === null ? "Needs guest email in bookings" : `${m.returningGuests} of ${m.uniqueGuests} guests returned`}
              />
              <Stat label="Average rate" value={dollarsExact(m.adrCents)} sub={`${dollars(m.revPabCents)} per available bed`} />
            </div>
            <p className="text-[12px] text-muted">
              Source: {live ? "PMS connection saved (live sync is not switched on yet), plus uploaded files." : "uploaded booking files."}{" "}
              <Link href="/connections" className="font-semibold text-teal">
                Manage data
              </Link>
            </p>
          </Section>

          <Section title="Where your bookings come from">
            <div className="rounded-2xl border border-hairline bg-surface p-4">
              <div className="flex h-3 overflow-hidden rounded-full bg-hairline" role="img" aria-label={`Direct ${pct(m.directShare)}, booking sites ${pct(m.otaShare)}`}>
                <div className="bg-teal" style={{ width: pct(m.directShare) }} />
                <div className="bg-gold" style={{ width: pct(m.otaShare) }} />
              </div>
              <ul className="mt-3 space-y-1.5 text-[13.5px]">
                <li className="flex justify-between"><span><span className="mr-2 inline-block size-2 rounded-full bg-teal" />Direct</span><strong>{pct(m.directShare)}</strong></li>
                <li className="flex justify-between"><span><span className="mr-2 inline-block size-2 rounded-full bg-gold" />Booking sites (OTAs)</span><strong>{pct(m.otaShare)}</strong></li>
                {other > 0.01 && <li className="flex justify-between"><span><span className="mr-2 inline-block size-2 rounded-full bg-hairline" />Other</span><strong>{pct(other)}</strong></li>}
              </ul>
            </div>
            <DirectSlider revenueCents={m.revenueCents} currentDirectShare={m.directShare} otaCommission={otaCommission} directFee={DEFAULT_DIRECT_FEE} otaNames={otaNames} />
          </Section>
        </>
      ) : (
        <Notice>
          No bookings yet, so occupancy, retention and channel mix cannot be calculated.{" "}
          <Link href="/connections" className="font-semibold text-teal">
            Connect your PMS or import bookings
          </Link>
          .
        </Notice>
      )}

      <Section title="Win more direct bookings" eyebrow="Plan">
        <p className="text-[13px] text-muted">Every booking that comes direct skips the booking-site commission. This is the plan, in order.</p>
        <Link href="/profit/direct" className="rounded-2xl border border-hairline bg-surface px-4 py-3.5 text-[15px] font-semibold text-teal">
          Open the direct-booking hub
        </Link>
        <Link href="/profit/emails" className="rounded-2xl border border-hairline bg-surface px-4 py-3.5 text-[15px] font-semibold text-teal">
          Win back past guests by email
        </Link>
        <div className="flex flex-col gap-2">
          {DIRECT_BOOKING_PLAN.map((block, i) => (
            <details key={block.title} className="group rounded-2xl border border-hairline bg-surface" open={i === 0}>
              <summary className="cursor-pointer list-none px-4 py-3.5 text-[15px] font-semibold marker:hidden">
                <span className="mr-2 text-teal">{i + 1}.</span>
                {block.title}
              </summary>
              <ul className="list-disc space-y-1.5 px-4 pb-4 pl-9 text-[14px] leading-snug">
                {block.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </Section>
    </div>
  );
}
