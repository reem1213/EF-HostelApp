"use client";

import { useActionState } from "react";

import { updateProfile } from "@/app/actions/property";
import { idle } from "@/app/actions/types";
import { ProfileFields, type ProfileDefaults } from "@/components/profile-fields";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/input";

/** Edit the profile fields after onboarding (More > Property). */
export function ProfileForm({ defaults }: { defaults: ProfileDefaults }) {
  const [state, action, pending] = useActionState(updateProfile, idle);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-4" noValidate>
      <ProfileFields defaults={defaults} values={state.values} errors={state.fieldErrors} />
      <FormMessage {...state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
