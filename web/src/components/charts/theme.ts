/**
 * Chart colours. Multi-series charts use the validated reference categorical order
 * (passes lightness, chroma and adjacent colour-blind separation on a white surface).
 * Single-series charts use the brand teal. Text never wears a series colour.
 */
export const SERIES = ["#257de0", "#f47230", "#00b894", "#f2a600", "#ee7fac"] as const;
export const TEAL = "#1f5e5a";
export const GOLD = "#c9a44c";
export const SURFACE = "#ffffff";
export const GRID = "#e6e4de";

/** Path for a vertical bar with a rounded top and a square baseline. */
export function roundedTop(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.min(r, w / 2, h);
  if (h <= 0) return "";
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/** Path for a horizontal bar with a rounded right end and a square left baseline. */
export function roundedRight(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.min(r, h / 2, w);
  if (w <= 0) return "";
  return `M${x},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} H${x} Z`;
}
