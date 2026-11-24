"use server";

import { revalidatePath } from "next/cache";

import { loadAudit } from "@/lib/data/audit-repository";
import { getAuditDeps } from "@/lib/services";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Marks a finding as done. Only ids the current audit actually produced are
 * accepted, so a client cannot write arbitrary rows.
 */
export async function markFindingDone(findingId: string): Promise<ActionResult> {
  if (typeof findingId !== "string" || findingId.length === 0 || findingId.length > 120) {
    return { ok: false, error: "Invalid finding" };
  }
  try {
    const deps = await getAuditDeps();
    const audit = await loadAudit(deps);
    if (!audit.findings.some((f) => f.id === findingId)) {
      return { ok: false, error: "That finding is no longer in the audit" };
    }
    await deps.store.markAddressed(deps.property.id, findingId);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save" };
  }
}
