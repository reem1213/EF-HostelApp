/** Smallest "clean" axis maximum (1, 2 or 5 × a power of ten) that is at least `value`. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const frac = value / base;
  const step = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return step * base;
}

/** Three gridline values: zero, half, and the max. */
export const axisTicks = (max: number): number[] => [0, max / 2, max];
