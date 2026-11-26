"use client";

import Link from "next/link";
import { useActionState } from "react";
import { TriangleAlert } from "lucide-react";

import { setBedCount } from "@/app/actions/property";
import { idle } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/input";

export type CapacityInfo = { peak: number; peakDate: string; nightsOver: number; beds: number };

/** Shown when uploaded bookings need more beds than the hostel declared. Never blocks anything. */
export function CapacityWarning({ info }: { info: CapacityInfo }) {
  const [state, action, pending] = useActionState(setBedCount, idle);
  if (state.ok) return <FormMessage {...state} />;
  return (
    <div role="alert" className="rounded-2xl border border-amber/40 bg-amber/10 p-4">
      <div className="flex gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber" aria-hidden />
        <div className="min-w-0">
          <p className="text-[14.5px] font-semibold">Your bookings need more beds than you have</p>
          <p className="mt-1 text-[13px] leading-snug">
            On {info.peakDate} there are {info.peak} guests booked but you told us you have {info.beds} beds
            {info.nightsOver > 1 ? ` (${info.nightsOver} nights are over)` : ""}. Either your bed count is too low, or the file has duplicates or reservations that cover several beds.
          </p>
        </div>
      </div>
      <FormMessage {...state} />
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <form action={action} className="flex-1">
          <input type="hidden" name="beds" value={info.peak} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : `Set my beds to ${info.peak}`}
          </Button>
        </form>
        <Link href="/connections#import" className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-hairline bg-surface px-5 text-sm font-semibold">
          Review the file
        </Link>
      </div>
    </div>
  );
}
