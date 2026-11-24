"use client";

import { useState, useTransition } from "react";
import { ArrowUpRight, ChevronRight, TriangleAlert } from "lucide-react";

import { markFindingDone } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dollars } from "@/lib/domain/money";
import type { Finding } from "@/lib/domain/types";

/** Tappable "recommended next step" card with a details sheet. */
export function NextStepCard({ finding }: { finding: Finding | null }) {
  const [open, setOpen] = useState(false);

  if (!finding) {
    return (
      <div className="rounded-2xl border border-hairline bg-surface p-4 text-[14px] text-muted">
        You&apos;re all caught up. New findings appear after the next sync.
      </div>
    );
  }

  const growth = finding.kind === "growth";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-start gap-3.5 rounded-2xl border border-hairline bg-surface p-4 text-left"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-soft">
          {growth ? <ArrowUpRight className="size-5 text-teal" aria-hidden /> : <TriangleAlert className="size-5 text-teal" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold leading-snug">{finding.title}</span>
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`text-[13px] font-semibold ${growth ? "text-green" : "text-amber"}`}>
              {growth ? "+" : ""}
              {dollars(finding.monthlyImpactCents)}/mo {growth ? "impact" : "leak"}
            </span>
            <Badge tone={finding.severity}>{finding.severity}</Badge>
          </span>
        </span>
        <ChevronRight className="mt-1 size-5 shrink-0 text-muted" aria-hidden />
      </button>

      {open && <DetailSheet finding={finding} onClose={() => setOpen(false)} />}
    </>
  );
}

function DetailSheet({ finding, onClose }: { finding: Finding; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function markDone() {
    setError(null);
    startTransition(async () => {
      const res = await markFindingDone(finding.id);
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="finding-title" className="fixed inset-0 z-50 flex items-end bg-ink/40" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-surface p-6 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hairline" aria-hidden />
        <h3 id="finding-title" className="text-[20px] font-semibold">{finding.title}</h3>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{finding.detail}</p>
        <p className="mt-4 text-[14px] font-semibold text-amber">{dollars(finding.monthlyImpactCents)} per month</p>

        {error && <p className="mt-3 text-[13px] text-red">{error}</p>}

        <div className="mt-6 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Close</Button>
          <Button className="flex-1" onClick={markDone} disabled={pending}>
            {pending ? "Saving…" : "Mark as done"}
          </Button>
        </div>
      </div>
    </div>
  );
}
