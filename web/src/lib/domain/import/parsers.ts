import Papa from "papaparse";

import { centsFromDecimal } from "../money";
import type { Channel, ExpenseCategory } from "../types";

/**
 * CSV import parsers. Pure functions: text in, typed rows plus per-row errors out.
 * Nothing is dropped silently: every skipped row is reported with its line number.
 */

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 20_000;

export type ImportKind = "bookings" | "bank" | "utilities" | "schedule" | "expenses";

export type RowError = { line: number; message: string };

export type BookingRow = {
  externalId: string;
  guestKey: string | null;
  channel: Channel;
  checkIn: Date;
  nights: number;
  revenueCents: number;
};

export type ExpenseRow = {
  date: Date;
  amountCents: number;
  merchant: string;
  category: ExpenseCategory;
};

export type ShiftRow = {
  employee: string;
  date: Date;
  hours: number;
  hourlyRateCents: number;
};

export type ParseResult<T> = { rows: T[]; errors: RowError[]; totalRows: number };

// ---- CSV plumbing ---------------------------------------------------------

const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

type Raw = Record<string, string>;

export function readCsv(text: string): { rows: Raw[]; error?: string } {
  if (text.length > MAX_IMPORT_BYTES) return { rows: [], error: "File is larger than 5 MB." };
  const res = Papa.parse<Raw>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normHeader,
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });
  if (res.data.length > MAX_IMPORT_ROWS) return { rows: [], error: `More than ${MAX_IMPORT_ROWS} rows. Split the file.` };
  if (res.data.length === 0) return { rows: [], error: "No data rows found." };
  return { rows: res.data };
}

