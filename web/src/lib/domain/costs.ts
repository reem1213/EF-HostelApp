import type { Expense, ExpenseCategory } from "./types";

/**
 * Cost per bed.
 *
 * Definition: the five lines a hostel controls: employee, laundry, utilities,
 * rent, breakfast. Each line is a monthly total divided by occupied bed-nights.
 *
 * Source priority per line:
 *   1. a figure the manager entered (onboarding / settings),
 *   2. else imported records (bank summary, utility bills, invoices),
 *   3. for employee only: shifts x hourly rate from an imported schedule.
 */

export const COST_LINES = ["staff", "laundry", "utilities", "rent", "breakfast"] as const;
export type CostLine = (typeof COST_LINES)[number];

export const costLineLabel: Record<CostLine, string> = {
  staff: "Employees",
  laundry: "Laundry",
  utilities: "Utilities",
  rent: "Rent",
  breakfast: "Breakfast",
};

/** Monthly figures entered by the manager. 0 means "not entered". */
export type CostInputs = {
  month: string; // YYYY-MM
  rentCents: number;
  utilitiesCents: number;
  staffCents: number;
  breakfastCents: number;
  laundryCents: number;
};

export const emptyCostInputs = (month: string): CostInputs => ({
  month,
  rentCents: 0,
  utilitiesCents: 0,
  staffCents: 0,
  breakfastCents: 0,
  laundryCents: 0,
});

const inputFor = (i: CostInputs, line: CostLine): number =>
  ({
    staff: i.staffCents,
    laundry: i.laundryCents,
    utilities: i.utilitiesCents,
    rent: i.rentCents,
    breakfast: i.breakfastCents,
  })[line];

export type CostSource = "entered" | "imported" | "schedule" | "missing";

export type CostLineResult = {
  line: CostLine;
  label: string;
  totalCents: number;
  perBedNightCents: number;
  /** Share of the five-line total, 0-1. */
  share: number;
  source: CostSource;
};

export type CostBreakdown = {
  lines: CostLineResult[];
  totalCents: number;
  perBedNightCents: number;
  occupiedBedNights: number;
  /** Lines with no data at all, so the UI can ask for them. */
  missing: CostLine[];
};

export function costBreakdown(args: {
  inputs: CostInputs | null;
  expenses: Expense[];
  /** Labour cost from an imported schedule (hours x rate), in cents. */
  scheduleLaborCents?: number;
  occupiedBedNights: number;
}): CostBreakdown {
  const { inputs, expenses, occupiedBedNights } = args;
  const imported = (line: CostLine) =>
    expenses.filter((e) => e.category === (line as ExpenseCategory)).reduce((s, e) => s + e.amountCents, 0);

  const raw = COST_LINES.map((line) => {
    const entered = inputs ? inputFor(inputs, line) : 0;
    let total = 0;
    let source: CostSource = "missing";
    if (entered > 0) {
      total = entered;
      source = "entered";
    } else if (imported(line) > 0) {
      total = imported(line);
      source = "imported";
    } else if (line === "staff" && (args.scheduleLaborCents ?? 0) > 0) {
      total = args.scheduleLaborCents!;
      source = "schedule";
    }
    return { line, total, source };
  });

  const totalCents = raw.reduce((s, r) => s + r.total, 0);
  const per = (cents: number) => (occupiedBedNights > 0 ? Math.round(cents / occupiedBedNights) : 0);

  return {
    lines: raw.map((r) => ({
      line: r.line,
      label: costLineLabel[r.line],
      totalCents: r.total,
      perBedNightCents: per(r.total),
      share: totalCents > 0 ? r.total / totalCents : 0,
      source: r.source,
    })),
    totalCents,
    perBedNightCents: per(totalCents),
    occupiedBedNights,
    missing: raw.filter((r) => r.source === "missing").map((r) => r.line),
  };
}

/**
 * Turns entered monthly figures into expense rows so the audit rules (laundry vs
 * peers, spikes) see them. An entered figure replaces imported rows of the same
 * category, so nothing is counted twice.
 */
export function materializeInputs(inputs: CostInputs | null, imported: Expense[], at: Date): Expense[] {
  if (!inputs) return imported;
  const entered: Partial<Record<ExpenseCategory, number>> = {
    rent: inputs.rentCents,
    utilities: inputs.utilitiesCents,
    staff: inputs.staffCents,
    breakfast: inputs.breakfastCents,
    laundry: inputs.laundryCents,
  };
  const overridden = new Set(
    (Object.entries(entered) as [ExpenseCategory, number][]).filter(([, v]) => v > 0).map(([k]) => k),
  );
  const kept = imported.filter((e) => !overridden.has(e.category));
  const synthetic = [...overridden].map<Expense>((category) => ({
    id: `entered-${inputs.month}-${category}`,
    date: at,
    amountCents: entered[category]!,
    merchant: `${category[0].toUpperCase()}${category.slice(1)} (entered)`,
    category,
  }));
  return [...kept, ...synthetic];
}
