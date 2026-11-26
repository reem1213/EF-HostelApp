"use client";

import { useActionState } from "react";

import { saveGuardrailsAction } from "@/app/actions/automation";
import { idle } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/input";
import type { Guardrails } from "@/lib/domain/guardrails";

/** The limits every automatic price change must respect. Owner only. */
export function GuardrailsForm({ guardrails, floorLabel, isOwner }: { guardrails: Guardrails; floorLabel: string; isOwner: boolean }) {
  const [state, action, pending] = useActionState(saveGuardrailsAction, idle);
  const e = state.fieldErrors;
  const v = state.values;
  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-4" noValidate>
      <p className="text-[13px] text-muted">
        Automatic price changes never go below your floor ({floorLabel} a bed per night right now), above your ceiling, or by more than your daily limit.
      </p>
      <Field label="Minimum margin over cost" name="marginPct" error={e?.marginPct} help="The floor is your cost per bed plus this.">
        <div className="relative">
          <Input id="marginPct" name="marginPct" inputMode="decimal" defaultValue={v?.marginPct ?? String(Math.round(guardrails.minMarginPct * 100))} disabled={!isOwner} className="pr-8" />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">%</span>
        </div>
      </Field>
      <Field label="Largest change to one night" name="maxChangePct" error={e?.maxChangePct} help="Per night, per day, compared with its current price.">
        <div className="relative">
          <Input id="maxChangePct" name="maxChangePct" inputMode="decimal" defaultValue={v?.maxChangePct ?? String(Math.round(guardrails.maxChangePctPerDay * 100))} disabled={!isOwner} className="pr-8" />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">%</span>
        </div>
      </Field>
      <Field label="Highest price per bed" name="ceiling" error={e?.ceiling} help="Leave blank to allow up to double the current price.">
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
          <Input id="ceiling" name="ceiling" inputMode="decimal" placeholder="No fixed ceiling" defaultValue={v?.ceiling ?? (guardrails.ceilingCents ? (guardrails.ceilingCents / 100).toString() : "")} disabled={!isOwner} className="pl-7" />
        </div>
      </Field>
      <FormMessage {...state} />
      {isOwner ? (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save limits"}
        </Button>
      ) : (
        <p className="text-[12.5px] text-muted">Only the owner can change these limits.</p>
      )}
    </form>
  );
}
