/** Team access: how many people can use one hostel's account. Billing comes later; the plan is a flag for now. */

export type Plan = "free" | "team";

export const maxSeats = (plan: Plan): number => (plan === "team" ? 3 : 1);

export type InviteCheck =
  | { ok: true }
  | { ok: false; reason: "seat_limit" | "already_member" | "already_invited" | "invalid_email" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Members and pending invites together may not exceed the plan's seats. */
export function canInvite(a: { plan: Plan; memberEmails: string[]; pendingEmails: string[]; email: string }): InviteCheck {
  const email = a.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, reason: "invalid_email" };
  if (a.memberEmails.some((m) => m.toLowerCase() === email)) return { ok: false, reason: "already_member" };
  if (a.pendingEmails.some((p) => p.toLowerCase() === email)) return { ok: false, reason: "already_invited" };
  if (a.memberEmails.length + a.pendingEmails.length >= maxSeats(a.plan)) return { ok: false, reason: "seat_limit" };
  return { ok: true };
}
