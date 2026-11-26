import { dollarsExact } from "../domain/money";
import { resolveOta } from "../domain/ota";
import type { ActionRun } from "./types";

const dateLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const channelLabel = (channel: string) => (channel === "direct" ? "Direct" : resolveOta(channel).name);

/** A short, plain description of what a run changes (or changed), one line per fact. */
export function describeRun(run: ActionRun): string[] {
  const p = run.params;
  if (run.kind === "price_update") {
    if (typeof p.stayDate !== "string" || typeof p.channel !== "string" || typeof p.roomType !== "string") return [];
    if (Number.isNaN(new Date(`${p.stayDate.slice(0, 10)}T00:00:00Z`).getTime())) return [];
    const applied = run.status === "applied" || run.status === "undone";
    const from = applied ? run.before : p.currentCents;
    const to = applied ? run.after : p.priceCents;
    const change =
      typeof to !== "number" ? "" : typeof from === "number" ? `${dollarsExact(from)} → ${dollarsExact(to)}` : `New price ${dollarsExact(to)}`;
    return [`${dateLabel(p.stayDate)} · ${channelLabel(p.channel)} · ${p.roomType}`, change].filter(Boolean);
  }
  return typeof p.summary === "string" && p.summary ? [p.summary] : [];
}
