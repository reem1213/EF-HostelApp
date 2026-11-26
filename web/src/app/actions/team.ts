"use server";

import { revalidatePath } from "next/cache";

import { canInvite, maxSeats } from "@/lib/domain/team";
import { echo } from "@/lib/forms";
import { requireProperty } from "@/lib/session";
import { safely } from "./safe";
import type { ActionState } from "./types";

const REASONS = {
  invalid_email: "Enter a valid email address.",
  already_member: "That person is already on your team.",
  already_invited: "That person is already invited.",
} as const;

async function ownerContext() {
  const ctx = await requireProperty();
  const members = await ctx.store.listMembers(ctx.property.id);
  const isOwner = members.some((m) => m.userId === ctx.user.id && m.role === "owner");
  return { ...ctx, members, isOwner };
}

async function inviteMemberImpl(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store, property, user, members, isOwner } = await ownerContext();
  if (!isOwner) return { error: "Only the owner can invite people." };

  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const pending = await store.listInvites(property.id);
  const check = canInvite({ plan: property.plan, memberEmails: members.map((m) => m.email), pendingEmails: pending, email });
  if (!check.ok) {
    const message =
      check.reason === "seat_limit"
        ? property.plan === "free"
          ? "Your plan has 1 seat. Upgrade to the team plan to add people."
          : `All ${maxSeats(property.plan)} seats are used.`
        : REASONS[check.reason];
    return { fieldErrors: { email: message }, values: echo(fd, ["email"]) };
  }

  await store.invite(property.id, email, user.id);
  revalidatePath("/", "layout");
  return { ok: true, message: "Invite saved. They join when they sign up or sign in with this email." };
}

async function removeMemberImpl(userId: string): Promise<ActionState> {
  const { store, property, user, members, isOwner } = await ownerContext();
  if (!isOwner) return { error: "Only the owner can remove people." };
  const target = members.find((m) => m.userId === userId);
  if (!target || target.role === "owner" || userId === user.id) return { error: "That person cannot be removed." };
  await store.removeMember(property.id, userId);
  revalidatePath("/", "layout");
  return { ok: true };
}

async function revokeInviteImpl(email: string): Promise<ActionState> {
  const { store, property, isOwner } = await ownerContext();
  if (!isOwner) return { error: "Only the owner can cancel invites." };
  await store.revokeInvite(property.id, String(email).toLowerCase());
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function inviteMember(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safely("inviteMember", () => inviteMemberImpl(_prev, fd));
}
export async function removeMember(userId: string): Promise<ActionState> {
  return safely("removeMember", () => removeMemberImpl(userId));
}
export async function revokeInvite(email: string): Promise<ActionState> {
  return safely("revokeInvite", () => revokeInviteImpl(email));
}
