"use client";

import { useState, useTransition } from "react";
import { Pencil, X } from "lucide-react";

import { proposeRateChangeAction } from "@/app/actions/rates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CellView = { list: string; member: string | null; memberLabel: string | null; keep: string | null; simulated: boolean; editable: boolean; rawDollars: string } | null;
export type RowView = { date: string; label: string; flags: string[]; cells: Record<string, CellView> };
export type ColumnView = { key: string; label: string; kind: "direct" | "ota" | "competitor" };

const FLAG_COPY: Record<string, { text: string; tone: "high" | "medium" | "low" }> = {
  below_floor: { text: "Below your floor", tone: "high" },
  direct_above_ota: { text: "Direct costs more than a booking site", tone: "high" },
  above_comp: { text: "Well above competitors", tone: "medium" },
  below_comp: { text: "Well below competitors", tone: "medium" },
};

/** Nightly prices: one row per night, one column per channel. Direct and booking-site prices can be changed in place. */
export function RateTable({ columns, rows }: { columns: ColumnView[]; rows: RowView[] }) {
  const [editing, setEditing] = useState<{ date: string; channel: string } | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = (date: string, channel: string, raw: string) => {
    setEditing({ date, channel });
    setText(raw);
    setError(null);
    setNote(null);
  };
  const submit = () => {
    if (!editing) return;
    start(async () => {
      const res = await proposeRateChangeAction(editing.date, editing.channel, text);
      if (res.error) {
        setNote(null);
        setError(res.error);
      } else {
        setError(null);
        setNote(res.message ?? "Proposed.");
        setEditing(null);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {(error || note) && (
        <p role={error ? "alert" : "status"} className={cn("rounded-xl px-3.5 py-2.5 text-[13px]", error ? "bg-red/10 text-red" : "bg-teal-soft text-teal")}>
          {error ?? note}{" "}
          {note && (
            <a href="/actions" className="font-semibold underline">
              Open Actions
            </a>
          )}
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-hairline bg-surface" tabIndex={0} aria-label="Nightly prices, scroll sideways for more columns">
        <table className="w-full min-w-max border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-hairline text-left">
              <th scope="col" className="sticky left-0 z-10 bg-surface px-3 py-2.5 font-semibold">
                Night
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("whitespace-nowrap px-3 py-2.5 font-semibold", c.kind === "competitor" && "text-muted")}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date} className="border-b border-hairline last:border-0 align-top">
                <th scope="row" className="sticky left-0 z-10 min-w-[7.5rem] bg-surface px-3 py-2.5 text-left font-semibold">
                  <span className="block">{r.label}</span>
                  {r.flags.map((f) => (
                    <Badge key={f} tone={FLAG_COPY[f]?.tone ?? "low"} className="mt-1 block w-fit whitespace-normal text-left font-medium normal-case">
                      {FLAG_COPY[f]?.text ?? f}
                    </Badge>
                  ))}
                </th>
                {columns.map((c) => {
                  const cell = r.cells[c.key];
                  const isEditing = editing?.date === r.date && editing.channel === c.key;
                  return (
                    <td key={c.key} className={cn("px-3 py-2.5 tabular-nums", c.kind === "competitor" && "text-muted")}>
                      {!cell ? (
                        <span className="text-muted">—</span>
                      ) : isEditing ? (
                        <form
                          className="flex min-w-[8.5rem] flex-col gap-1.5"
                          onSubmit={(e) => {
                            e.preventDefault();
                            submit();
                          }}
                        >
                          <label className="sr-only" htmlFor={`price-${r.date}-${c.key}`}>
                            New price for {c.label} on {r.label}
                          </label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">$</span>
                            <Input id={`price-${r.date}-${c.key}`} autoFocus inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} className="h-9 pl-6 text-[14px]" />
                          </div>
                          <div className="flex gap-1.5">
                            <Button type="submit" size="sm" disabled={pending} className="flex-1">
                              {pending ? "Checking…" : "Propose"}
                            </Button>
                            <Button type="button" size="sm" variant="outline" aria-label="Cancel" onClick={() => setEditing(null)}>
                              <X className="size-4" aria-hidden />
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[15px] font-semibold">{cell.list}</span>
                            {cell.editable && (
                              <button
                                type="button"
                                aria-label={`Change ${c.label} price for ${r.label}`}
                                onClick={() => open(r.date, c.key, cell.rawDollars)}
                                className="rounded-md p-1 text-muted outline-offset-2 hover:bg-bg hover:text-ink focus-visible:outline-2 focus-visible:outline-teal"
                              >
                                <Pencil className="size-3.5" aria-hidden />
                              </button>
                            )}
                          </div>
                          {cell.member && (
                            <span className="block text-[12px]">
                              {cell.member} <span className="text-muted">{cell.memberLabel}</span>
                            </span>
                          )}
                          {cell.keep && <span className="block text-[12px] text-muted">you keep {cell.keep}</span>}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
