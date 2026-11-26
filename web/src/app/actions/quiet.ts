"use server";

import Anthropic from "@anthropic-ai/sdk";

import { makeDailyCap } from "@/lib/ai/cap";
import { buildReasonPrompt, parseReasons } from "@/lib/ai/quiet-reasons";
import { CHAT_MODEL } from "@/lib/chat";
import { quietestNights } from "@/lib/domain/quiet";
import { competitorMedian } from "@/lib/domain/rates";
import { utcDay } from "@/lib/period";
import { buildRateView } from "@/lib/rates/view";
import { requireProperty } from "@/lib/session";

// Five explanations per hostel per day keeps the AI cost bounded.
const allow = makeDailyCap(5);
const DAY = 86_400_000;

export type ReasonsResult = { reasons?: string[]; error?: string };

/** Asks Claude for possible reasons a quiet night is quiet, from the hostel's own numbers only. */
export async function quietReasonsAction(dateIso: string): Promise<ReasonsResult> {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return { error: "That date is not valid." };
    if (!process.env.ANTHROPIC_API_KEY) return { error: "Reasons are not switched on yet. The suggested price does not need them." };
    const { store, property } = await requireProperty();
    if (!allow(property.id)) return { error: "You have used today's explanations. Try again tomorrow." };

    const today = utcDay(new Date());
    const night = quietestNights(await store.listBookings(property.id), property.beds, today, 30, 30).find((n) => n.date.toISOString().slice(0, 10) === dateIso);
    if (!night) return { error: "That night is no longer one of your quietest." };

    // Facts come from the server's own data. A rate comparison is given only when real or example rates exist.
    const snaps = await store.listRates(property.id, { start: night.date, end: new Date(night.date.getTime() + DAY) });
    const competitors = await store.listCompetitors(property.id);
    const view = buildRateView({ snaps, today: night.date, nightsCount: 1, otas: [], otaSettings: property.otaSettings, competitors, floorCents: 0 });
    const median = competitorMedian({ night: night.date, cells: Object.fromEntries(Object.entries(view.rows[0].cells).map(([k, v]) => [k, v && { listCents: v.listCents, discountedCents: v.memberCents, discountLabel: v.memberLabel, source: v.source }])) });
    const direct = view.rows[0].cells.direct?.listCents ?? null;
    const rateVsCompMedianPct = direct !== null && median ? ((direct - median) / median) * 100 : null;

    const prompt = buildReasonPrompt(night, { rateVsCompMedianPct, leadTimeDays: Math.round((night.date.getTime() - today.getTime()) / DAY) }, []);
    const res = await new Anthropic().messages.create({ model: CHAT_MODEL, max_tokens: 300, messages: [{ role: "user", content: prompt }] });
    const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const reasons = parseReasons(text);
    return reasons.length > 0 ? { reasons } : { error: "No reasons came back. Try again." };
  } catch (e) {
    console.error("[action:quietReasons]", e);
    return { error: "Could not get reasons right now. Try again later." };
  }
}
