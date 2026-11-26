"use client";

import { useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";

import { advanceTicketAction, draftTicketsAction } from "@/app/actions/tickets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL, type TicketStatus } from "@/lib/domain/tickets";

export type TicketView = { otaId: string; otaName: string; status: TicketStatus; subject: string; body: string; hint: string; dates: string };

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={() => navigator.clipboard?.writeText(text).then(() => setDone(true), () => {})}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-semibold text-teal outline-offset-2 focus-visible:outline-2 focus-visible:outline-teal"
    >
      {done ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

const ACTION_LABEL: Record<TicketStatus, string | null> = { draft: "Mark as submitted", submitted: "Mark as answered", answered: null };

/** One request to one booking site: the text to send, where to send it, and its progress. */
export function TicketCard({ t }: { t: TicketView }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const label = ACTION_LABEL[t.status];
  return (
    <article className="rounded-2xl border border-hairline bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-semibold">{t.otaName}</h3>
        <Badge tone={t.status === "answered" ? "good" : t.status === "submitted" ? "medium" : "neutral"}>{STATUS_LABEL[t.status]}</Badge>
      </div>
      <p className="mt-0.5 text-[12px] text-muted">{t.dates}</p>

      <div className="mt-3 rounded-xl bg-bg p-3">
        <div className="flex items-center justify-between">
          <p className="text-[12.5px] font-semibold text-muted">Subject</p>
          <CopyButton text={t.subject} label="subject" />
        </div>
        <p className="mt-0.5 text-[13.5px]">{t.subject}</p>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[12.5px] font-semibold text-muted">Message</p>
          <CopyButton text={t.body} label="message" />
        </div>
        <p className="mt-0.5 whitespace-pre-line text-[13.5px]">{t.body}</p>
      </div>

      <p className="mt-3 text-[13px]">
        <span className="font-semibold">Where to send it.</span> {t.hint}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-red">
          {error}
        </p>
      )}
      {label && (
        <Button
          className="mt-3"
          variant={t.status === "draft" ? "default" : "outline"}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await advanceTicketAction(t.otaId);
              setError(r.error ?? null);
            })
          }
        >
          {pending ? "Saving…" : label}
        </Button>
      )}
    </article>
  );
}

/** Choose which booking sites to write to. Existing requests are not duplicated. */
export function TicketPicker({ options }: { options: { id: string; name: string }[] }) {
  const [chosen, setChosen] = useState<string[]>(options.map((o) => o.id));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (options.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-hairline bg-surface p-4">
      <fieldset>
        <legend className="text-[14px] font-semibold">Which booking sites should we write to?</legend>
        <ul className="mt-2 flex flex-col gap-1">
          {options.map((o) => (
            <li key={o.id}>
              <label className="flex items-center gap-2.5 py-1.5 text-[14px]">
                <input
                  type="checkbox"
                  checked={chosen.includes(o.id)}
                  onChange={(e) => setChosen((c) => (e.target.checked ? [...c, o.id] : c.filter((x) => x !== o.id)))}
                  className="size-4 accent-[#1f5e5a]"
                />
                {o.name}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-[13px] ${msg.ok ? "text-green" : "text-red"}`}>
          {msg.text}
        </p>
      )}
      <Button
        disabled={pending || chosen.length === 0}
        onClick={() =>
          start(async () => {
            const r = await draftTicketsAction(chosen);
            setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.message ?? "Done." });
          })
        }
      >
        {pending ? "Writing…" : "Write the requests"}
      </Button>
    </div>
  );
}
