"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { buildRunnerDeps } from "@/lib/automation/registry";
import { proposeRun } from "@/lib/automation/runner";
import { resolveOta } from "@/lib/domain/ota";
import { draftBrandBiddingRequest, nextStatus } from "@/lib/domain/tickets";
import { requireProperty } from "@/lib/session";
import { safely } from "./safe";
import type { ActionState } from "./types";

const refresh = () => revalidatePath("/", "layout");

/** Writes a draft request for each chosen booking site that does not have one yet. Nothing is sent: submission is manual. */
export async function draftTicketsAction(otaIds: string[]): Promise<ActionState> {
  return safely("draftTickets", async () => {
    const { store, property, user } = await requireProperty();
    const chosen = [...new Set(otaIds)].filter((id) => property.otas.includes(id));
    if (chosen.length === 0) return { error: "Choose at least one of your booking sites." };

    const existing = new Set((await store.listTickets(property.id)).map((t) => t.otaId));
    const deps = buildRunnerDeps(store);
    let made = 0;
    for (const id of chosen) {
      if (existing.has(id)) continue;
      const name = resolveOta(id, property.otaSettings).name;
      const draft = draftBrandBiddingRequest({ otaName: name, hostelName: property.name, website: property.website, contactEmail: property.replyToEmail });
      await store.upsertTicket(property.id, { otaId: id, status: "draft", ...draft });
      await proposeRun(deps, property.id, {
        kind: "ticket_draft",
        title: `Ask ${name} to stop bidding on our name`,
        params: { summary: `Request drafted for ${name}. Send it yourself, then mark it submitted.`, otaId: id, subject: draft.subject },
        createdBy: user.id,
      });
      made++;
    }
    refresh();
    return { ok: true, message: made === 0 ? "Those already have drafts." : `Drafted ${made} request${made === 1 ? "" : "s"}. Send each one yourself.` };
  });
}

/** Moves a request forward: draft, submitted, answered. */
export async function advanceTicketAction(otaId: string): Promise<ActionState> {
  return safely("advanceTicket", async () => {
    if (!z.string().min(1).max(40).safeParse(otaId).success) return { error: "Invalid booking site." };
    const { store, property } = await requireProperty();
    const t = (await store.listTickets(property.id)).find((x) => x.otaId === otaId);
    if (!t) return { error: "That request does not exist." };
    const next = nextStatus(t.status);
    if (!next) return { error: "That request is already answered." };
    await store.upsertTicket(property.id, { otaId, status: next, subject: t.subject, body: t.body });
    refresh();
    return { ok: true };
  });
}
