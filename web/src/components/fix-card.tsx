"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowUpRight, Check, ChevronDown, TriangleAlert, Wrench } from "lucide-react";

import { markFindingDone } from "@/app/actions/property";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dollars } from "@/lib/domain/money";
import type { Finding } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/** Where each setup step is completed. */
const SETUP_LINKS: Record<string, { href: string; label: string }> = {
  "setup-bookings": { href: "/connections", label: "Connect or import bookings" },
  "setup-costs": { href: "/costs#monthly-costs", label: "Enter monthly costs" },
  "setup-bank": { href: "/connections#import", label: "Upload a bank summary" },
  "setup-guest-identity": { href: "/connections#import", label: "Re-import with guest email" },
  "setup-reviews": { href: "/reports#reviews", label: "Add your Google rating" },
};

/**
 * One recommendation. Always shows what to DO: the steps are one tap away and
 * the fix can be marked done, which moves the saving into "recovered".
 */
export function FixCard({ finding, defaultOpen = false, className }: { finding: Finding; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const setupLink = finding.kind === "setup" ? SETUP_LINKS[finding.id] : undefined;
  const growth = finding.kind === "growth";

  const Icon = finding.kind === "setup" ? Wrench : growth ? ArrowUpRight : TriangleAlert;
  const impact =
    finding.monthlyImpactCents > 0
      ? `${growth ? "+" : ""}${dollars(finding.monthlyImpactCents)}/mo ${growth ? "opportunity" : "leak"}`
      : null;

  return (
    <article className={cn("rounded-2xl border border-hairline bg-surface", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3.5 p-4 text-left"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-soft">
          <Icon className="size-5 text-teal" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold leading-snug">{finding.title}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            {impact && <span className={cn("text-[13px] font-semibold", growth ? "text-green" : "text-amber")}>{impact}</span>}
            <Badge tone={finding.kind === "setup" ? "neutral" : finding.severity}>{finding.kind === "setup" ? "Set up" : finding.severity}</Badge>
          </span>
        </span>
        <ChevronDown className={cn("mt-1 size-5 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="border-t border-hairline px-4 pb-4 pt-3">
          <p className="text-[13.5px] leading-relaxed text-muted">{finding.detail}</p>
          <p className="mt-3 text-[12px] font-semibold uppercase tracking-wider text-teal">How to fix it</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[14px] leading-snug">
            {finding.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>

          {error && (
            <p role="alert" className="mt-3 text-[13px] text-red">
              {error}
            </p>
          )}

          <div className="mt-4 flex gap-3">
            {setupLink && (
              <Link href={setupLink.href} className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-white">
                {setupLink.label}
              </Link>
            )}
            {finding.kind !== "setup" && (
              <Button
                className="flex-1"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const res = await markFindingDone(finding.id);
                    if (res.error) setError(res.error);
                  })
                }
              >
                <Check className="size-4" aria-hidden />
                {pending ? "Saving…" : "Mark as done"}
              </Button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export function FixList({ items, emptyText }: { items: Finding[]; emptyText: string }) {
  if (items.length === 0) {
    return <div className="rounded-2xl border border-dashed border-hairline p-4 text-[13.5px] text-muted">{emptyText}</div>;
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((f, i) => (
        <FixCard key={f.id} finding={f} defaultOpen={i === 0 && items.length === 1} />
      ))}
    </div>
  );
}
