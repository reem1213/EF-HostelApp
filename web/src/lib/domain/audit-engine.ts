import { dollars, dollarsExact } from "./money";
import {
  AuditInput,
  AuditResult,
  Benchmark,
  Booking,
  categoryLabel,
  Channel,
  Expense,
  ExpenseCategory,
  Finding,
  PropertyProfile,
  Severity,
} from "./types";

/**
 * Turns bookings and expenses into findings, metrics and a next step.
 * Pure TypeScript: no I/O, so it runs on the server, in tests, or in the browser.
 *
 * Rules (monthly impact in cents):
 *  1. laundry-peer      Laundry per bed-night above the peer median.
 *                       impact = laundry - peerPerNight * occupiedBedNights
 *  2. ota-commission    Channel commission above the target rate on OTA revenue.
 *                       impact = commission - otaRevenue * targetRate
 *  3. dupe-<merchant>   Same software merchant charged more than once.
 *                       impact = every charge after the first
 *  4. spike-<category>  Category up >= 15% and >= $50 vs the previous period.
 *                       Laundry and channel commission are skipped because
 *                       rules 1 and 2 already cover them (no double counting).
 *  5. direct-share      (growth) Direct revenue below target.
 *                       shifted = min(otaRevenue, target*revenue - directRevenue)
 *                       impact  = shifted * effective OTA commission rate
 *
 * Profit health (0-100, heuristic, tune with real data):
 *   100 - 1.5 * cost gap vs peer (%) - 2 * open leaks as % of revenue
 *       - 0.5 * OTA share above target (%)
 */

export const SPIKE_RATIO = 0.15;
export const SPIKE_MIN_CENTS = 5_000;

export function runAudit(input: AuditInput, addressed: Set<string> = new Set()): AuditResult {
  const bench = input.property.benchmark;
  const revenue = sumRevenue(input.bookings);
  const otaRevenue = sumRevenue(input.bookings, "ota");
  const directRevenue = sumRevenue(input.bookings, "direct");
  const opCost = sumExpenses(input.expenses);
  const nights = input.occupiedBedNights;

  const commission = sumExpenses(input.expenses, "channel_commission");
  const laundry = sumExpenses(input.expenses, "laundry");
  const effectiveOtaRate = otaRevenue > 0 ? commission / otaRevenue : bench.targetOtaCommissionRate;

  const findings = [
    ...laundryOverPeer(laundry, nights, bench),
    ...otaCommission(commission, otaRevenue, bench),
    ...duplicateSoftware(input.expenses),
    ...categorySpikes(input.expenses, input.previousExpenses),
    ...directShareGrowth(revenue, directRevenue, otaRevenue, effectiveOtaRate, bench),
  ].sort((a, b) => b.monthlyImpactCents - a.monthlyImpactCents);

  return build({
    property: input.property,
    syncedAt: input.syncedAt,
    findings,
    addressed,
    revenue,
    opCost,
    nights,
    costPerNight: input.costPerBedNightCents ?? (nights > 0 ? Math.floor(opCost / nights) : 0),
    laundryPerNight: nights > 0 ? Math.floor(laundry / nights) : 0,
    directShare: revenue > 0 ? directRevenue / revenue : 0,
    otaShare: revenue > 0 ? otaRevenue / revenue : 0,
  });
}

/** Same findings with a different set of addressed ids applied. */
export function applyAddressed(result: AuditResult, addressed: Set<string>): AuditResult {
  return build({
    property: result.property,
    syncedAt: result.syncedAt,
    findings: result.findings,
    addressed,
    revenue: result.totalRevenueCents,
    opCost: result.operatingCostCents,
    nights: result.occupiedBedNights,
    costPerNight: result.costPerBedNightCents,
    laundryPerNight: result.laundryPerBedNightCents,
    directShare: result.directSharePct,
    otaShare: result.otaSharePct,
  });
}

type BuildArgs = {
  property: PropertyProfile;
  syncedAt: Date;
  findings: Finding[];
  addressed: Set<string>;
  revenue: number;
  opCost: number;
  nights: number;
  costPerNight: number;
  laundryPerNight: number;
  directShare: number;
  otaShare: number;
};

