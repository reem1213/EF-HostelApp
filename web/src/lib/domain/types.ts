/** Half-open date range [start, end). */
export type DateRange = { start: Date; end: Date };

export const rangeDays = (r: DateRange) =>
  Math.round((r.end.getTime() - r.start.getTime()) / 86_400_000);

export type Channel = "direct" | "ota" | "other";

export type ExpenseCategory =
  | "laundry"
  | "utilities"
  | "staff"
  | "software"
  | "channel_commission"
  | "supplies"
  | "other";

export const categoryLabel: Record<ExpenseCategory, string> = {
  laundry: "Laundry",
  utilities: "Utilities",
  staff: "Staff",
  software: "Software",
  channel_commission: "Channel commission",
  supplies: "Supplies",
  other: "Other",
};

/** A bed-stay booked through a channel. */
export type Booking = {
  id: string;
  channel: Channel;
  revenueCents: number;
  nights: number;
  checkIn: Date;
};

/** An operating expense. amountCents is positive. */
export type Expense = {
  id: string;
  date: Date;
  amountCents: number;
  merchant: string;
  category: ExpenseCategory;
};

/** Peer-group targets used to judge a property. */
export type Benchmark = {
  peerCostPerBedNightCents: number;
  targetCostPerBedNightCents: number;
  peerLaundryPerBedNightCents: number;
  /** e.g. 0.15 = 15% commission is acceptable. */
  targetOtaCommissionRate: number;
  /** e.g. 0.40 = 40% of revenue should come direct. */
  targetDirectShare: number;
  /** Above this share of OTA revenue the property is over-dependent. */
  targetOtaShare: number;
};

export type PropertyProfile = {
  id: string;
  name: string;
  beds: number;
  benchmark: Benchmark;
};

export type AuditInput = {
  property: PropertyProfile;
  period: DateRange;
  previousPeriod: DateRange;
  occupiedBedNights: number;
  bookings: Booking[];
  expenses: Expense[];
  previousExpenses: Expense[];
  syncedAt: Date;
};

export type FindingKind = "leak" | "growth";
export type FindingArea = "money" | "costs" | "growth";
export type Severity = "low" | "medium" | "high";

export type Finding = {
  /** Stable key, used to remember that the user addressed it. */
  id: string;
  kind: FindingKind;
  area: FindingArea;
  title: string;
  detail: string;
  monthlyImpactCents: number;
  severity: Severity;
};

export type AuditResult = {
  property: PropertyProfile;
  syncedAt: Date;
  /** All findings, highest monthly impact first. */
  findings: Finding[];
  addressedIds: Set<string>;
  totalRevenueCents: number;
  operatingCostCents: number;
  occupiedBedNights: number;
  costPerBedNightCents: number;
  laundryPerBedNightCents: number;
  directSharePct: number;
  otaSharePct: number;
  /** 0-100, see audit-engine.ts for the formula. */
  profitHealth: number;
  openLeaks: Finding[];
  addressedLeaks: Finding[];
  openLeakCents: number;
  recoveredCents: number;
  nextStep: Finding | null;
};
