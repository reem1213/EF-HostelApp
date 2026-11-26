import { describe, expect, it } from "vitest";

import { readProfileForm } from "./profile-form";

const form = (entries: [string, string][]) => {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
};

describe("readProfileForm", () => {
  it("reads OTAs, website, socials, address and reply-to", () => {
    const r = readProfileForm(
      form([
        ["otas", "booking_com"],
        ["otas", "hostelworld"],
        ["website", "myhostel.com"],
        ["social_instagram", "instagram.com/myhostel"],
        ["postalAddress", "  12 Main St, Chicago IL  "],
        ["replyToEmail", "Hello@MyHostel.com"],
      ]),
    );
    expect(r).toEqual({
      ok: true,
      value: {
        otas: ["booking_com", "hostelworld"],
        website: "https://myhostel.com/",
        socials: { instagram: "https://instagram.com/myhostel" },
        postalAddress: "12 Main St, Chicago IL",
        replyToEmail: "hello@myhostel.com",
      },
    });
  });

  it("everything is optional", () => {
    expect(readProfileForm(form([]))).toEqual({ ok: true, value: { otas: [], website: null, socials: {}, postalAddress: "", replyToEmail: "" } });
  });

  it("ignores unknown OTAs and duplicates", () => {
    const r = readProfileForm(form([["otas", "booking_com"], ["otas", "booking_com"], ["otas", "<script>"]]));
    expect(r.ok && r.value.otas).toEqual(["booking_com"]);
  });

  it("reports each bad field under its own name", () => {
    const r = readProfileForm(form([["website", "http://nope.com"], ["social_instagram", "https://facebook.com/x"], ["replyToEmail", "not-an-email"], ["postalAddress", "x".repeat(301)]]));
    expect(r.ok).toBe(false);
    expect(r.ok === false && Object.keys(r.errors).sort()).toEqual(["postalAddress", "replyToEmail", "social_instagram", "website"]);
  });
});
