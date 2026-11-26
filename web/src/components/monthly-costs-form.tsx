"use client";

import { useActionState } from "react";

import { saveCosts } from "@/app/actions/property";
import { idle } from "@/app/actions/types";
import { CostFields } from "@/components/cost-fields";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/input";
import type { CostInputs } from "@/lib/domain/costs";

/** The monthly costs form. Saving recalculates cost per bed everywhere. */
export function MonthlyCostsForm({ month, inputs }: { month: string; inputs: CostInputs | null }) {
  const [state, action, pending] = useActionState(saveCosts, idle);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-4" noValidate>
      <input type="hidden" name="month" value={month} />
      <CostFields
        errors={state.fieldErrors}
        values={state.values}
        defaults={
          inputs
            ? { rent: inputs.rentCents, utilities: inputs.utilitiesCents, staff: inputs.staffCents, laundry: inputs.laundryCents, breakfast: inputs.breakfastCents }
            : undefined
        }
      />
      <FormMessage {...state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save monthly costs"}
      </Button>
    </form>
  );
}
