"use client";

import { useActionState, useState, useTransition } from "react";
import { Sparkles, Upload } from "lucide-react";

import { importRatesAction, loadSimulatedExampleAction, saveOtaSettingsAction } from "@/app/actions/rates";
import { idle } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/input";

/** Fills the table with clearly labelled example rates (and example competitors) until real rates are connected. */
export function LoadExampleButton({ label = "Load simulated example" }: { label?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; message?: string } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(await loadSimulatedExampleAction());
          })
        }
      >
        <Sparkles className="size-4" aria-hidden />
        {pending ? "Loading…" : label}
      </Button>
      {msg?.error && (
        <p role="alert" className="text-[13px] text-red">
          {msg.error}
        </p>
      )}
    </div>
  );
}

export function RatesUpload() {
  const [state, action, pending] = useActionState(importRatesAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-2xl border border-hairline bg-surface p-4" noValidate>
      <p className="text-[13.5px]">
        Upload your own rates, or rates you looked up by hand. Columns: <span className="font-semibold">Date, Channel, Price</span>, and optionally Member price. Use Direct, a booking site name, or a competitor&apos;s name as the channel.
      </p>
      <input
        name="file"
        type="file"
        accept=".csv,text/csv,.txt"
        required
        aria-label="Rates CSV file"
        className="block w-full text-[14px] file:mr-3 file:rounded-lg file:border-0 file:bg-teal-soft file:px-3.5 file:py-2 file:text-[13px] file:font-semibold file:text-teal"
      />
      <FormMessage {...state} />
      <Button type="submit" disabled={pending}>
        <Upload className="size-4" aria-hidden />
        {pending ? "Importing…" : "Upload rates"}
      </Button>
    </form>
  );
}

export type OtaFeeRow = { id: string; name: string; commissionPct: string; memberPct: string; defaultCommissionPct: string; defaultMemberPct: string };

/** Commission and member discount per booking site. These drive every "you keep" figure. */
export function OtaFeesForm({ rows }: { rows: OtaFeeRow[] }) {
  const [state, action, pending] = useActionState(saveOtaSettingsAction, idle);
  if (rows.length === 0) return <p className="text-[13.5px] text-muted">Add the booking sites you use in More &gt; Property to set their fees.</p>;
  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-4" noValidate>
      <p className="text-[13px] text-muted">Public sources put commission near 15%, but yours may differ. Leave a field empty to use the standard.</p>
      {rows.map((r) => (
        <fieldset key={r.id} className="grid grid-cols-2 gap-3">
          <legend className="mb-2 text-[14px] font-semibold">{r.name}</legend>
          <Field label="Commission" name={`commission_${r.id}`} error={state.fieldErrors?.[`commission_${r.id}`]}>
            <div className="relative">
              <Input id={`commission_${r.id}`} name={`commission_${r.id}`} inputMode="decimal" placeholder={r.defaultCommissionPct} defaultValue={state.values?.[`commission_${r.id}`] ?? r.commissionPct} className="pr-8" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">%</span>
            </div>
          </Field>
          <Field label="Member discount" name={`member_${r.id}`} error={state.fieldErrors?.[`member_${r.id}`]}>
            <div className="relative">
              <Input id={`member_${r.id}`} name={`member_${r.id}`} inputMode="decimal" placeholder={r.defaultMemberPct || "None"} defaultValue={state.values?.[`member_${r.id}`] ?? r.memberPct} className="pr-8" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">%</span>
            </div>
          </Field>
        </fieldset>
      ))}
      <FormMessage {...state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save fees"}
      </Button>
    </form>
  );
}
