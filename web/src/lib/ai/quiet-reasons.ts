import type { QuietNight } from "../domain/quiet";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * The prompt for "why might this night be quiet?". Only the facts passed in are given to the model, and it is told
 * not to invent events, news or rival prices. Events appear only when a sourced list is supplied.
 */
export function buildReasonPrompt(
  night: QuietNight,
  facts: { rateVsCompMedianPct: number | null; leadTimeDays: number | null },
  events: { title: string; url: string }[],
): string {
  const date = night.date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const lines = [
    `A hostel has a quiet night: ${WEEKDAYS[night.weekday]} ${date}.`,
    `It is ${pct(night.occupancy)} booked. ${WEEKDAYS[night.weekday]}s are usually ${pct(night.weekdayAvg)} full.`,
  ];
  if (facts.leadTimeDays !== null) lines.push(`The night is ${facts.leadTimeDays} days away.`);
  if (facts.rateVsCompMedianPct === null) lines.push("No competitor price data was supplied.");
  else {
    const r = Math.round(Math.abs(facts.rateVsCompMedianPct));
    lines.push(`The hostel's direct price is ${r}% ${facts.rateVsCompMedianPct >= 0 ? "above" : "below"} the median of its competitors' prices (example data may be simulated).`);
  }
  if (events.length === 0) {
    lines.push("No event data was available. Never name events, festivals, conferences or news, and never state any competitor price that is not given above.");
  } else {
    lines.push("Sourced events near this date (use only these, and cite the title):", ...events.map((e) => `- ${e.title} (${e.url})`));
    lines.push("Never name any other event or news, and never state any competitor price that is not given above.");
  }
  lines.push(
    "",
    "Give up to 4 possible reasons this night is quiet, covering guest behaviour, timing and pricing where the facts support it.",
    "Write one short line per reason, each starting with '- Possible:'. Plain words, no more than 20 words each. Do not give advice or a price.",
  );
  return lines.join("\n");
}

/** Reads the model's bullet list into at most four reasons, each labelled "Possible:". */
export function parseReasons(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*•]\s+\S/.test(l))
    .map((l) => l.replace(/^[-*•]\s+/, "").replace(/^possible:\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((r) => `Possible: ${r.charAt(0).toUpperCase()}${r.slice(1)}`);
}
