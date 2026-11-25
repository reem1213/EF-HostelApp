import { describe, expect, it } from "vitest";

import { costBreakdown, emptyCostInputs, materializeInputs } from "./costs";
import { nightsInWindow, pctChange, profitMetrics, type ProfitMetrics } from "./metrics";
import { profitActions, rankActions, reviewActions, setupActions } from "./next-steps";
import type { Booking, Expense } from "./types";
import {
  categorize,
  laborCostCents,
  MAX_IMPORT_BYTES,
  parseBankCsv,
  parseBookingsCsv,
  parseDate,
  parseExpensesCsv,
  parseScheduleCsv,
  parseUtilitiesCsv,
} from "./import/parsers";

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));
const exp = (category: Expense["category"], amountCents: number, id: string = category): Expense => ({
  id,
  category,
  amountCents,
  merchant: "Vendor",
  date: d(2026, 11, 1),
});

describe("costBreakdown", () => {
  const base = { ...emptyCostInputs("2026-11"), rentCents: 100_000, staffCents: 200_000, utilitiesCents: 50_000 };

  it("uses entered figures first, imported records next, and flags missing lines", () => {
    const r = costBreakdown({ inputs: base, expenses: [exp("laundry", 30_000)], occupiedBedNights: 1000 });
    const byLine = Object.fromEntries(r.lines.map((l) => [l.line, l]));
    expect(byLine.rent).toMatchObject({ totalCents: 100_000, source: "entered" });
    expect(byLine.laundry).toMatchObject({ totalCents: 30_000, source: "imported" });
    expect(byLine.breakfast).toMatchObject({ totalCents: 0, source: "missing" });
    expect(r.totalCents).toBe(380_000);
    expect(r.perBedNightCents).toBe(380);
    expect(r.missing).toEqual(["breakfast"]);
    expect(byLine.staff.share).toBeCloseTo(200_000 / 380_000, 9);
  });

  it("falls back to schedule labour for employees when nothing was entered", () => {
    const r = costBreakdown({
      inputs: { ...base, staffCents: 0 },
      expenses: [],
      scheduleLaborCents: 150_000,
      occupiedBedNights: 1000,
    });
    expect(r.lines.find((l) => l.line === "staff")).toMatchObject({ totalCents: 150_000, source: "schedule" });
  });

  it("returns zero per-bed cost, not NaN, when there are no occupied nights", () => {
    const r = costBreakdown({ inputs: base, expenses: [], occupiedBedNights: 0 });
    expect(r.perBedNightCents).toBe(0);
  });

  it("treats a missing inputs record as all lines missing", () => {
    const r = costBreakdown({ inputs: null, expenses: [], occupiedBedNights: 100 });
    expect(r.missing).toHaveLength(5);
  });
});

describe("materializeInputs", () => {
  it("replaces imported rows of an entered category so nothing is counted twice", () => {
    const inputs = { ...emptyCostInputs("2026-11"), laundryCents: 9_000 };
    const out = materializeInputs(inputs, [exp("laundry", 5_000, "a"), exp("supplies", 700, "b")], d(2026, 11, 1));
    const laundry = out.filter((e) => e.category === "laundry");
    expect(laundry).toHaveLength(1);
    expect(laundry[0].amountCents).toBe(9_000);
    expect(out.some((e) => e.id === "b")).toBe(true);
  });

  it("keeps imported rows when the category was not entered", () => {
    const out = materializeInputs(emptyCostInputs("2026-11"), [exp("laundry", 5_000)], d(2026, 11, 1));
    expect(out).toHaveLength(1);
  });
});

