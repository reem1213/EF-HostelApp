"use client";

import { useActionState } from "react";

import { saveReview } from "@/app/actions/property";
import { idle } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/input";

/** Monthly snapshot of Google rating, review count and search impressions. A Google connection will automate it later. */
export function ReviewForm({ month, defaults }: { month: string; defaults?: { rating: number; reviewCount: number; impressions: number | null } }) {
  const [state, action, pending] = useActionState(saveReview, idle);
  const e = state.fieldErrors;
  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-4" noValidate>
      <input type="hidden" name="month" value={month} />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Rating" name="rating" error={e?.rating}>
          <Input id="rating" name="rating" inputMode="decimal" placeholder="4.5" defaultValue={state.values?.rating ?? defaults?.rating ?? ""} />
        </Field>
        <Field label="Reviews" name="reviewCount" error={e?.reviewCount}>
          <Input id="reviewCount" name="reviewCount" inputMode="numeric" placeholder="120" defaultValue={state.values?.reviewCount ?? defaults?.reviewCount ?? ""} />
        </Field>
        <Field label="Searches" name="impressions" error={e?.impressions} help="Optional">
          <Input id="impressions" name="impressions" inputMode="numeric" placeholder="9000" defaultValue={state.values?.impressions ?? defaults?.impressions ?? ""} />
        </Field>
      </div>
      <FormMessage {...state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save this month"}
      </Button>
    </form>
  );
}
