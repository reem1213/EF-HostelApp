"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { buildRunnerDeps } from "@/lib/automation/registry";
import { checkRunParams } from "@/lib/automation/price-guard";
import { approveRun, AutomationError, proposeRun, rejectRun, undoRun } from "@/lib/automation/runner";
import { loadDashboard } from "@/lib/dashboard";
import { REASON_COPY } from "@/lib/domain/guardrails";
import { dollarsToCents, fieldErrors } from "@/lib/forms";
import { utcDay } from "@/lib/period";
import { requireProperty } from "@/lib/session";
import { safely } from "./safe";
import type { ActionState } from "./types";

const refresh = () => revalidatePath("/", "layout");
const runIdSchema = z.uuid();

async function context() {
  const ctx = await requireProperty();
  return { ...ctx, deps: buildRunnerDeps(ctx.store) };
}

/** Turns a fix that software can do into a proposed action, after checking it against the limits. */
async function proposeFindingAutomationImpl(findingId: string): Promise<ActionState> {
  const { store, property, user, deps } = await context();
  const d = await loadDashboard(store, property);
  const finding = d.actions.find((a) => a.id === findingId && a.automation);
  if (!finding?.automation) return { error: "That fix cannot be applied automatically." };

  if (finding.automation.kind === "price_update") {
    const check = checkRunParams(finding.automation.params, { floorCents: d.floorCents, guardrails: d.guardrails, today: utcDay(new Date()) });
    if (!check.ok) return { error: check.reasons.map((r) => REASON_COPY[r]).join(" ") };
  }
  const run = await proposeRun(deps, property.id, { kind: finding.automation.kind, title: finding.automation.label, params: finding.automation.params, createdBy: user.id });
  refresh();
  return { ok: true, runId: run.id, message: "Review it, then approve." };
}

async function approveRunImpl(runId: string): Promise<ActionState> {
  if (!runIdSchema.safeParse(runId).success) return { error: "Invalid action." };
  const { store, property, user, deps } = await context();
  const existing = await store.getRun(property.id, runId);
  if (!existing) return { error: "That action does not exist." };

  // Limits may have changed since it was proposed: check again before anything is applied.
  if (existing.kind === "price_update" && existing.status === "proposed") {
    const d = await loadDashboard(store, property);
    const check = checkRunParams(existing.params, { floorCents: d.floorCents, guardrails: d.guardrails, today: utcDay(new Date()) });
    if (!check.ok) return { error: check.reasons.map((r) => REASON_COPY[r]).join(" ") };
  }
  const run = await approveRun(deps, property.id, runId, user.id);
  refresh();
  if (run.status === "failed") return { error: run.error ?? "The action failed." };
  return { ok: true, message: run.simulated ? "Done inside HostelPulse. Nothing was sent to your PMS yet." : "Done." };
}

async function rejectRunImpl(runId: string): Promise<ActionState> {
  if (!runIdSchema.safeParse(runId).success) return { error: "Invalid action." };
  const { property, user, deps } = await context();
  await rejectRun(deps, property.id, runId, user.id);
  refresh();
  return { ok: true };
}

async function undoRunImpl(runId: string): Promise<ActionState> {
  if (!runIdSchema.safeParse(runId).success) return { error: "Invalid action." };
  const { property, user, deps } = await context();
  try {
    await undoRun(deps, property.id, runId, user.id);
  } catch (e) {
    if (e instanceof AutomationError) return { error: e.message };
    throw e;
  }
  refresh();
  return { ok: true, message: "Undone." };
}

const guardrailsSchema = z.object({
  marginPct: z.coerce.number({ error: "Enter a percentage" }).min(0, "At least 0%").max(200, "At most 200%"),
  maxChangePct: z.coerce.number({ error: "Enter a percentage" }).min(1, "At least 1%").max(100, "At most 100%"),
});

async function saveGuardrailsImpl(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store, property, user } = await context();
  const members = await store.listMembers(property.id);
  if (!members.some((m) => m.userId === user.id && m.role === "owner")) return { error: "Only the owner can change these limits." };

  const parsed = guardrailsSchema.safeParse({ marginPct: fd.get("marginPct"), maxChangePct: fd.get("maxChangePct") });
  const ceiling = dollarsToCents(fd.get("ceiling"));
  const errors = parsed.success ? {} : fieldErrors(parsed.error);
  if (ceiling === null) Object.assign(errors, { ceiling: "Enter an amount like 60 or 60.50, or leave it blank." });
  if (!parsed.success || ceiling === null) {
    return { fieldErrors: errors, values: { marginPct: String(fd.get("marginPct") ?? ""), maxChangePct: String(fd.get("maxChangePct") ?? ""), ceiling: String(fd.get("ceiling") ?? "") } };
  }
  await store.saveGuardrails(property.id, { minMarginPct: parsed.data.marginPct / 100, maxChangePctPerDay: parsed.data.maxChangePct / 100, ceilingCents: ceiling > 0 ? ceiling : null });
  refresh();
  return { ok: true, message: "Limits saved." };
}

export async function proposeFindingAutomation(findingId: string): Promise<ActionState> {
  return safely("proposeFindingAutomation", () => proposeFindingAutomationImpl(findingId));
}
export async function approveRunAction(runId: string): Promise<ActionState> {
  return safely("approveRun", () => approveRunImpl(runId));
}
export async function rejectRunAction(runId: string): Promise<ActionState> {
  return safely("rejectRun", () => rejectRunImpl(runId));
}
export async function undoRunAction(runId: string): Promise<ActionState> {
  return safely("undoRun", () => undoRunImpl(runId));
}
export async function saveGuardrailsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safely("saveGuardrails", () => saveGuardrailsImpl(_prev, fd));
}