describe("profitMetrics", () => {
  const window = { start: d(2026, 11, 1), end: d(2026, 11, 11) }; // 10 days
  const b = (id: string, channel: Booking["channel"], checkIn: Date, nights: number, revenueCents: number, guestKey?: string): Booking => ({
    id,
    channel,
    checkIn,
    nights,
    revenueCents,
    guestKey,
  });
  const all = [
    b("A", "direct", d(2026, 10, 28), 5, 5_000, "a@x"), // only 1 night (Nov 1) falls in the window
    b("B", "ota", d(2026, 11, 2), 3, 3_000, "a@x"),
    b("C", "ota", d(2026, 11, 5), 2, 4_000, "b@x"),
    b("D", "direct", d(2026, 11, 9), 4, 4_000, "c@x"), // 2 of 4 nights in the window
  ];

  it("clips stays to the window", () => {
    expect(nightsInWindow(all[0], window)).toBe(1);
    expect(nightsInWindow(all[3], window)).toBe(2);
    expect(nightsInWindow(b("Z", "ota", d(2026, 12, 1), 2, 1), window)).toBe(0);
  });

  it("computes occupancy, revenue, ADR and channel shares from pro-rated stays", () => {
    const m = profitMetrics(all, window, 10);
    expect(m.occupiedBedNights).toBe(8); // 1 + 3 + 2 + 2
    expect(m.occupancyRate).toBeCloseTo(0.08, 9); // 8 / (10 beds x 10 days)
    expect(m.revenueCents).toBe(10_000); // 1000 + 3000 + 4000 + 2000
    expect(m.adrCents).toBe(1_250);
    expect(m.directShare).toBeCloseTo(0.3, 9);
    expect(m.otaShare).toBeCloseTo(0.7, 9);
    expect(m.bookingsCount).toBe(4);
    expect(m.avgStayRevenueCents).toBe(2_500);
  });

  it("measures returning guests against stays before the window", () => {
    const m = profitMetrics(all, window, 10);
    expect(m.uniqueGuests).toBe(3);
    expect(m.returningGuests).toBe(1); // a@x stayed in October
    expect(m.returningGuestShare).toBeCloseTo(1 / 3, 9);
  });

  it("reports null retention when bookings carry no guest identity", () => {
    const anon = all.map((x) => ({ ...x, guestKey: undefined }));
    expect(profitMetrics(anon, window, 10).returningGuestShare).toBeNull();
  });

  it("handles an empty window without dividing by zero", () => {
    const m = profitMetrics([], window, 10);
    expect(m.occupancyRate).toBe(0);
    expect(m.adrCents).toBe(0);
  });

  it("pctChange is null when there is no previous value", () => {
    expect(pctChange(120, 100)).toBeCloseTo(0.2, 9);
    expect(pctChange(5, 0)).toBeNull();
  });
});

