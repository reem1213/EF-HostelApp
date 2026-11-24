import { centsFromDecimal } from "../domain/money";
import type { Booking, Channel, DateRange } from "../domain/types";
import { IntegrationError, type PmsConnector, type PmsSnapshot } from "./connectors";

/**
 * Cloudbeds PMS connector (API v1.2).
 *
 * Cloudbeds credentials must never reach the browser. This connector runs on
 * the server only (it is imported from server code and never from a client
 * component). Point `baseUrl` at a server-side proxy route that holds the token.
 *
 * Verify against the live Cloudbeds reference before go-live:
 *  - the reservations endpoint and its date/paging parameters below;
 *  - that one reservation equals one bed-stay (true for most dorm bookings).
 */

const COUNTED_STATUSES = new Set(["confirmed", "checked_in", "checked_out"]);
const OTA_SOURCES = ["booking.com", "expedia", "airbnb", "hostelworld", "agoda", "hotels.com"];
const DIRECT_SOURCES = ["direct", "website", "front desk", "walk", "phone", "email", "hostel"];

export function channelFromSource(source: string): Channel {
  const s = source.toLowerCase();
  if (OTA_SOURCES.some((o) => s.includes(o))) return "ota";
  if (!s) return "other";
  if (DIRECT_SOURCES.some((d) => s.includes(d))) return "direct";
  return "other";
}

/** Maps one reservation. Returns null when it should not count as occupancy. */
export function parseReservation(r: Record<string, unknown>): Booking | null {
  const status = String(r.status ?? "").toLowerCase();
  if (!COUNTED_STATUSES.has(status)) return null;

  const checkIn = new Date(String(r.checkIn));
  const checkOut = new Date(String(r.checkOut));
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) return null;
  const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000);
  if (nights <= 0) return null;

  const id = String(r.reservationID ?? r.reservationId ?? `${r.checkIn}-${r.checkOut}`);
  return {
    id,
    channel: channelFromSource(String(r.sourceName ?? "")),
    revenueCents: centsFromDecimal(r.total ?? r.grandTotal),
    nights,
    checkIn,
  };
}

/** Parses a `{ success, data: [...] }` envelope. Exported for tests. */
export function parseReservationsPage(json: unknown): Booking[] {
  if (typeof json !== "object" || json === null) {
    throw new IntegrationError("Cloudbeds PMS", "Unexpected response shape");
  }
  const env = json as Record<string, unknown>;
  if (env.success === false) {
    throw new IntegrationError("Cloudbeds PMS", String(env.message ?? "request failed"));
  }
  if (!Array.isArray(env.data)) return [];
  return env.data
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map(parseReservation)
    .filter((b): b is Booking => b !== null);
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export class CloudbedsConnector implements PmsConnector {
  readonly name = "Cloudbeds PMS";

  constructor(
    private readonly opts: {
      propertyId: string;
      /** Server-side proxy base, e.g. https://app.example.com/api/cloudbeds */
      baseUrl: string;
      headers?: Record<string, string>;
      pageSize?: number;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async fetchPeriod(period: DateRange): Promise<PmsSnapshot> {
    const pageSize = this.opts.pageSize ?? 100;
    const doFetch = this.opts.fetchImpl ?? fetch;
    const bookings: Booking[] = [];

    for (let page = 1; page <= 200; page++) {
      const url = new URL(`${this.opts.baseUrl.replace(/\/$/, "")}/getReservations`);
      url.searchParams.set("propertyID", this.opts.propertyId);
      url.searchParams.set("checkInFrom", isoDate(period.start));
      url.searchParams.set("checkInTo", isoDate(new Date(period.end.getTime() - 86_400_000)));
      url.searchParams.set("pageNumber", String(page));
      url.searchParams.set("pageSize", String(pageSize));

      const res = await doFetch(url, { headers: this.opts.headers, cache: "no-store" });
      if (!res.ok) {
        throw new IntegrationError(this.name, `HTTP ${res.status} while reading reservations`);
      }
      const rows = parseReservationsPage(await res.json());
      bookings.push(...rows);
      if (rows.length < pageSize) {
        return { bookings, occupiedBedNights: bookings.reduce((s, b) => s + b.nights, 0) };
      }
    }
    throw new IntegrationError(this.name, "Too many pages; narrow the period");
  }
}
