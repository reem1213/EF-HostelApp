"use client";

import { useActionState } from "react";

import { changePassword } from "@/app/actions/property";
import { idle } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/input";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, idle);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <Field label="New password" name="password" error={state.fieldErrors?.password} help="At least 10 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" />
      </Field>
      <FormMessage {...state} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