function build(a: BuildArgs): AuditResult {
  const isOpen = (f: Finding) => !a.addressed.has(f.id);
  const openLeaks = a.findings.filter((f) => f.kind === "leak" && isOpen(f));
  const addressedLeaks = a.findings.filter((f) => f.kind === "leak" && !isOpen(f));
  const openLeakCents = sum(openLeaks.map((f) => f.monthlyImpactCents));

  return {
    property: a.property,
    syncedAt: a.syncedAt,
    findings: a.findings,
    addressedIds: a.addressed,
    totalRevenueCents: a.revenue,
    operatingCostCents: a.opCost,
    occupiedBedNights: a.nights,
    costPerBedNightCents: a.costPerNight,
    laundryPerBedNightCents: a.laundryPerNight,
    directSharePct: a.directShare,
    otaSharePct: a.otaShare,
    profitHealth: profitHealth({
      costPerNight: a.costPerNight,
      bench: a.property.benchmark,
      openLeakCents,
      revenueCents: a.revenue,
      otaShare: a.otaShare,
    }),
    openLeaks,
    addressedLeaks,
    openLeakCents,
    recoveredCents: sum(addressedLeaks.map((f) => f.monthlyImpactCents)),
    nextStep: a.findings.find(isOpen) ?? null,
  };
}

// ---- rules ----------------------------------------------------------------

function laundryOverPeer(laundry: number, nights: number, bench: Benchmark): Finding[] {
  if (nights <= 0) return [];
  const impact = laundry - bench.peerLaundryPerBedNightCents * nights;
  if (impact <= 0) return [];
  return [
    {
      id: "laundry-peer",
      kind: "leak",
      area: "costs",
      title: "Laundry above peer median",
      detail: `${dollarsExact(Math.floor(laundry / nights))} per occupied night vs peer ${dollarsExact(bench.peerLaundryPerBedNightCents)}`,
      monthlyImpactCents: impact,
      severity: severityFor(impact),
      page: "costs",
      steps: [
        "Pull your last 3 laundry invoices and confirm the per-kilo or per-bed rate.",
        `Get 2 competing quotes. Your target is ${dollarsExact(bench.peerLaundryPerBedNightCents)} per occupied night or less.`,
        "Send your current supplier the cheaper quote and ask them to match it, or switch.",
        "Check for surge charges and delivery fees. Ask for them to be waived.",
      ],
    },
  ];
}

function otaCommission(commission: number, otaRevenue: number, bench: Benchmark): Finding[] {
  if (otaRevenue <= 0) return [];
  const allowed = Math.round(otaRevenue * bench.targetOtaCommissionRate);
  const impact = commission - allowed;
  if (impact <= 0) return [];
  const rate = ((commission / otaRevenue) * 100).toFixed(1);
  const target = Math.round(bench.targetOtaCommissionRate * 100);
  return [
    {
      id: "ota-commission",
      kind: "leak",
      area: "money",
      title: "Booking-site commission",
      detail: `${rate}% effective commission vs ${target}% target`,
      monthlyImpactCents: impact,
      severity: severityFor(impact),
      page: "profit",
      steps: [
        `Open each booking site's extranet and check the commission rate you are actually on (target ${target}%).`,
        "Ask your account manager for a lower rate or a visibility-booster waiver. Quote your volume.",
        "Turn off promotions that stack extra commission on guests who would have booked anyway.",
        "Shift repeat guests to direct booking with a small perk (see the direct-booking plan).",
      ],
    },
  ];
}

function duplicateSoftware(expenses: Expense[]): Finding[] {
  const byMerchant = new Map<string, Expense[]>();
  for (const e of expenses) {
    if (e.category !== "software") continue;
    const key = merchantKey(e.merchant);
    byMerchant.set(key, [...(byMerchant.get(key) ?? []), e]);
  }
  const out: Finding[] = [];
  for (const [key, charges] of byMerchant) {
    if (charges.length < 2) continue;
    const sorted = [...charges].sort((a, b) => a.date.getTime() - b.date.getTime());
    const extra = sum(sorted.slice(1).map((e) => e.amountCents));
    out.push({
      id: `dupe-${key}`,
      kind: "leak",
      area: "money",
      title: `Duplicate charge: ${sorted[0].merchant}`,
      detail: `${charges.length} charges this period for the same service`,
      monthlyImpactCents: extra,
      severity: severityFor(extra),
      page: "reports",
      steps: [
        `Find the duplicate ${sorted[0].merchant} charges on your card or bank statement.`,
        "Check whether you have two accounts or two plans, and cancel the one you do not use.",
        "Ask the vendor for a refund of the extra charge. Most will credit the last billing period.",
      ],
    });
  }
  return out;
}

