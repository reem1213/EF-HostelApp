import { describe, expect, it } from "vitest";

import { applyAddressed, runAudit } from "./audit-engine";
import type { AuditInput, Benchmark, Booking, Expense, ExpenseCategory, PropertyProfile } from "./types";

const bench: Benchmark = {
  peerCostPerBedNightCents: 490,
  targetCostPerBedNightCents: 450,
  peerLaundryPerBedNightCents: 145,
  targetOtaCommissionRate: 0.15,
  targetDirectShare: 0.4,
  targetOtaShare: 0.5,
};

const property: PropertyProfile = { id: "p1", name: "Test Hostel", beds: 10, benchmark: bench };
const now = new Date(2026, 10, 24);
const day = 86_400_000;
const period = { start: new Date(2026, 9, 25), end: new Date(2026, 10, 24) };
const prev = { start: new Date(2026, 8, 25), end: new Date(2026, 9, 25) };

const exp = (id: string, category: ExpenseCategory, amountCents: number, merchant = "Vendor", dayOffset = 0): Expense => ({
  id,
  category,
  amountCents,
  merchant,
  date: new Date(now.getTime() + dayOffset * day),
});

const booking = (id: string, channel: Booking["channel"], revenueCents: number, nights: number): Booking => ({
  id,
  channel,
  revenueCents,
  nights,
  checkIn: now,
});

function input(p: Partial<AuditInput> & Pick<AuditInput, "bookings" | "expenses">): AuditInput {
  return {
    property,
    period,
    previousPeriod: prev,
    occupiedBedNights: 40,
    previousExpenses: [],
    syncedAt: now,
    ...p,
  };
}

/**
 * Every rule fires; the numbers are worked out by hand:
 *  - revenue 4000 (direct 1000, OTA 3000), 40 bed-nights
 *  - laundry 9000 vs peer 145*40 = 5800                 -> laundry-peer 3200
 *  - commission 600 vs 15% of 3000 = 450                -> ota-commission 150
 *  - two Mailchimp charges of 1000                      -> dupe-mailchimp 1000
 *  - supplies 12000 vs 4000 previously (+200%)          -> spike-supplies 8000
 *  - direct 25% vs 40% target, shift 600 at 20%         -> direct-share 120 (growth)
 */
const allRules = () =>
  input({
    bookings: [booking("d", "direct", 1000, 10), booking("o", "ota", 3000, 30)],
    expenses: [
      exp("l", "laundry", 9000),
      exp("c", "channel_commission", 600, "Booking.com"),
      exp("m1", "software", 1000, "Mailchimp", -20),
      exp("m2", "software", 1000, "MailChimp!", -13),
      exp("s", "supplies", 12000),
    ],
    previousExpenses: [exp("ps", "supplies", 4000)],
  });

describe("audit rules", () => {
  it("fires every rule with the hand-computed impact", () => {
    const r = runAudit(allRules());
    const byId = Object.fromEntries(r.findings.map((f) => [f.id, f]));

    expect(byId["laundry-peer"].monthlyImpactCents).toBe(3200);
    expect(byId["ota-commission"].monthlyImpactCents).toBe(150);
    expect(byId["dupe-mailchimp"].monthlyImpactCents).toBe(1000);
    expect(byId["dupe-mailchimp"].title).toBe("Duplicate charge: Mailchimp");
    expect(byId["spike-supplies"].monthlyImpactCents).toBe(8000);
    expect(byId["spike-supplies"].title).toBe("Supplies up 200% vs last period");
    expect(byId["direct-share"].monthlyImpactCents).toBe(120);
    expect(byId["direct-share"].kind).toBe("growth");
  });

  it("sorts findings by impact, highest first", () => {
    const impacts = runAudit(allRules()).findings.map((f) => f.monthlyImpactCents);
    expect(impacts).toEqual([...impacts].sort((a, b) => b - a));
  });

  it("never flags laundry as a spike (the peer rule covers it)", () => {
    const r = runAudit(
      input({
        bookings: [booking("d", "direct", 2000, 20), booking("o", "ota", 2000, 20)],
        expenses: [exp("l", "laundry", 5000)],
        previousExpenses: [exp("pl", "laundry", 1000)],
      }),
    );
    expect(r.findings.some((f) => f.id === "spike-laundry")).toBe(false);
  });

  it("produces no leaks and no next step for a clean property", () => {
    const r = runAudit(
      input({
        bookings: [booking("d", "direct", 2000, 20), booking("o", "ota", 2000, 20)],
        expenses: [exp("l", "laundry", 5000)],
      }),
    );
    expect(r.findings).toEqual([]);
    expect(r.nextStep).toBeNull();
    expect(r.openLeakCents).toBe(0);
    expect(r.profitHealth).toBe(100);
  });

  it("ignores category increases below the $50 floor", () => {
    const r = runAudit(
      input({
        bookings: [booking("d", "direct", 2000, 20), booking("o", "ota", 2000, 20)],
        expenses: [exp("s", "supplies", 4000)],
        previousExpenses: [exp("ps", "supplies", 1000)],
      }),
    );
    expect(r.findings.some((f) => f.id === "spike-supplies")).toBe(false);
  });
});

describe("audit metrics", () => {
  it("computes cost per bed-night, laundry per bed-night and channel shares", () => {
    const r = runAudit(allRules());
    expect(r.operatingCostCents).toBe(23600); // 9000 + 600 + 2000 + 12000
    expect(r.costPerBedNightCents).toBe(590);
    expect(r.laundryPerBedNightCents).toBe(225);
    expect(r.directSharePct).toBeCloseTo(0.25, 9);
    expect(r.otaSharePct).toBeCloseTo(0.75, 9);
  });

  it("clamps profit health to 0-100", () => {
    expect(runAudit(allRules()).profitHealth).toBe(0);
  });

  it("picks the highest-impact open finding as the next step", () => {
    expect(runAudit(allRules()).nextStep?.id).toBe("spike-supplies");
  });
});

describe("addressing findings", () => {
  it("moves addressed leaks from open to recovered", () => {
    const base = runAudit(allRules());
    const after = applyAddressed(base, new Set(["spike-supplies"]));
    expect(after.recoveredCents).toBe(8000);
    expect(after.openLeakCents).toBe(base.openLeakCents - 8000);
    expect(after.nextStep?.id).toBe("laundry-peer");
  });

  it("does not count an addressed growth finding as recovered money", () => {
    const after = applyAddressed(runAudit(allRules()), new Set(["direct-share"]));
    expect(after.recoveredCents).toBe(0);
  });

  it("does not lower profit health when leaks are addressed", () => {
    const base = runAudit(allRules());
    const after = applyAddressed(base, new Set(["laundry-peer", "spike-supplies", "dupe-mailchimp", "ota-commission"]));
    expect(after.profitHealth).toBeGreaterThanOrEqual(base.profitHealth);
  });
});
