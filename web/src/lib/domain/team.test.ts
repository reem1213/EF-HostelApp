import { describe, expect, it } from "vitest";

import { canInvite, maxSeats } from "./team";

describe("seats", () => {
  it("free plan has 1 seat and team plan has 3", () => {
    expect(maxSeats("free")).toBe(1);
    expect(maxSeats("team")).toBe(3);
  });
});

describe("canInvite", () => {
  const base = { plan: "team" as const, memberEmails: ["owner@x.com", "b@x.com"], pendingEmails: [] as string[], email: "new@x.com" };

  it("blocks inviting on the free plan once the owner holds the only seat", () => {
    expect(canInvite({ ...base, plan: "free", memberEmails: ["owner@x.com"] })).toEqual({ ok: false, reason: "seat_limit" });
  });

  it("allows the third seat on the team plan", () => {
    expect(canInvite(base)).toEqual({ ok: true });
  });

  it("counts pending invites against the seat limit", () => {
    expect(canInvite({ ...base, pendingEmails: ["c@x.com"] })).toEqual({ ok: false, reason: "seat_limit" });
  });

  it("blocks a fourth person on the team plan", () => {
    expect(canInvite({ ...base, memberEmails: ["a@x.com", "b@x.com", "c@x.com"] })).toEqual({ ok: false, reason: "seat_limit" });
  });

  it("rejects an existing member regardless of case, including yourself", () => {
    expect(canInvite({ ...base, email: "OWNER@x.com" })).toEqual({ ok: false, reason: "already_member" });
  });

  it("rejects someone already invited, regardless of case", () => {
    expect(canInvite({ ...base, memberEmails: ["owner@x.com"], pendingEmails: ["Pending@x.com"], email: "pending@X.com" })).toEqual({ ok: false, reason: "already_invited" });
  });

  it("rejects text that is not an email address", () => {
    expect(canInvite({ ...base, email: "nope" })).toEqual({ ok: false, reason: "invalid_email" });
    expect(canInvite({ ...base, email: "" })).toEqual({ ok: false, reason: "invalid_email" });
  });
});