export function pick(row: Raw, names: string[]): string {
  for (const n of names) {
    const v = row[n];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

export const hasColumn = (rows: Raw[], names: string[]) => names.some((n) => rows.some((r) => n in r));

// ---- dates ----------------------------------------------------------------

export type DateOrder = "mdy" | "dmy";

/** Detects d/m/y vs m/d/y from the data: any first part above 12 means day first. */
export function detectDateOrder(values: string[], fallback: DateOrder = "mdy"): DateOrder {
  let mdy = false;
  let dmy = false;
  for (const v of values) {
    const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/);
    if (!m) continue;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  if (dmy && !mdy) return "dmy";
  if (mdy && !dmy) return "mdy";
  return fallback;
}

export function parseDate(value: string, order: DateOrder): Date | null {
  const v = value.trim();
  if (!v) return null;
  let y: number, mo: number, d: number;
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    y = Number(m[3]);
    if (y < 100) y += 2000;
    [mo, d] = order === "mdy" ? [a, b] : [b, a];
  } else {
    return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  // Reject overflow such as Feb 31.
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

const DAY = 86_400_000;

// ---- bookings -------------------------------------------------------------

const OTA = ["booking.com", "expedia", "airbnb", "hostelworld", "agoda", "hotels.com", "trip.com"];
const DIRECT = ["direct", "website", "front desk", "walk", "phone", "email", "own site", "booking engine"];

export function channelFromSource(source: string): Channel {
  const s = source.toLowerCase();
  if (OTA.some((o) => s.includes(o))) return "ota";
  if (!s) return "other";
  if (DIRECT.some((d) => s.includes(d))) return "direct";
  return "other";
}

const SKIP_STATUS = ["cancel", "no show", "noshow", "no-show", "void", "declined"];

export function parseBookingsCsv(text: string, dateOrderFallback: DateOrder = "mdy"): ParseResult<BookingRow> {
  const { rows, error } = readCsv(text);
  if (error) return { rows: [], errors: [{ line: 0, message: error }], totalRows: 0 };

  const IN = ["checkin", "checkindate", "arrival", "arrivaldate", "startdate", "from"];
  const OUT = ["checkout", "checkoutdate", "departure", "departuredate", "enddate", "to"];
  if (!hasColumn(rows, IN) || !hasColumn(rows, OUT)) {
    return {
      rows: [],
      errors: [{ line: 1, message: "Need check-in and check-out columns (e.g. 'Check-in', 'Check-out')." }],
      totalRows: rows.length,
    };
  }

  const order = detectDateOrder(rows.flatMap((r) => [pick(r, IN), pick(r, OUT)]), dateOrderFallback);
  const out: BookingRow[] = [];
  const errors: RowError[] = [];

  rows.forEach((r, i) => {
    const line = i + 2; // header is line 1
    const status = pick(r, ["status", "reservationstatus"]).toLowerCase();
    if (SKIP_STATUS.some((s) => status.includes(s))) return;

    const checkIn = parseDate(pick(r, IN), order);
    const checkOut = parseDate(pick(r, OUT), order);
    if (!checkIn || !checkOut) {
      errors.push({ line, message: "Unreadable check-in or check-out date." });
      return;
    }
    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / DAY);
    if (nights <= 0) {
      errors.push({ line, message: "Check-out is not after check-in." });
      return;
    }
    const email = pick(r, ["email", "guestemail", "bookeremail"]).toLowerCase();
    const name = pick(r, ["guest", "guestname", "name", "fullname"]).toLowerCase();
    const revenueRaw = pick(r, ["total", "totalamount", "grandtotal", "amount", "revenue", "price", "totalprice"]);
    out.push({
      externalId: pick(r, ["reservationid", "reservation", "bookingid", "booking", "confirmation", "id"]) || `row-${line}`,
      guestKey: email || name || null,
      channel: channelFromSource(pick(r, ["source", "sourcename", "channel", "origin", "bookingsource"])),
      checkIn,
      nights,
      revenueCents: centsFromDecimal(revenueRaw.replace(/[^0-9.,-]/g, "")),
    });
  });
  return { rows: out, errors, totalRows: rows.length };
}

// ---- expense categorisation ----------------------------------------------

const RULES: [ExpenseCategory, string[]][] = [
  ["channel_commission", ["booking.com", "hostelworld", "expedia", "airbnb", "agoda", "hotels.com", "commission"]],
  ["laundry", ["laundry", "linen", "launder", "wash", "dry clean", "cleanco"]],
  ["utilities", ["electric", "power", "water", "gas", "energy", "internet", "comcast", "verizon", "utility", "utilities", "sewer", "waste", "trash"]],
  ["staff", ["payroll", "gusto", "adp", "salary", "wages", "paychex", "staff"]],
  ["rent", ["rent", "lease", "landlord", "property mgmt", "mortgage"]],
  ["breakfast", ["bakery", "breakfast", "grocer", "safeway", "kroger", "whole foods", "coffee", "milk", "eggs"]],
  ["software", ["cloudbeds", "hostaway", "little hotelier", "mailchimp", "slack", "zoom", "canva", "google workspace", "quickbooks", "xero", "notion", "dropbox", "subscription", "saas"]],
  ["supplies", ["supply", "supplies", "depot", "costco", "home depot", "ikea", "amazon", "cleaning", "janitorial"]],
];

export function categorize(description: string): ExpenseCategory {
  const d = description.toLowerCase();
  for (const [cat, words] of RULES) if (words.some((w) => d.includes(w))) return cat;
  return "other";
}

export const toCents = (raw: string) => {
  const cleaned = raw.replace(/[^0-9.,()-]/g, "");
  const negative = cleaned.includes("(") || cleaned.startsWith("-");
  const cents = centsFromDecimal(cleaned.replace(/[()-]/g, ""));
  return negative ? -cents : cents;
};

// ---- bank statements ------------------------------------------------------

/**
 * Bank/card summaries. Spend is read from a debit column, or from the amount
 * column: negatives are spend when any exist, otherwise positives are spend
 * (card exports usually list charges as positives). Credits/deposits are skipped.
 */
export function parseBankCsv(text: string, dateOrderFallback: DateOrder = "mdy"): ParseResult<ExpenseRow> {
  const { rows, error } = readCsv(text);
  if (error) return { rows: [], errors: [{ line: 0, message: error }], totalRows: 0 };

  const DATE = ["date", "transactiondate", "postingdate", "posteddate", "bookingdate"];
  const DESC = ["description", "merchant", "payee", "details", "name", "memo", "narrative"];
  if (!hasColumn(rows, DATE) || !hasColumn(rows, DESC)) {
    return {
      rows: [],
      errors: [{ line: 1, message: "Need a date column and a description column." }],
      totalRows: rows.length,
    };
  }
  const debitCol = hasColumn(rows, ["debit", "withdrawal", "withdrawals", "moneyout"]);
  const amounts = rows.map((r) => toCents(pick(r, ["amount", "transactionamount", "value"])));
  const anyNegative = amounts.some((a) => a < 0);

  const order = detectDateOrder(rows.map((r) => pick(r, DATE)), dateOrderFallback);
  const out: ExpenseRow[] = [];
  const errors: RowError[] = [];

  rows.forEach((r, i) => {
    const line = i + 2;
    const date = parseDate(pick(r, DATE), order);
    if (!date) {
      errors.push({ line, message: "Unreadable date." });
      return;
    }
    const merchant = pick(r, DESC);
    if (!merchant) {
      errors.push({ line, message: "Missing description." });
      return;
    }
    let spend = 0;
    if (debitCol) {
      spend = Math.abs(toCents(pick(r, ["debit", "withdrawal", "withdrawals", "moneyout"])));
    } else {
      const a = amounts[i];
      spend = anyNegative ? (a < 0 ? -a : 0) : a > 0 ? a : 0;
    }
    if (spend <= 0) return; // deposit, refund or empty
    out.push({ date, amountCents: spend, merchant, category: categorize(merchant) });
  });
  return { rows: out, errors, totalRows: rows.length };
}

// ---- utility bills --------------------------------------------------------

export function parseUtilitiesCsv(text: string, dateOrderFallback: DateOrder = "mdy"): ParseResult<ExpenseRow> {
  const { rows, error } = readCsv(text);
  if (error) return { rows: [], errors: [{ line: 0, message: error }], totalRows: 0 };
  if (!hasColumn(rows, ["date", "billdate", "invoicedate", "duedate"]) || !hasColumn(rows, ["amount", "total", "amountdue", "cost"])) {
    return { rows: [], errors: [{ line: 1, message: "Need date and amount columns." }], totalRows: rows.length };
  }
  const order = detectDateOrder(rows.map((r) => pick(r, ["date", "billdate", "invoicedate", "duedate"])), dateOrderFallback);
  const out: ExpenseRow[] = [];
  const errors: RowError[] = [];
  rows.forEach((r, i) => {
    const line = i + 2;
    const date = parseDate(pick(r, ["date", "billdate", "invoicedate", "duedate"]), order);
    const cents = Math.abs(toCents(pick(r, ["amount", "total", "amountdue", "cost"])));
    if (!date) return void errors.push({ line, message: "Unreadable date." });
    if (cents <= 0) return void errors.push({ line, message: "Missing or zero amount." });
    out.push({
      date,
      amountCents: cents,
      merchant: pick(r, ["provider", "vendor", "utility", "supplier", "description"]) || "Utility bill",
      category: "utilities",
    });
  });
  return { rows: out, errors, totalRows: rows.length };
}

// ---- generic expenses (invoices / receipts log) ---------------------------

const CATEGORY_NAMES = new Set<string>(["laundry", "utilities", "staff", "software", "channel_commission", "supplies", "rent", "breakfast", "other"]);

export function parseExpensesCsv(text: string, dateOrderFallback: DateOrder = "mdy"): ParseResult<ExpenseRow> {
  const { rows, error } = readCsv(text);
  if (error) return { rows: [], errors: [{ line: 0, message: error }], totalRows: 0 };
  if (!hasColumn(rows, ["date"]) || !hasColumn(rows, ["amount", "total"])) {
    return { rows: [], errors: [{ line: 1, message: "Need date and amount columns." }], totalRows: rows.length };
  }
  const order = detectDateOrder(rows.map((r) => pick(r, ["date"])), dateOrderFallback);
  const out: ExpenseRow[] = [];
  const errors: RowError[] = [];
  rows.forEach((r, i) => {
    const line = i + 2;
    const date = parseDate(pick(r, ["date"]), order);
    const cents = Math.abs(toCents(pick(r, ["amount", "total"])));
    const merchant = pick(r, ["vendor", "merchant", "supplier", "description", "payee"]);
    if (!date) return void errors.push({ line, message: "Unreadable date." });
    if (cents <= 0) return void errors.push({ line, message: "Missing or zero amount." });
    if (!merchant) return void errors.push({ line, message: "Missing vendor." });
    const given = pick(r, ["category", "type"]).toLowerCase().replace(/\s+/g, "_");
    out.push({
      date,
      amountCents: cents,
      merchant,
      category: CATEGORY_NAMES.has(given) ? (given as ExpenseCategory) : categorize(`${merchant} ${given}`),
    });
  });
  return { rows: out, errors, totalRows: rows.length };
}

// ---- employee schedule ----------------------------------------------------

const parseClock = (v: string): number | null => {
  const m = v.trim().toLowerCase().match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  return h + min / 60;
};

/** Reads hours directly, or start/end times. Needs an hourly rate column. */
export function parseScheduleCsv(text: string, dateOrderFallback: DateOrder = "mdy"): ParseResult<ShiftRow> {
  const { rows, error } = readCsv(text);
  if (error) return { rows: [], errors: [{ line: 0, message: error }], totalRows: 0 };
  const hasHours = hasColumn(rows, ["hours", "hoursworked", "duration"]);
  const hasTimes = hasColumn(rows, ["start", "starttime", "clockin"]) && hasColumn(rows, ["end", "endtime", "clockout"]);
  if (!hasColumn(rows, ["employee", "name", "staff", "staffmember"]) || !hasColumn(rows, ["date", "shiftdate", "day"]) || (!hasHours && !hasTimes)) {
    return {
      rows: [],
      errors: [{ line: 1, message: "Need employee, date, and either hours or start/end times (plus an hourly rate)." }],
      totalRows: rows.length,
    };
  }
  const order = detectDateOrder(rows.map((r) => pick(r, ["date", "shiftdate", "day"])), dateOrderFallback);
  const out: ShiftRow[] = [];
  const errors: RowError[] = [];
  rows.forEach((r, i) => {
    const line = i + 2;
    const date = parseDate(pick(r, ["date", "shiftdate", "day"]), order);
    if (!date) return void errors.push({ line, message: "Unreadable date." });
    let hours = Number(pick(r, ["hours", "hoursworked", "duration"]));
    if (!Number.isFinite(hours) || hours <= 0) {
      const s = parseClock(pick(r, ["start", "starttime", "clockin"]));
      const e = parseClock(pick(r, ["end", "endtime", "clockout"]));
      if (s === null || e === null) return void errors.push({ line, message: "No readable hours or start/end times." });
      hours = e >= s ? e - s : e + 24 - s; // overnight shift
    }
    if (hours <= 0 || hours > 24) return void errors.push({ line, message: "Hours must be between 0 and 24." });
    const rate = centsFromDecimal(pick(r, ["rate", "hourlyrate", "payrate", "wage"]).replace(/[^0-9.]/g, ""));
    if (rate <= 0) return void errors.push({ line, message: "Missing hourly rate." });
    out.push({
      employee: pick(r, ["employee", "name", "staff", "staffmember"]),
      date,
      hours: Math.round(hours * 100) / 100,
      hourlyRateCents: rate,
    });
  });
  return { rows: out, errors, totalRows: rows.length };
}

export const laborCostCents = (shifts: ShiftRow[]) =>
  shifts.reduce((s, x) => s + Math.round(x.hours * x.hourlyRateCents), 0);

export const IMPORT_KINDS: { kind: ImportKind; label: string; hint: string; columns: string }[] = [
  { kind: "bookings", label: "Bookings (PMS export)", hint: "Reservations from Cloudbeds, Hostaway or Little Hotelier.", columns: "check-in, check-out, source, total, guest email, status" },
  { kind: "bank", label: "Bank or card summary", hint: "Statement export from your bank or card.", columns: "date, description, amount (or debit/credit)" },
  { kind: "utilities", label: "Utility bills", hint: "Electric, water, gas, internet bills.", columns: "date, provider, amount" },
  { kind: "schedule", label: "Employee schedule", hint: "Shifts with hours and pay rate.", columns: "employee, date, hours (or start/end), hourly rate" },
  { kind: "expenses", label: "Invoices and receipts log", hint: "A list of invoices or receipts you have paid.", columns: "date, vendor, amount, category" },
];
