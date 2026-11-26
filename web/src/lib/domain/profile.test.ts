import { describe, expect, it } from "vitest";

import { KNOWN_OTAS, resolveOta } from "./ota";
import { OTA_OPTIONS, parseSocials, parseWebsite } from "./profile";

describe("parseWebsite", () => {
  it("adds https to a bare domain and normalises it", () => {
    expect(parseWebsite("example.com")).toEqual({ ok: true, url: "https://example.com/" });
    expect(parseWebsite("  https://www.hostel.org/book?x=1 ")).toEqual({ ok: true, url: "https://www.hostel.org/book?x=1" });
  });

  it("treats empty as 'no website yet'", () => {
    expect(parseWebsite("")).toEqual({ ok: true, url: "" });
    expect(parseWebsite("   ")).toEqual({ ok: true, url: "" });
  });

  it("refuses plain http, other schemes, and ports", () => {
    for (const bad of ["http://example.com", "javascript:alert(1)", "ftp://example.com", "data:text/html,hi", "example.com:8080"]) {
      expect(parseWebsite(bad).ok, bad).toBe(false);
    }
  });

  it("refuses local and private addresses and single-label hosts", () => {
    for (const bad of ["https://localhost", "https://10.0.0.1", "https://192.168.1.5", "https://127.0.0.1", "https://[::1]", "https://nodot", "https://printer.local", "https://db.internal"]) {
      expect(parseWebsite(bad).ok, bad).toBe(false);
    }
  });

  it("refuses text that is not a web address", () => {
    expect(parseWebsite("not a url").ok).toBe(false);
    expect(parseWebsite("https://").ok).toBe(false);
  });
});

describe("parseSocials", () => {
  it("normalises each link and keeps only filled ones", () => {
    const r = parseSocials({ instagram: "instagram.com/roamquarter", facebook: "", tiktok: "https://www.tiktok.com/@roam" });
    expect(r.errors).toEqual({});
    expect(r.socials).toEqual({ instagram: "https://instagram.com/roamquarter", tiktok: "https://www.tiktok.com/@roam" });
  });

  it("rejects a link on the wrong site for the platform", () => {
    const r = parseSocials({ instagram: "https://facebook.com/x", youtube: "https://youtu.be/abc" });
    expect(Object.keys(r.errors)).toEqual(["instagram"]);
    expect(r.socials.youtube).toBe("https://youtu.be/abc");
  });

  it("rejects lookalike hosts", () => {
    expect(parseSocials({ instagram: "https://instagram.com.evil.io/x" }).errors.instagram).toBeTruthy();
    expect(parseSocials({ instagram: "https://notinstagram.com/x" }).errors.instagram).toBeTruthy();
  });
});

describe("OTAs", () => {
  it("offers the OTAs the owner listed", () => {
    expect(OTA_OPTIONS.map((o) => o.id)).toEqual(["booking_com", "hostelworld", "expedia", "airbnb", "agoda", "trip_com", "hotels_com", "other"]);
  });

  it("Booking.com defaults to 15% commission and a 10% Genius member discount", () => {
    expect(resolveOta("booking_com")).toMatchObject({ defaultCommission: 0.15, memberDiscount: 0.1, memberLabel: "Genius" });
    expect(KNOWN_OTAS.hostelworld.memberDiscount).toBeNull();
  });

  it("per-hostel overrides win, and an override can add a member discount", () => {
    expect(resolveOta("booking_com", { booking_com: { commission: 0.12 } }).defaultCommission).toBe(0.12);
    expect(resolveOta("hostelworld", { hostelworld: { memberDiscount: 0.05 } })).toMatchObject({ memberDiscount: 0.05, memberLabel: "Member price" });
  });

  it("an unknown OTA still gets safe defaults", () => {
    expect(resolveOta("mystery")).toMatchObject({ id: "mystery", defaultCommission: 0.15, memberDiscount: null });
  });
});
