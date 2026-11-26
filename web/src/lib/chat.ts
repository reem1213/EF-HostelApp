import { z } from "zod";

import type { Dashboard } from "./dashboard";
import { dollars, dollarsExact } from "./domain/money";

/**
 * Chatbot support code. The model only ever sees an aggregate summary of the
 * property: totals, rates, rankings and fix steps. It never sees guest names or
 * emails, individual transactions, or credentials.
 */

export const CHAT_MODEL = "claude-sonnet-5-5";
export const MAX_MESSAGES = 20;
export const MAX_MESSAGE_CHARS = 2_000;

export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
      }),
    )
    .min(1)
    .max(MAX_MESSAGES)
    .refine((m) => m.at(-1)?.role === "user", "The last message must be from the user"),
});

export type ChatMessage = z.infer<typeof chatRequestSchema>["messages"][number];

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** A plain-text summary of the dashboard. Kept compact so every request is cheap. */
export function buildChatContext(d: Dashboard): string {
  const m = d.metrics;
  const lines: string[] = [];
  lines.push(`Property: ${d.property.name}, ${d.property.beds} beds. Period analysed: ${d.windowLabel} (30 days).`);

  if (!d.dataState.hasBookings) {
    lines.push("Bookings: none imported yet, so occupancy, rates and retention are unknown.");
  } else {
    lines.push(
      `Bookings: ${m.bookingsCount} stays, occupancy ${pct(m.occupancyRate)}, average rate ${dollarsExact(m.adrCents)} per bed-night, ` +
        `direct share ${pct(m.directShare)}, OTA share ${pct(m.otaShare)}, ` +
        `returning guests ${m.returningGuestShare === null ? "unknown (no guest identity in the data)" : pct(m.returningGuestShare)}.`,
    );
  }

  if (d.breakdown.totalCents > 0) {
    lines.push(
      `Cost per occupied bed: ${dollarsExact(d.breakdown.perBedNightCents)}. Lines (monthly total, per bed-night, source): ` +
        d.breakdown.lines.map((l) => `${l.label} ${dollars(l.totalCents)} / ${dollarsExact(l.perBedNightCents)} (${l.source})`).join("; ") +
        ".",
    );
  } else {
    lines.push("Costs: not entered yet.");
  }
  if (d.breakdown.missing.length > 0) lines.push(`Missing cost lines: ${d.breakdown.missing.join(", ")}.`);

  const a = d.audit;
  lines.push(`Open money leaks: ${a.openLeaks.length} worth ${dollars(a.openLeakCents)}/month. Recovered so far: ${dollars(a.recoveredCents)}/month. Profit health ${a.profitHealth}/100 (heuristic).`);

  const top = d.actions.slice(0, 6);
  if (top.length > 0) {
    lines.push("Ranked next steps:");
    top.forEach((f, i) => {
      lines.push(
        `${i + 1}. [${f.kind}] ${f.title}` +
          (f.monthlyImpactCents > 0 ? ` (about ${dollars(f.monthlyImpactCents)}/month)` : "") +
          ` - ${f.detail} Steps: ${f.steps.join(" ")}`,
      );
    });
  }

  const r = d.reviews.at(-1);
  if (r) lines.push(`Google reviews: rating ${r.rating}, ${r.reviewCount} reviews${r.impressions ? `, ${r.impressions} search impressions` : ""} (${r.month}).`);
  return lines.join("\n");
}

export function systemPrompt(context: string): string {
  return [
    "You are HostelPulse, a practical profit advisor for hostel managers.",
    "Your job is to say what to DO next, not just what the numbers are. Lead with the action, then the reason.",
    "Use only the property summary below. If something is not in it, say you do not have that data and tell the manager which import or setting would provide it. Never invent figures.",
    "Dollar impacts in the summary are estimates; call them estimates. Keep answers short: a few sentences or a short numbered list of steps.",
    "Do not give legal, tax or accounting advice. Do not ask for passwords, API keys or guest personal data.",
    "",
    "PROPERTY SUMMARY",
    context,
  ].join("\n");
}

/** Sliding-window rate limit, per user. In-memory: fine for one server, replace with a shared store when scaling out. */
export function makeRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    hits.set(key, [...recent, now]);
    return true;
  };
}
