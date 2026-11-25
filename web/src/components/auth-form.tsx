"use client";

import Link from "next/link";
import { useActionState } from "react";

import { requestPasswordReset, signIn, signUp } from "@/app/actions/auth";
import { idle } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/input";

export function AuthForm({ mode, demo, linkError }: { mode: "login" | "signup"; demo: boolean; linkError?: boolean }) {
  const [state, action, pending] = useActionState(mode === "login" ? signIn : signUp, idle);
  const [resetState, resetAction, resetPending] = useActionState(requestPasswordReset, idle);
  const login = mode === "login";

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-hairline bg-surface p-5">
        <h1 className="text-[20px] font-semibold">{login ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-1 text-[13px] text-muted">
          {login ? "Sign in to see what to fix next." : "Find the profit hiding in your hostel, and what to do about it."}
        </p>

        {linkError && <p className="mt-3 rounded-xl bg-red/10 px-3.5 py-2.5 text-[13px] text-red">That link has expired. Request a new one.</p>}

        <form action={action} className="mt-4 flex flex-col gap-4" noValidate>
          <Field label="Email" name="email" error={state.fieldErrors?.email}>
            <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
          </Field>
          <Field label="Password" name="password" error={state.fieldErrors?.password} help={login ? undefined : "At least 10 characters."}>
            <Input id="password" name="password" type="password" autoComplete={login ? "current-password" : "new-password"} required minLength={login ? undefined : 10} />
          </Field>
          <FormMessage {...state} />
          <Button type="submit" disabled={pending}>
            {pending ? "One moment…" : login ? "Sign in" : "Create account"}
          </Button>
        </form>

        <p className="mt-4 text-center text-[13px] text-muted">
          {login ? "New here? " : "Already have an account? "}
          <Link href={login ? "/signup" : "/login"} className="font-semibold text-teal">
            {login ? "Create an account" : "Sign in"}
          </Link>
        </p>
      </div>

      {login && !demo && (
        <details className="rounded-2xl border border-hairline bg-surface px-5 py-3 text-[13px]">
          <summary className="cursor-pointer font-medium">Forgot your password?</summary>
          <form action={resetAction} className="mt-3 flex flex-col gap-3" noValidate>
            <Field label="Email" name="reset-email" error={resetState.fieldErrors?.email}>
              <Input id="reset-email" name="email" type="email" autoComplete="email" required />
            </Field>
            <FormMessage {...resetState} />
            <Button type="submit" variant="outline" disabled={resetPending}>
              Send reset link
            </Button>
          </form>
        </details>
      )}

      {demo && (
        <div className="rounded-2xl border border-dashed border-hairline p-4 text-[13px] text-muted">
          <p>
            <strong className="text-ink">Demo mode.</strong> Accounts are not connected on this deployment, so the app opens with a sample hostel.
          </p>
          <Link href="/" className="mt-2 inline-block font-semibold text-teal">
            Open the demo →
          </Link>
        </div>
      )}
    </div>
  );
}
