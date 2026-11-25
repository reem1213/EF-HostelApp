import { createHash } from "node:crypto";

import type { Property, Store } from "./data/store";
import {
  MAX_IMPORT_BYTES,
  parseBankCsv,
  parseBookingsCsv,
  parseExpensesCsv,
  parseScheduleCsv,
  parseUtilitiesCsv,
  type DateOrder,
  type ImportKind,
  type RowError,
} from "./domain/import/parsers";

export type ImportOutcome = {
  ok: boolean;
  message: string;
  rowsOk: number;
  rowsFailed: number;
  errors: RowError[];
  /** True when this exact file was imported before and nothing was changed. */
  duplicate?: boolean;
};

/** US-style dates are month first; most other countries are day first. */
export const dateOrderFor = (country: string): DateOrder => (/^(us|usa|united states|ca|canada|ph|philippines)$/i.test(country.trim()) || country.trim() === "" ? "mdy" : "dmy");

const hashOf = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Parses an uploaded CSV and saves what is valid. Rows that cannot be read are
 * reported with line numbers and skipped; they never abort the whole file.
 * The same file cannot be imported twice.
 */
export async function runImport(args: {
  store: Store;
  property: Property;
  kind: ImportKind;
  filename: string;
  text: string;
}): Promise<ImportOutcome> {
  const { store, property, kind, filename, text } = args;

  if (Buffer.byteLength(text, "utf8") > MAX_IMPORT_BYTES) {
    return { ok: false, message: "That file is larger than 5 MB. Split it into smaller files.", rowsOk: 0, rowsFailed: 0, errors: [] };
  }

  const fileHash = hashOf(`${kind}\n${text}`);
  const existing = await store.findImportByHash(property.id, kind, fileHash);
  if (existing) {
    return { ok: true, duplicate: true, message: `You already imported this file on ${existing.createdAt.toISOString().slice(0, 10)}. Nothing was changed.`, rowsOk: 0, rowsFailed: 0, errors: [] };
  }

  const order = dateOrderFor(property.country);
  const record = (rowsOk: number, errors: RowError[]) =>
    store.recordImport(property.id, { kind, filename: filename.slice(0, 200), fileHash, rowsOk, rowsFailed: errors.length, errors: errors.slice(0, 50) });

  let rowsOk = 0;
  let errors: RowError[] = [];
  let summary = "";

  // Parse first, and only write when there is something valid to write.
  switch (kind) {
    case "bookings": {
      const r = parseBookingsCsv(text, order);
      errors = r.errors;
      if (r.rows.length > 0) {
        const imp = await record(r.rows.length, errors);
        const { inserted, updated } = await store.addBookings(property.id, imp.id, r.rows);
        rowsOk = r.rows.length;
        summary = `Imported ${inserted} new and updated ${updated} existing bookings.`;
      }
      break;
    }
    case "bank":
    case "utilities":
    case "expenses": {
      const r = kind === "bank" ? parseBankCsv(text, order) : kind === "utilities" ? parseUtilitiesCsv(text, order) : parseExpensesCsv(text, order);
      errors = r.errors;
      if (r.rows.length > 0) {
        const imp = await record(r.rows.length, errors);
        await store.addExpenses(property.id, imp.id, r.rows);
        rowsOk = r.rows.length;
        summary = `Imported ${r.rows.length} charges and sorted them into categories.`;
      }
      break;
    }
    case "schedule": {
      const r = parseScheduleCsv(text, order);
      errors = r.errors;
      if (r.rows.length > 0) {
        const imp = await record(r.rows.length, errors);
        await store.addShifts(property.id, imp.id, r.rows);
        rowsOk = r.rows.length;
        summary = `Imported ${r.rows.length} shifts.`;
      }
      break;
    }
  }

  if (rowsOk === 0) {
    return {
      ok: false,
      message: errors[0]?.message ? `Nothing was imported. ${errors[0].message}` : "Nothing was imported. No usable rows were found.",
      rowsOk: 0,
      rowsFailed: errors.length,
      errors,
    };
  }
  return {
    ok: true,
    message: errors.length > 0 ? `${summary} ${errors.length} row${errors.length === 1 ? " was" : "s were"} skipped.` : summary,
    rowsOk,
    rowsFailed: errors.length,
    errors,
  };
}
