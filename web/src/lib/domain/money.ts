// All money is stored as integer cents to avoid floating-point drift.

const group = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Whole dollars, rounded half-up: 51234 -> "$512", -1550 -> "-$16". */
export function dollars(cents: number): string {
  const whole = Math.floor((Math.abs(cents) + 50) / 100);
  return `${cents < 0 ? "-" : ""}$${group(whole)}`;
}

/** Exact dollars with cents: 620 -> "$6.20". */
export function dollarsExact(cents: number): string {
  const abs = Math.abs(cents);
  const rem = String(abs % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}$${group(Math.floor(abs / 100))}.${rem}`;
}

/** Parses "120.50" (or a number) into cents. Unparseable input becomes 0. */
export function centsFromDecimal(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}
