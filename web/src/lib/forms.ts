import type { z } from "zod";

/**
 * Parses a dollar amount typed into a form ("1,250.50", "$300", "") into cents.
 * Empty means 0. Returns null when the text is not a valid amount.
 */
export function dollarsToCents(value: FormDataEntryValue | null, max = 10_000_000): number | null {
  const raw = String(value ?? "").replace(/[$,\s]/g, "");
  if (raw === "") return 0;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(raw)) return null;
  const cents = Math.round(Number(raw) * 100);
  return cents <= max * 100 ? cents : null;
}

export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

export const COST_FIELDS = [
  { name: "rent", label: "Rent", help: "Monthly rent or mortgage." },
  { name: "utilities", label: "Utilities", help: "Electric, water, gas, internet." },
  { name: "staff", label: "Employees", help: "Monthly payroll including taxes." },
  { name: "laundry", label: "Laundry", help: "Leave blank to use imported invoices." },
  { name: "breakfast", label: "Breakfast", help: "Food and supplies for breakfast." },
] as const;

export type CostFieldName = (typeof COST_FIELDS)[number]["name"];

/** Reads the five monthly cost fields. Returns errors keyed by field name. */
export function readCostFields(fd: FormData): { cents: Record<CostFieldName, number>; errors: Record<string, string> } {
  const cents = {} as Record<CostFieldName, number>;
  const errors: Record<string, string> = {};
  for (const f of COST_FIELDS) {
    const v = dollarsToCents(fd.get(f.name));
    if (v === null) errors[f.name] = "Enter an amount like 1250 or 1250.50";
    else cents[f.name] = v;
  }
  return { cents, errors };
}

/** Copies the named text fields from a form, for echoing back after a validation error. Never pass secret fields. */
export function echo(fd: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((n) => [n, String(fd.get(n) ?? "")]));
}
