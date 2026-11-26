"use client";

import { useState, useTransition } from "react";
import { Lightbulb } from "lucide-react";
import Link from "next/link";

import { proposeRateChangeAction } from "@/app/actions/rates";
import { quietReasonsAction } from "@/app/actions/quiet";
import { Button } from "@/components/ui/button";

export type QuietView = {
  date: string;
  label: string;
  occupancyPct: number;
  usualPct: number;
  /** Direct price now and the suggested one, or null when no rate is loaded for the night. */
  current: string | null;
  /** True when the current price is a simulated example. */
  simulated: boolean;
  suggested: string | null;
  suggestedRaw: string | null;
};

/** The emptiest upcoming nights, why they might be quiet (always "possible"), and a one-tap lower price. */
export function QuietNights({ nights }: { nights: QuietView[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {nights.map((n) => (
        <QuietRow key={n.date} night={n} />
      ))}
    </ul>
  );
}

function QuietRow({ night }: { night: QuietView }) {
  const [reasons, setReasons] = useState<string[] | null>(null);
  const [note, setNote] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const why = () =>
    start(async () => {
      const r = await quietReasonsAction(night.date);
      if (r.reasons) setReasons(r.reasons);
      else setNote({ tone: "error", text: r.error ?? "Reasons are unavailable." });
    });
  const apply = () =>
    start(async () => {
      const r = await proposeRateChangeAction(night.date, "direct", night.suggestedRaw ?? "");
      setNote(r.error ? { tone: "error", text: r.error } : { tone: "ok", text: r.message ?? "Proposed." });
    });

  return (
    <li className="rounded-2xl border border-hairline bg-surface p-4">
      <p className="text-[15px] font-semibold">{night.label}</p>
      <p className="mt-0.5 text-[13px] text-muted">
        {night.occupancyPct}% booked, usually {night.usualPct}%
      </p>

      {night.suggested && night.current ? (
        <p className="mt-2 text-[14px]">
          Suggested price: <strong className="tabular-nums">{night.suggested}</strong> <span className="text-muted">(now {night.current}{night.simulated ? ", simulated example" : ""})</span>
        </p>
      ) : night.current ? (
        <p className="mt-2 text-[13px] text-muted">Your price is {night.current}, already at your price floor, so no cut is suggested.</p>
      ) : (
        <p className="mt-2 text-[13px] text-muted">
          <Link href="/profit/direct/rates" className="font-semibold text-teal">
            Load nightly prices
          </Link>{" "}
          to get a suggested price for this night.
        </p>
      )}

      {reasons && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13.5px]">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {note && (
        <p role={note.tone === "error" ? "alert" : "status"} className={`mt-2 text-[13px] ${note.tone === "error" ? "text-red" : "text-green"}`}>
          {note.text}{" "}
          {note.tone === "ok" && (
            <Link href="/actions" className="font-semibold underline">
              Open Actions
            </Link>
          )}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {night.suggested && (
          <Button size="sm" disabled={pending} onClick={apply}>
            Apply {night.suggested}
          </Button>
        )}
        {!reasons && (
          <Button size="sm" variant="outline" disabled={pending} onClick={why}>
            <Lightbulb className="size-4" aria-hidden />
            Why might it be quiet?
          </Button>
        )}
      </div>
    </li>
  );
}
