"use client";

import { useState, useTransition } from "react";
import { Check, Undo2, X } from "lucide-react";

import { approveRunAction, rejectRunAction, undoRunAction } from "@/app/actions/automation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type RunView = {
  id: string;
  title: string;
  status: "proposed" | "approved" | "applied" | "failed" | "undone" | "rejected";
  simulated: boolean;
  reversible: boolean;
  error: string | null;
  lines: string[];
  when: string;
  byYou: boolean;
};

const STATUS_LABEL: Record<RunView["status"], string> = {
  proposed: "Needs approval",
  approved: "Working",
  applied: "Done",
  failed: "Failed",
  undone: "Undone",
  rejected: "Dismissed",
};

/** One automated change. Waiting ones can be approved or dismissed; done ones can be undone. */
export function RunCard({ run }: { run: RunView }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const act = (fn: (id: string) => Promise<{ error?: string; message?: string }>) =>
    start(async () => {
      setError(null);
      setNote(null);
      const res = await fn(run.id);
      if (res.error) setError(res.error);
      else if (res.message) setNote(res.message);
    });

  return (
    <article className="rounded-2xl border border-hairline bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-semibold leading-snug">{run.title}</h3>
        <Badge tone={run.status === "failed" ? "high" : run.status === "proposed" ? "medium" : run.status === "applied" ? "good" : "neutral"}>{STATUS_LABEL[run.status]}</Badge>
      </div>
      {run.lines.length > 0 && (
        <p className="mt-1.5 text-[13.5px]">
          {run.lines.map((l, i) => (
            <span key={l} className={i === 0 ? "block text-muted" : "block font-semibold tabular-nums"}>
              {l}
            </span>
          ))}
        </p>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
        <span>{run.when}</span>
        <span>{run.byYou ? "Proposed by you" : "Proposed by a teammate"}</span>
        {run.simulated && run.status === "applied" && <Badge tone="neutral">Simulated: not sent to your PMS</Badge>}
      </p>
      {run.error && <p className="mt-2 text-[13px] text-red">{run.error}</p>}
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-red">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="mt-2 text-[13px] text-green">
          {note}
        </p>
      )}

      {run.status === "proposed" && (
        <div className="mt-3 flex gap-3">
          <Button className="flex-1" disabled={pending} onClick={() => act(approveRunAction)}>
            <Check className="size-4" aria-hidden />
            {pending ? "Working…" : "Approve and apply"}
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => act(rejectRunAction)}>
            <X className="size-4" aria-hidden />
            Dismiss
          </Button>
        </div>
      )}
      {run.status === "applied" && run.reversible && (
        <Button variant="outline" size="sm" className="mt-3" disabled={pending} onClick={() => act(undoRunAction)}>
          <Undo2 className="size-4" aria-hidden />
          Undo
        </Button>
      )}
    </article>
  );
}
