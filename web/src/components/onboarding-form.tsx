"use client";

import { useActionState } from "react";

import { completeOnboarding } from "@/app/actions/property";
import { idle } from "@/app/actions/types";
import { CostFields } from "@/components/cost-fields";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/input";

export function OnboardingForm() {
  const [state, action, pending] = useActionState(completeOnboarding, idle);
  const e = state.fieldErrors;
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <div className="rounded-2xl border border-hairline bg-surface p-5">
        <h1 className="text-[20px] font-semibold">Tell us about your hostel</h1>
        <p className="mt-1 text-[13px] text-muted">Two minutes. You can change everything later.</p>
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Hostel name" name="name" error={e?.name}>
            <Input id="name" name="name" autoComplete="organization" required maxLength={120} defaultValue={state.values?.name} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Number of beds" name="beds" error={e?.beds}>
              <Input id="beds" name="beds" type="number" inputMode="numeric" min={1} max={2000} required defaultValue={state.values?.beds} />
            </Field>
            <Field label="Country" name="country" error={e?.country} help="Sets how dates are read in uploads.">
              <Input id="country" name="country" autoComplete="country-name" placeholder="US" maxLength={60} defaultValue={state.values?.country} />
            </Field>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-hairline bg-surface p-5">
        <h2 className="text-[16px] font-semibold">Your monthly costs</h2>
        <p className="mb-4 mt-1 text-[13px] text-muted">These make up your cost per bed. Estimates are fine. Skip any you do not know.</p>
        <CostFields errors={e} values={state.values} />
      </div>

      <FormMessage {...state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Setting up…" : "Continue"}
      </Button>
    </form>
  );
}
