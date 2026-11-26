import { describe, expect, it } from "vitest";

import { draftBrandBiddingRequest, nextStatus, OTA_SUPPORT_HINTS } from "./tickets";

describe("draftBrandBiddingRequest", () => {
  const a = { otaName: "Booking.com", hostelName: "Roam Quarter Hostel", website: "https://roam.example/", contactEmail: "hello@roam.example" };

  it("names the hostel and the booking site, and asks them to stop bidding on the hostel's own name", () => {
    const { subject, body } = draftBrandBiddingRequest(a);
    expect(subject).toMatch(/Roam Quarter Hostel/);
    expect(body).toMatch(/Booking\.com/);
    expect(body).toMatch(/Roam Quarter Hostel/);
    expect(body).toMatch(/stop bidding/i);
    expect(body).toMatch(/brand/i);
  });

  it("includes the website and contact email, with no placeholder braces", () => {
    const { subject, body } = draftBrandBiddingRequest(a);
    expect(body).toContain("https://roam.example/");
    expect(body).toContain("hello@roam.example");
    expect(subject + body).not.toMatch(/[{}\[\]]|undefined|null/);
  });

  it("copes with no website or contact email without leaving gaps", () => {
    const { body } = draftBrandBiddingRequest({ ...a, website: null, contactEmail: "" });
    expect(body).not.toMatch(/undefined|null|Website:\s*$|Contact:\s*$|\n\n\n/);
  });

  it("does not claim facts it was not given", () => {
    const { body } = draftBrandBiddingRequest(a);
    expect(body).not.toMatch(/\d+%|\$\d/);
  });
});

describe("nextStatus", () => {
  it("moves draft to submitted to answered, then stops", () => {
    expect(nextStatus("draft")).toBe("submitted");
    expect(nextStatus("submitted")).toBe("answered");
    expect(nextStatus("answered")).toBeNull();
  });
});

describe("OTA_SUPPORT_HINTS", () => {
  it("has guidance for the main booking sites and a general fallback", () => {
    for (const id of ["booking_com", "hostelworld", "expedia", "other"]) expect(OTA_SUPPORT_HINTS[id]?.length).toBeGreaterThan(20);
  });
});
