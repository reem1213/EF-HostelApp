"use client";

import { useActionState, useRef, useTransition } from "react";
import { Plus, X } from "lucide-react";

import { addCompetitorAction, removeCompetitorAction } from "@/app/actions/rates";
import { idle } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/input";

/** The hostels you compare against, up to 8. Prices for them come from an upload or the labelled example. */
export function CompSet({ competitors }: { competitors: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(addCompetitorAction, idle);
  const [removing, startRemove] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-hairline bg-surface p-4">
      {competitors.length === 0 ? (
        <p className="text-[13.5px] text-muted">No competitors yet. Add the hostels guests compare you with.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {competitors.map((c) => (
            <li key={c.id} className="inline-flex items-center gap-1 rounded-full bg-bg py-1 pl-3 pr-1.5 text-[13.5px]">
              {c.name}
              <button
                type="button"
                aria-label={`Remove ${c.name}`}
                disabled={removing}
                onClick={() => startRemove(async () => void (await removeCompetitorAction(c.id)))}
                className="rounded-full p-1 text-muted outline-offset-2 hover:bg-hairline hover:text-ink focus-visible:outline-2 focus-visible:outline-teal"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {competitors.length < 8 ? (
        <form ref={formRef} action={action} noValidate className="flex flex-col gap-2">
          <Field label="Add a competitor" name="name" error={state.fieldErrors?.name} help={`${competitors.length} of 8 used.`}>
            <div className="flex gap-2">
              <Input id="name" name="name" placeholder="For example, Freehand Chicago" defaultValue={state.values?.name ?? ""} maxLength={80} />
              <Button type="submit" disabled={pending} aria-label="Add competitor">
                <Plus className="size-4" aria-hidden />
                Add
              </Button>
            </div>
          </Field>
          <FormMessage {...state} />
        </form>
      ) : (
        <p className="text-[13px] text-muted">You are comparing against 8 hostels, the most we show. Remove one to add another.</p>
      )}
    </div>
  );
}
