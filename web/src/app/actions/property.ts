"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { loadDashboard } from "@/lib/dashboard";
import type { CostInputs } from "@/lib/domain/costs";
import { echo, fieldErrors, readCostFields } from "@/lib/forms";
import { monthOf } from "@/lib/period";
import { requireProperty, requireSession } from "@/lib/session";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";
import { expenseCategorySchema } from "@/lib/validation";
import type { ActionState } from "./types";

const refresh = () => revalidatePath("/", "layout");

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid month");

const toInputs = (month: string, c: ReturnType<typeof readCostFields>["cents"]): CostInputs => ({
  month,
  rentCents: c.rent,
  utilitiesCents: c.utilities,
  staffCents: c.staff,
  laundryCents: c.laundry,
  breakfastCents: c.breakfast,
});

const propertySchema = z.object({
  name: z.string().trim().min(1, "Enter your hostel's name").max(120),
  beds: z.coerce.number({ error: "Enter the number of beds" }).int("Whole beds only").min(1, "At least 1 bed").max(2000, "That seems too many"),
  country: z.string().trim().max(60).default(""),
});

export async function completeOnboarding(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireSession();
  if (await session.store.getProperty(session.user.id)) redirect("/");

  const p = propertySchema.safeParse({ name: fd.get("name"), beds: fd.get("beds"), country: fd.get("country") ?? "" });
  const costs = readCostFields(fd);
  if (!p.success || Object.keys(costs.errors).length > 0) {
    return {
      fieldErrors: { ...(p.success ? {} : fieldErrors(p.error)), ...costs.errors },
      values: echo(fd, ["name", "beds", "country", "rent", "utilities", "staff", "laundry", "breakfast"]),
    };
  }

  const property = await session.store.createProperty(session.user.id, { ...p.data, currency: "USD" });
  await session.store.saveCostInputs(property.id, toInputs(monthOf(new Date()), costs.cents));
  refresh();
  redirect("/");
}

export async function saveCosts(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store, property } = await requireProperty();
  const month = monthSchema.safeParse(fd.get("month"));
  if (!month.success) return { error: "Invalid month." };
  const costs = readCostFields(fd);
  if (Object.keys(costs.errors).length > 0) return { fieldErrors: costs.errors, values: echo(fd, ["rent", "utilities", "staff", "laundry", "breakfast"]) };

  await store.saveCostInputs(property.id, toInputs(month.data, costs.cents));
  refresh();
  return { ok: true, message: "Costs saved. Cost per bed has been updated." };
}

export async function saveReview(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store, property } = await requireProperty();
  const parsed = z
    .object({
      month: monthSchema,
      rating: z.coerce.number({ error: "Enter your rating" }).min(1, "Between 1 and 5").max(5, "Between 1 and 5"),
      reviewCount: z.coerce.number({ error: "Enter the review count" }).int().min(0).max(1_000_000),
      impressions: z.preprocess((v) => (v === "" || v === null ? null : v), z.coerce.number().int().min(0).max(1_000_000_000).nullable()),
    })
    .safeParse({ month: fd.get("month"), rating: fd.get("rating"), reviewCount: fd.get("reviewCount"), impressions: fd.get("impressions") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: echo(fd, ["rating", "reviewCount", "impressions"]) };

  await store.saveReviewSnapshot(property.id, { ...parsed.data, rating: Math.round(parsed.data.rating * 10) / 10 });
  refresh();
  return { ok: true, message: "Saved. Your next steps have been updated." };
}

/** Marks a fix as done. Only ids the current audit actually produced are accepted. */
export async function markFindingDone(findingId: string): Promise<ActionState> {
  if (typeof findingId !== "string" || findingId.length === 0 || findingId.length > 120) return { error: "Invalid fix." };
  const { store, property } = await requireProperty();
  const d = await loadDashboard(store, property);
  const valid = d.actions.some((a) => a.id === findingId && a.kind !== "setup");
  if (!valid) return { error: "That fix is no longer in your list." };
  await store.markAddressed(property.id, findingId);
  refresh();
  return { ok: true };
}

/** Lets the manager correct an automatic category on an imported charge. */
export async function recategorizeExpense(expenseId: string, category: string): Promise<ActionState> {
  const { store, property } = await requireProperty();
  const id = z.uuid().safeParse(expenseId);
  const cat = expenseCategorySchema.safeParse(category);
  if (!id.success || !cat.success) return { error: "Invalid change." };
  await store.updateExpenseCategory(property.id, id.data, cat.data);
  refresh();
  return { ok: true };
}

export async function changePassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  if (!supabaseConfigured()) return { error: "Accounts are not switched on for this deployment." };
  const pw = z.string().min(10, "Use at least 10 characters").max(200).safeParse(fd.get("password"));
  if (!pw.success) return { fieldErrors: { password: pw.error.issues[0].message } };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) return { error: error.message };
  return { ok: true, message: "Password updated." };
}
