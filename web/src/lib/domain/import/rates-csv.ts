import { DORM_BED } from "../guardrails";
import { OTA_OPTIONS } from "../profile";
import { detectDateOrder, hasColumn, parseDate, pick, readCsv, toCents, type DateOrder, type ParseResult } from "./parsers";

export const MAX_RATE_ROWS = 5000;

export type RateImportRow = {
  stayDate: Date;
  kind: "own" | "competitor";
  /** For own rows: "direct" or an OTA id. */
  channel?: string;
  /** For competitor rows: their name as written. */
  competitorName?: string;
  roomType: string;
  priceCents: number;
  discountedPriceCents: number | null;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const OWN: Record<string, string> = { direct: "direct", ...Object.fromEntries(OTA_OPTIONS.flatMap((o) => [[norm(o.id), o.id], [norm(o.name), o.id]])) };

const DATE = ["date", "night", "staydate", "stay"];
const CHANNEL = ["channel", "source", "competitor", "name", "ota", "property"];
const PRICE = ["price", "rate", "listprice", "amount"];
const MEMBER = ["discountedprice", "memberprice", "geniusprice", "discounted"];
const ROOM = ["roomtype", "room", "type"];

/** Rates for your own channels and for competitors, one row per night per channel. */
export function parseRatesCsv(text: string, dateOrderFallback: DateOrder = "mdy"): ParseResult<RateImportRow> {
  const { rows, error } = readCsv(text);
  if (error) return { rows: [], errors: [{ line: 0, message: error }], totalRows: 0 };
  if (rows.length > MAX_RATE_ROWS) return { rows: [], errors: [{ line: 0, message: `More than ${MAX_RATE_ROWS.toLocaleString("en-US")} rows. Split the file.` }], totalRows: rows.length };
  if (!hasColumn(rows, DATE) || !hasColumn(rows, CHANNEL) || !hasColumn(rows, PRICE)) {
    return { rows: [], errors: [{ line: 1, message: "Need date, channel and price columns (for example 'Date', 'Channel', 'Price')." }], totalRows: rows.length };
  }

  const order = detectDateOrder(rows.map((r) => pick(r, DATE)), dateOrderFallback);
  const out: RateImportRow[] = [];
  const errors: { line: number; message: string }[] = [];

  rows.forEach((r, i) => {
    const line = i + 2;
    const stayDate = parseDate(pick(r, DATE), order);
    if (!stayDate) return void errors.push({ line, message: "Unreadable date." });
    const label = pick(r, CHANNEL);
    if (!label) return void errors.push({ line, message: "Missing channel or competitor name." });

    const priceRaw = pick(r, PRICE);
    const price = toCents(priceRaw);
    if (!/\d/.test(priceRaw) || price <= 0) return void errors.push({ line, message: "Price must be a number above zero." });

    const memberRaw = pick(r, MEMBER);
    const member = memberRaw ? toCents(memberRaw) : null;
    if (member !== null && (member <= 0 || member >= price)) return void errors.push({ line, message: "A member price must be above zero and below the list price." });

    const own = OWN[norm(label)];
    out.push({
      stayDate,
      kind: own ? "own" : "competitor",
      ...(own ? { channel: own } : { competitorName: label }),
      roomType: pick(r, ROOM) || DORM_BED,
      priceCents: price,
      discountedPriceCents: member,
    });
  });
  return { rows: out, errors, totalRows: rows.length };
}
