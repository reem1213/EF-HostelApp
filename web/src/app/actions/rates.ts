"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { buildRunnerDeps } from "@/lib/automation/registry";
import { loadDashboard } from "@/lib/dashboard";
import { MAX_IMPORT_BYTES } from "@/lib/domain/import/parsers";
import { KNOWN_OTAS, type OtaSettings } from "@/lib/domain/ota";
import { dollarsToCents } from "@/lib/forms";
import { utcDay } from "@/lib/period";
import { importRatesText, loadSimulatedExample, proposeRateChange } from "@/lib/rates/service";
import { requireProperty } from "@/lib/session";
import { safely } from "./safe";
import type { ActionState } from "./types";

const refresh = () => revalidatePath("/", "layout");

/** Proposes a price change for one night. The server reads the current price and the floor itself. */
export async function proposeRateChangeAction(stayDate: string, channel: string, priceText: string): Promise<ActionState> {
  return safely("proposeRateChange", async () => {
    const cents = dollarsToCents(priceText);
    if (cents === null || cents <= 0) return { error: "Enter a price like 32 or 32.50." };
    const { store, property, user } = await requireProperty();
    const d = await loadDashboard(store, property);
    const res = await proposeRateChange(
      { store, deps: buildRunnerDeps(store), property, userId: user.id, floorCents: d.floorCents, guardrails: d.guardrails, today: utcDay(new Date()) },
      { stayDate, channel, priceCents: cents },
    );
    if (!res.ok) return { error: res.error };
    refresh();
    return { ok: true, runId: res.runId, message: "Review it in Actions, then approve." };
  });
}

export async function loadSimulatedExampleAction(): Promise<ActionState> {
  return safely("loadSimulatedExample", async () => {
    const { store, property } = await requireProperty();
    const n = await loadSimulatedExample({ store, property, today: utcDay(new Date()) });
    refresh();
    return { ok: true, message: `Loaded ${n} simulated rates. They are examples, not real prices.` };
  });
}

const competitorSchema = z.string().trim().min(1, "Enter a name").max(80, "Use 80 characters or fewer");

export async function addCompetitorAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safely("addCompetitor", async () => {
    const parsed = competitorSchema.safeParse(fd.get("name"));
    if (!parsed.success) return { fieldErrors: { name: parsed.error.issues[0].message }, values: { name: String(fd.get("name") ?? "") } };
    const { store, property } = await requireProperty();
    try {
      await store.addCompetitor(property.id, parsed.data);
    } catch (e) {
      if (e instanceof Error && /already in your list|up to 8|up to 80/.test(e.message)) return { error: e.message, values: { name: parsed.data } };
      throw e;
    }
    refresh();
    return { ok: true, message: "Added. Upload rates for them, or load the example." };
  });
}

export async function removeCompetitorAction(id: string): Promise<ActionState> {
  return safely("removeCompetitor", async () => {
    if (!z.uuid().safeParse(id).success) return { error: "Invalid competitor." };
    const { store, property } = await requireProperty();
    await store.removeCompetitor(property.id, id);
    refresh();
    return { ok: true };
  });
}

export async function importRatesAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safely("importRates", async () => {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file to upload." };
    if (file.size > MAX_IMPORT_BYTES) return { error: "That file is larger than 5 MB. Split it into smaller files." };
    if (!/\.(csv|txt)$/i.test(file.name)) return { error: "Upload a .csv file. In Excel or Sheets, choose File > Save as > CSV." };
    const { store, property } = await requireProperty();
    const out = await importRatesText({ store, property, text: await file.text() });
    if (out.saved > 0) refresh();
    return out.ok ? { ok: true, message: out.message, details: out.details } : { error: out.message, details: out.details };
  });
}

const pctField = (label: string, max: number) =>
  z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : Number(s.replace("%", ""))))
    .refine((n) => n === null || (Number.isFinite(n) && n >= 0 && n <= max), `${label} must be between 0 and ${max}`);

/** Per-site commission and member discount. A blank field means "use the standard rate". */
export async function saveOtaSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safely("saveOtaSettings", async () => {
    const { store, property, user } = await requireProperty();
    if (!(await store.listMembers(property.id)).some((m) => m.userId === user.id && m.role === "owner")) return { error: "Only the owner can change booking site fees." };
    const errors: Record<string, string> = {};
    const values: Record<string, string> = {};
    const next: OtaSettings = {};
    for (const id of property.otas) {
      const c = String(fd.get(`commission_${id}`) ?? "");
      const m = String(fd.get(`member_${id}`) ?? "");
      values[`commission_${id}`] = c;
      values[`member_${id}`] = m;
      const cp = pctField("Commission", 40).safeParse(c);
      const mp = pctField("Member discount", 50).safeParse(m);
      if (!cp.success) errors[`commission_${id}`] = cp.error.issues[0].message;
      if (!mp.success) errors[`member_${id}`] = mp.error.issues[0].message;
      if (cp.success && mp.success) {
        const entry: { commission?: number; memberDiscount?: number } = {};
        if (cp.data !== null) entry.commission = cp.data / 100;
        if (mp.data !== null) entry.memberDiscount = mp.data / 100;
        if (Object.keys(entry).length > 0) next[id] = entry;
      }
    }
    if (Object.keys(errors).length > 0) return { fieldErrors: errors, values };
    // Keep settings for sites the hostel no longer lists, so re-adding one does not lose its numbers.
    const kept = Object.fromEntries(Object.entries(property.otaSettings).filter(([id]) => !property.otas.includes(id) && id in KNOWN_OTAS));
    await store.updateProperty(property.id, { otaSettings: { ...kept, ...next } });
    refresh();
    return { ok: true, message: "Saved. Prices below now use these fees." };
  });
}
