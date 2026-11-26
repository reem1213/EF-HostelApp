"use client";

import { useActionState, useTransition } from "react";
import { UserMinus, X } from "lucide-react";

import { inviteMember, removeMember, revokeInvite } from "@/app/actions/team";
import { idle } from "@/app/actions/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/input";

type Props = {
  members: { userId: string; email: string; role: "owner" | "manager" }[];
  invites: string[];
  plan: "free" | "team";
  seats: number;
  isOwner: boolean;
  meId: string;
};

/** Who can use this hostel's account. Free plan: 1 seat. Team plan: 3. */
export function TeamPanel({ members, invites, plan, seats, isOwner, meId }: Props) {
  const [state, action, pending] = useActionState(inviteMember, idle);
  const [busy, start] = useTransition();
  const used = members.length + invites.length;

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted">
          Seats used <strong className="text-ink">{used} of {seats}</strong>
        </p>
        <Badge tone={plan === "team" ? "good" : "neutral"}>{plan === "team" ? "Team plan" : "Free plan"}</Badge>
      </div>

      <ul className="mt-3 divide-y divide-hairline">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[14px]">{m.email || "You"}{m.userId === meId && " (you)"}</span>
            <Badge tone={m.role === "owner" ? "good" : "neutral"}>{m.role}</Badge>
            {isOwner && m.role !== "owner" && (
              <Button variant="ghost" size="sm" aria-label={`Remove ${m.email}`} disabled={busy} onClick={() => start(async () => void (await removeMember(m.userId)))}>
                <UserMinus className="size-4" aria-hidden />
              </Button>
            )}
          </li>
        ))}
        {invites.map((email) => (
          <li key={email} className="flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[14px] text-muted">{email}</span>
            <Badge tone="medium">invited</Badge>
            {isOwner && (
              <Button variant="ghost" size="sm" aria-label={`Cancel invite for ${email}`} disabled={busy} onClick={() => start(async () => void (await revokeInvite(email)))}>
                <X className="size-4" aria-hidden />
              </Button>
            )}
          </li>
        ))}
      </ul>

      {isOwner && used < seats && (
        <form action={action} className="mt-3 flex flex-col gap-3 border-t border-hairline pt-3" noValidate>
          <Field label="Invite by email" name="invite-email" error={state.fieldErrors?.email} help="They join when they sign up or sign in with this email.">
            <Input id="invite-email" name="email" type="email" autoComplete="off" defaultValue={state.values?.email} />
          </Field>
          <FormMessage {...state} />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Inviting…" : "Send invite"}
          </Button>
        </form>
      )}
      {isOwner && used >= seats && (
        <p className="mt-3 border-t border-hairline pt-3 text-[13px] text-muted">
          {plan === "free" ? "Upgrade to the team plan to add up to 3 people." : "All seats are in use. Remove someone to invite another person."}
        </p>
      )}
    </div>
  );
}
