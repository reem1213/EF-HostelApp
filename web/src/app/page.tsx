import { Suspense } from "react";
import { connection } from "next/server";

import { Breakdown } from "@/components/home/breakdown";
import { LeakHero } from "@/components/home/leak-hero";
import { NextStepCard } from "@/components/home/next-step";
import { PropertyPulse } from "@/components/home/pulse";
import { loadAudit } from "@/lib/data/audit-repository";
import { getAuditDeps } from "@/lib/services";

export default function HomePage() {
  // The shell prerenders; the audit streams in, so money figures are never stale.
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <AuditView />
    </Suspense>
  );
}

async function AuditView() {
  await connection();
  let audit;
  try {
    audit = await loadAudit(await getAuditDeps());
  } catch (e) {
    return (
      <div className="pt-24 text-center">
        <p className="font-semibold">Couldn&apos;t load your audit</p>
        <p className="mt-1 text-[12.5px] text-muted">{e instanceof Error ? e.message : "Unknown error"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="text-center">
        <h1 className="text-[16px] font-semibold">{audit.property.name}</h1>
        <p className="text-[12.5px] text-muted">Synced {formatSynced(audit.syncedAt)}</p>
      </header>

      <LeakHero audit={audit} />

      <section className="flex flex-col gap-3">
        <h2 className="text-[14px] font-medium text-muted">Audit breakdown</h2>
        <Breakdown audit={audit} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[14px] font-medium text-muted">Recommended next step</h2>
        <NextStepCard finding={audit.nextStep} />
      </section>

      <PropertyPulse audit={audit} />
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Loading audit">
      <div className="mx-auto h-10 w-48 rounded bg-hairline" />
      <div className="h-56 rounded-[18px] bg-dark/80" />
      <div className="h-24 rounded-2xl bg-hairline" />
      <div className="h-24 rounded-2xl bg-hairline" />
    </div>
  );
}

function formatSynced(t: Date) {
  const mins = Math.round((Date.now() - t.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}