describe("next steps", () => {
  const metrics = (p: Partial<ProfitMetrics>): ProfitMetrics => ({
    days: 30,
    bookingsCount: 50,
    occupiedBedNights: 150,
    occupancyRate: 0.5,
    revenueCents: 300_000,
    adrCents: 2_000,
    revPabCents: 1_000,
    directShare: 0.3,
    otaShare: 0.7,
    returningGuestShare: 0.1,
    uniqueGuests: 100,
    returningGuests: 10,
    avgStayRevenueCents: 5_000,
    ...p,
  });

  it("estimates the empty-bed opportunity from half the gap to 70% occupancy", () => {
    const a = profitActions(metrics({}), 10).find((f) => f.id === "occupancy-low")!;
    // gap = 0.2 x (10 beds x 30 days) = 60 bed-nights x $20 x 50%
    expect(a.monthlyImpactCents).toBe(60_000);
    expect(a.steps.length).toBeGreaterThan(2);
    expect(a.page).toBe("profit");
  });

  it("models the retention discount net of what existing returners get", () => {
    const a = profitActions(metrics({ occupancyRate: 0.8 }), 10).find((f) => f.id === "retention-discount")!;
    // extra = 100 x 5% = 5 stays x ($50 x 90%) = 22500; minus 10 returners x $50 x 10% = 5000
    expect(a.monthlyImpactCents).toBe(17_500);
  });

  it("does not recommend a discount once returning share reaches the target", () => {
    const m = metrics({ occupancyRate: 0.8, returningGuestShare: 0.25, uniqueGuests: 100, returningGuests: 25 });
    expect(profitActions(m, 10).some((f) => f.id === "retention-discount")).toBe(false);
  });

  it("skips retention advice when guest identity is unknown", () => {
    const m = metrics({ occupancyRate: 0.8, returningGuestShare: null });
    expect(profitActions(m, 10).some((f) => f.id === "retention-discount")).toBe(false);
  });

  it("suggests a rate rise instead when occupancy is very high", () => {
    const ids = profitActions(metrics({ occupancyRate: 0.95 }), 10).map((f) => f.id);
    expect(ids).toContain("occupancy-high");
    expect(ids).not.toContain("occupancy-low");
  });

  it("asks for every missing piece of data, each with steps", () => {
    const s = setupActions({
      hasBookings: false,
      hasBankData: false,
      missingCostLines: ["rent", "staff", "laundry"],
      hasGuestIdentity: false,
      hasReviewSnapshot: false,
      hasPmsConnection: false,
    });
    expect(s.map((f) => f.id)).toEqual(["setup-bookings", "setup-costs", "setup-bank", "setup-reviews"]);
    expect(s.every((f) => f.steps.length > 0 && f.kind === "setup")).toBe(true);
  });

  it("asks for guest identity only once bookings exist", () => {
    const base = { hasBankData: true, missingCostLines: [], hasReviewSnapshot: true, hasPmsConnection: false };
    expect(setupActions({ ...base, hasBookings: true, hasGuestIdentity: false }).map((f) => f.id)).toEqual(["setup-guest-identity"]);
    expect(setupActions({ ...base, hasBookings: false, hasGuestIdentity: false }).map((f) => f.id)).toEqual(["setup-bookings"]);
  });

  it("ranks blocking setup steps first, then by dollar impact", () => {
    const setup = setupActions({ hasBookings: false, hasBankData: true, missingCostLines: [], hasGuestIdentity: true, hasReviewSnapshot: true, hasPmsConnection: false });
    const money = profitActions(metrics({}), 10);
    expect(rankActions([...money, ...setup])[0].id).toBe("setup-bookings");
    const only = rankActions(money);
    expect(only[0].monthlyImpactCents).toBeGreaterThanOrEqual(only[only.length - 1].monthlyImpactCents);
  });

  it("flags a low rating and flat review count with steps", () => {
    const ids = reviewActions({ rating: 4.2, reviewCount: 100, prevRating: 4.2, prevReviewCount: 100 }).map((f) => f.id);
    expect(ids).toEqual(["reviews-rating", "reviews-flat"]);
    expect(reviewActions(null)).toEqual([]);
    expect(reviewActions({ rating: 4.8, reviewCount: 120, prevReviewCount: 100 })).toEqual([]);
  });
});

