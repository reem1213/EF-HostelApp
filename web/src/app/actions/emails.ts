"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { buildRunnerDeps } from "@/lib/automation/registry";
import { proposeRun } from "@/lib/automation/runner";
import { audienceReport } from "@/lib/domain/email-audience";
import { emailSettingsFor } from "@/lib/email/config";
import { TEMPLATE_INFO } from "@/lib/email/templates";
import { utcDay } from "@/lib/period";
import { requireProperty } from "@/lib/session";
import { safely } from "./safe";
import type { ActionState } from "./types";

const schema = z.object({
  template: z.enum(["welcome_back", "seasonal", "review_request"], { error: "Choose a template" }),
  code: z.string().trim().max(30, "Use 30 characters or fewer").regex(/^[A-Za-z0-9_-]*$/, "Use letters, numbers, - or _ only"),
  discountPct: z.string().trim().refine((s) => s === "" || (/^\d{1,2}$/.test(s) && Number(s) >= 1 && Number(s) <= 90), "Enter a whole number from 1 to 90, or leave it blank"),
});

/** Proposes a repeat-guest campaign. Nothing is sent until it is approved in Actions. */
export async function proposeCampaignAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safely("proposeCampaign", async () => {
    const values = { template: String(fd.get("template") ?? ""), code: String(fd.get("code") ?? ""), discountPct: String(fd.get("discountPct") ?? "") };
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
      return { fieldErrors: errors, values };
    }
    const { store, property, user } = await requireProperty();
    if (!property.postalAddress.trim()) return { error: "Add your postal address in More first. It is required on every marketing email.", values };
    if (!property.replyToEmail.trim()) return { error: "Add a reply-to email in More first, so guests can reach you.", values };
    if (!emailSettingsFor(property)) return { error: "Email is not set up on the server yet (UNSUBSCRIBE_SECRET and NEXT_PUBLIC_SITE_URL).", values };

    const { emails } = audienceReport(await store.listBookings(property.id), await store.listSuppressions(property.id), utcDay(new Date()));
    if (emails.length === 0) return { error: "There are no guests with usable email addresses to write to yet.", values };

    const run = await proposeRun(buildRunnerDeps(store), property.id, {
      kind: "email_campaign",
      title: `Email ${emails.length} past guest${emails.length === 1 ? "" : "s"}: ${TEMPLATE_INFO[parsed.data.template].name}`,
      params: {
        summary: `${TEMPLATE_INFO[parsed.data.template].name} to ${emails.length} guest${emails.length === 1 ? "" : "s"}.`,
        template: parsed.data.template,
        ...(parsed.data.code ? { code: parsed.data.code } : {}),
        ...(parsed.data.discountPct ? { discountPct: Number(parsed.data.discountPct) } : {}),
      },
      createdBy: user.id,
    });
    revalidatePath("/", "layout");
    return { ok: true, runId: run.id, message: "Ready for your approval in Actions. Nothing is sent until you approve." };
  });
}
