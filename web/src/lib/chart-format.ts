import { dollars } from "./domain/money";

/**
 * Charts are client components, and functions cannot be passed from a server page to a
 * client component. Pages pass one of these names and the chart resolves it here.
 */
export type ValueFormat = "dollars" | "percent" | "count" | "rating";

export function formatValue(kind: ValueFormat, n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  switch (kind) {
    case "dollars":
      return dollars(v);
    case "percent":
      return `${Math.round(v * 100)}%`;
    case "count":
      return String(Math.round(v));
    case "rating":
      return v.toFixed(1);
  }
}