function categorySpikes(current: Expense[], previous: Expense[]): Finding[] {
  const skip = new Set<ExpenseCategory>(["laundry", "channel_commission"]);
  const out: Finding[] = [];
  for (const cat of Object.keys(categoryLabel) as ExpenseCategory[]) {
    if (skip.has(cat)) continue;
    const now = sumExpenses(current, cat);
    const before = sumExpenses(previous, cat);
    if (before <= 0) continue;
    const increase = now - before;
    if (increase < SPIKE_MIN_CENTS) continue;
    const ratio = increase / before;
    if (ratio < SPIKE_RATIO) continue;
    out.push({
      id: `spike-${cat}`,
      kind: "leak",
      area: "costs",
      title: `${categoryLabel[cat]} up ${Math.round(ratio * 100)}% vs last period`,
      detail: `${dollars(increase)} more than the previous period`,
      monthlyImpactCents: increase,
      severity: severityFor(increase),
      page: "costs",
      steps: [
        `List every ${categoryLabel[cat].toLowerCase()} charge from this period next to last period.`,
        "Mark each one as expected, one-off, or a price rise.",
        "For price rises, ask the supplier for the old rate or get a competing quote.",
        "If it is a new recurring cost, decide whether it earns its keep or cancel it.",
      ],
    });
  }
  return out;
}

function directShareGrowth(
  revenue: number,
  directRevenue: number,
  otaRevenue: number,
  effectiveOtaRate: number,
  bench: Benchmark,
): Finding[] {
  if (revenue <= 0 || otaRevenue <= 0) return [];
  const directShare = directRevenue / revenue;
  if (directShare >= bench.targetDirectShare) return [];
  const wanted = Math.round(bench.targetDirectShare * revenue) - directRevenue;
  const shifted = Math.min(wanted, otaRevenue);
  const impact = Math.round(shifted * effectiveOtaRate);
  if (impact <= 0) return [];
  return [
    {
      id: "direct-share",
      kind: "growth",
      area: "growth",
      title: "Move OTA guests to direct booking",
      detail: `${Math.round(directShare * 100)}% direct today, target ${Math.round(bench.targetDirectShare * 100)}%`,
      monthlyImpactCents: impact,
      severity: severityFor(impact),
      page: "profit",
      steps: [
        "Add a booking widget to your own website and make it the easiest place to book.",
        "Offer a small book-direct perk: free breakfast, late checkout, or 5% off.",
        "Claim and complete your Google Business Profile with photos and a booking link.",
        "Email past guests a returning-guest code every quarter.",
      ],
    },
  ];
}

// ---- helpers --------------------------------------------------------------

function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

function sumRevenue(bookings: Booking[], channel?: Channel): number {
  return sum(bookings.filter((b) => !channel || b.channel === channel).map((b) => b.revenueCents));
}

function sumExpenses(expenses: Expense[], category?: ExpenseCategory): number {
  return sum(expenses.filter((e) => !category || e.category === category).map((e) => e.amountCents));
}

function merchantKey(merchant: string): string {
  return merchant.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function severityFor(cents: number): Severity {
  if (cents >= 20_000) return "high";
  if (cents >= 7_500) return "medium";
  return "low";
}

function profitHealth(p: {
  costPerNight: number;
  bench: Benchmark;
  openLeakCents: number;
  revenueCents: number;
  otaShare: number;
}): number {
  const peer = p.bench.peerCostPerBedNightCents;
  const costGapPct = peer > 0 ? Math.max(0, ((p.costPerNight - peer) / peer) * 100) : 0;
  const leakPct = p.revenueCents > 0 ? (p.openLeakCents / p.revenueCents) * 100 : 0;
  const otaExcessPct = Math.max(0, (p.otaShare - p.bench.targetOtaShare) * 100);
  const score = 100 - 1.5 * costGapPct - 2 * leakPct - 0.5 * otaExcessPct;
  return Math.min(100, Math.max(0, Math.round(score)));
}
