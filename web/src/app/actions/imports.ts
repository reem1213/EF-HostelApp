"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { MAX_IMPORT_BYTES } from "@/lib/domain/import/parsers";
import { runImport } from "@/lib/import-service";
import { requireProperty } from "@/lib/session";
import type { ActionState } from "./types";

const kindSchema = z.enum(["bookings", "bank", "utilities", "schedule", "expenses"]);

export async function importFile(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store, property } = await requireProperty();

  const kind = kindSchema.safeParse(fd.get("kind"));
  if (!kind.success) return { error: "Choose what kind of file this is." };

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file to upload." };
  if (file.size > MAX_IMPORT_BYTES) return { error: "That file is larger than 5 MB. Split it into smaller files." };
  if (!/\.(csv|txt)$/i.test(file.name)) {
    return { error: "Upload a .csv file. In Excel or Sheets, choose File > Save as > CSV." };
  }

  const out = await runImport({ store, property, kind: kind.data, filename: file.name, text: await file.text() });
  if (out.rowsOk > 0) revalidatePath("/", "layout");

  const details = out.errors.slice(0, 8).map((e) => (e.line > 0 ? `Line ${e.line}: ${e.message}` : e.message));
  if (out.errors.length > 8) details.push(`…and ${out.errors.length - 8} more.`);
  return out.ok ? { ok: true, message: out.message, details } : { error: out.message, details };
}