describe("date parsing", () => {
  it("parses ISO and slash dates and rejects impossible ones", () => {
    expect(parseDate("2026-11-05", "mdy")?.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(parseDate("11/05/2026", "mdy")?.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(parseDate("11/05/2026", "dmy")?.toISOString().slice(0, 10)).toBe("2026-05-11");
    expect(parseDate("02/31/2026", "mdy")).toBeNull();
    expect(parseDate("nope", "mdy")).toBeNull();
  });
});

describe("bookings CSV", () => {
  const csv = [
    "Reservation ID,Guest Name,Email,Source,Check-in,Check-out,Total,Status",
    "R1,Ann,Ann@X.com,Booking.com,11/01/2026,11/04/2026,$120.50,Confirmed",
    "R2,Bob,,Direct,11/13/2026,11/14/2026,45,Confirmed",
    "R3,Cy,,Expedia,11/05/2026,11/06/2026,30,Cancelled",
    "R4,Di,,Direct,11/07/2026,11/07/2026,10,Confirmed",
    "R5,Ed,,Direct,notadate,11/09/2026,10,Confirmed",
  ].join("\n");

  it("parses good rows, skips cancelled, and reports bad rows with line numbers", () => {
    const r = parseBookingsCsv(csv);
    expect(r.totalRows).toBe(5);
    expect(r.rows.map((x) => x.externalId)).toEqual(["R1", "R2"]);
    expect(r.rows[0]).toMatchObject({ nights: 3, revenueCents: 12_050, channel: "ota", guestKey: "ann@x.com" });
    expect(r.rows[1]).toMatchObject({ channel: "direct", guestKey: "bob" });
    expect(r.errors).toEqual([
      { line: 5, message: "Check-out is not after check-in." },
      { line: 6, message: "Unreadable check-in or check-out date." },
    ]);
  });

  it("detects day-first dates from the data", () => {
    const r = parseBookingsCsv("Check-in,Check-out,Total\n13/11/2026,15/11/2026,50");
    expect(r.rows[0].checkIn.toISOString().slice(0, 10)).toBe("2026-11-13");
    expect(r.rows[0].nights).toBe(2);
  });

  it("explains missing columns instead of failing silently", () => {
    const r = parseBookingsCsv("Name,Total\nAnn,50");
    expect(r.rows).toEqual([]);
    expect(r.errors[0].message).toMatch(/check-in and check-out/i);
  });

  it("rejects oversized and empty files", () => {
    expect(parseBookingsCsv("a".repeat(MAX_IMPORT_BYTES + 1)).errors[0].message).toMatch(/5 MB/);
    expect(parseBookingsCsv("").errors[0].message).toMatch(/no data/i);
  });
});

describe("bank CSV", () => {
  it("treats negatives as spend and skips deposits, categorising each charge", () => {
    const r = parseBankCsv(
      ["Date,Description,Amount", "2026-11-02,Clean Linen Co,-612.00", "2026-11-03,Payroll Gusto,-1100.00", "2026-11-04,Guest deposit,250.00", "2026-11-05,Mailchimp,-49.00"].join("\n"),
    );
    expect(r.rows.map((x) => [x.merchant, x.amountCents, x.category])).toEqual([
      ["Clean Linen Co", 61_200, "laundry"],
      ["Payroll Gusto", 110_000, "staff"],
      ["Mailchimp", 4_900, "software"],
    ]);
  });

  it("treats positives as spend when the export has no negatives (card statements)", () => {
    const r = parseBankCsv("Date,Description,Amount\n2026-11-02,Booking.com,200.00\n2026-11-03,City Power,80.50");
    expect(r.rows.map((x) => x.category)).toEqual(["channel_commission", "utilities"]);
  });

  it("reads debit/credit columns", () => {
    const r = parseBankCsv("Date,Description,Debit,Credit\n2026-11-02,Rent,1500.00,\n2026-11-03,Refund,,20.00");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ amountCents: 150_000, category: "rent" });
  });

  it("reports unreadable dates", () => {
    const r = parseBankCsv("Date,Description,Amount\nxx,Thing,-5");
    expect(r.rows).toEqual([]);
    expect(r.errors[0]).toEqual({ line: 2, message: "Unreadable date." });
  });

  it("categorises common merchants", () => {
    expect(categorize("HOSTELWORLD COMMISSION")).toBe("channel_commission");
    expect(categorize("Home Depot")).toBe("supplies");
    expect(categorize("Random cafe")).toBe("other");
  });
});

describe("utilities, expenses and schedule CSVs", () => {
  it("imports utility bills as utilities", () => {
    const r = parseUtilitiesCsv("Date,Provider,Amount\n2026-11-01,City Power,412.30\n2026-11-02,Water Co,0");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ category: "utilities", amountCents: 41_230, merchant: "City Power" });
    expect(r.errors[0].line).toBe(3);
  });

  it("imports an invoice log, honouring a valid category and guessing otherwise", () => {
    const r = parseExpensesCsv("Date,Vendor,Amount,Category\n2026-11-01,Acme,100,Laundry\n2026-11-02,Linen King,50,\n2026-11-03,,5,other");
    expect(r.rows.map((x) => x.category)).toEqual(["laundry", "laundry"]);
    expect(r.errors).toEqual([{ line: 4, message: "Missing vendor." }]);
  });

  it("computes shift hours from hours or start/end times, including overnight", () => {
    const r = parseScheduleCsv(
      ["Employee,Date,Start,End,Rate", "Ann,2026-11-02,9:00 AM,5:00 PM,$15", "Bob,2026-11-02,10pm,6am,20", "Cy,2026-11-03,,,"].join("\n"),
    );
    expect(r.rows.map((x) => [x.employee, x.hours, x.hourlyRateCents])).toEqual([
      ["Ann", 8, 1_500],
      ["Bob", 8, 2_000],
    ]);
    expect(laborCostCents(r.rows)).toBe(28_000);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].line).toBe(4);
  });

  it("accepts an hours column and requires a rate", () => {
    const ok = parseScheduleCsv("Employee,Date,Hours,Rate\nAnn,2026-11-02,6.5,12");
    expect(ok.rows[0].hours).toBe(6.5);
    const bad = parseScheduleCsv("Employee,Date,Hours\nAnn,2026-11-02,6");
    expect(bad.rows).toEqual([]);
  });
});
