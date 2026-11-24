import { describe, expect, it } from "vitest";

import { centsFromDecimal, dollars, dollarsExact } from "../domain/money";
import { currentWindow, demoDeps, loadAudit, MemoryFindingStore, previousWindow } from "../data/audit-repository";
import { channelFromSource, CloudbedsConnector, parseReservationsPage } from "./cloudbeds";
import { IntegrationError } from "./connectors";
import { DemoBankFeed, DemoPms } from "./demo-data";

describe("money helpers", () => {
  it("formats whole dollars with half-up rounding and grouping", () => {
    expect(dollars(51_234)).toBe("$512");
    expect(dollars(51_250)).toBe("$513");
    expect(dollars(-1_550)).toBe("-$16");
    expect(dollars(123_456_789)).toBe("$1,234,568");
  });

  it("formats exact dollars with cents", () => {
    expect(dollarsExact(620)).toBe("$6.20");
    expect(dollarsExact(5)).toBe("$0.05");
  });

  it("parses decimal strings to cents; bad input is 0", () => {
    expect(centsFromDecimal("120.50")).toBe(12_050);
    expect(centsFromDecimal(45)).toBe(4_500);
    expect(centsFromDecimal("1,200.00")).toBe(120_000);
    expect(centsFromDecimal("abc")).toBe(0);
    expect(centsFromDecimal(null)).toBe(0);
  });
});

describe("Cloudbeds parsing", () => {
  const fixture = {
    success: true,
    data: [
      { reservationID: "R1", status: "confirmed", checkIn: "2026-11-01", checkOut: "2026-11-04", sourceName: "Booking.com", total: "120.50" },
      { reservationID: "R2", status: "checked_out", checkIn: "2026-11-02", checkOut: "2026-11-03", sourceName: "Hostel Website", total: 45 },
      { reservationID: "R3", status: "canceled", checkIn: "2026-11-05", checkOut: "2026-11-06", sourceName: "Expedia", total: "30" },
      { reservationID: "R4", status: "confirmed", checkIn: "2026-11-07", checkOut: "2026-11-07", sourceName: "Direct", total: "10" },
    ],
  };

  it("keeps counted statuses and drops cancelled and zero-night stays", () => {
    expect(parseReservationsPage(fixture).map((b) => b.id)).toEqual(["R1", "R2"]);
  });

  it("maps nights, revenue and channel", () => {
    const [r1, r2] = parseReservationsPage(fixture);
    expect(r1).toMatchObject({ nights: 3, revenueCents: 12_050, channel: "ota" });
    expect(r2).toMatchObject({ nights: 1, revenueCents: 4_500, channel: "direct" });
  });

  it("throws IntegrationError on a failed envelope", () => {
    expect(() => parseReservationsPage({ success: false, message: "bad token" })).toThrow(IntegrationError);
  });

  it("maps source names to channels", () => {
    expect(channelFromSource("Hostelworld")).toBe("ota");
    expect(channelFromSource("Front Desk")).toBe("direct");
    expect(channelFromSource("Travel agent X")).toBe("other");
    expect(channelFromSource("")).toBe("other");
  });

  it("pages until a short page and sums occupancy", async () => {
    const calls: URL[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      calls.push(url);
      const page = Number(url.searchParams.get("pageNumber"));
      const data =
        page === 1
          ? [
              { reservationID: "A", status: "confirmed", checkIn: "2026-11-01", checkOut: "2026-11-03", sourceName: "Booking.com", total: "50" },
              { reservationID: "B", status: "confirmed", checkIn: "2026-11-02", checkOut: "2026-11-04", sourceName: "Direct", total: "60" },
            ]
          : [{ reservationID: "C", status: "confirmed", checkIn: "2026-11-03", checkOut: "2026-11-04", sourceName: "Direct", total: "20" }];
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    }) as typeof fetch;

    const connector = new CloudbedsConnector({
      propertyId: "P",
      baseUrl: "https://example.com/cloudbeds",
      headers: { Authorization: "Bearer x" },
      pageSize: 2,
      fetchImpl,
    });
    const snap = await connector.fetchPeriod({ start: new Date(2026, 10, 1), end: new Date(2026, 11, 1) });

    expect(calls).toHaveLength(2);
    expect(calls[0].pathname).toBe("/cloudbeds/getReservations");
    expect(calls[0].searchParams.get("propertyID")).toBe("P");
    expect(calls[0].searchParams.get("checkInFrom")).toBe("2026-11-01");
    expect(calls[0].searchParams.get("checkInTo")).toBe("2026-11-30");
    expect(snap.bookings).toHaveLength(3);
    expect(snap.occupiedBedNights).toBe(2 + 2 + 1);
  });

  it("turns non-200 responses into IntegrationError", async () => {
    const connector = new CloudbedsConnector({
      propertyId: "P",
      baseUrl: "https://example.com/cloudbeds",
      fetchImpl: (async () => new Response("nope", { status: 401 })) as typeof fetch,
    });
    await expect(connector.fetchPeriod({ start: new Date(2026, 10, 1), end: new Date(2026, 10, 8) })).rejects.toThrow(
      IntegrationError,
    );
  });
});

describe("demo pipeline", () => {
  const now = new Date(2026, 10, 24, 9);

  it("surfaces the expected findings", async () => {
    const r = await loadAudit(demoDeps(undefined, () => now));
    const ids = r.findings.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(["laundry-peer", "ota-commission", "dupe-mailchimp", "spike-supplies", "direct-share"]));
    expect(r.occupiedBedNights).toBe(1123); // 48 beds * 30 days * 78%
    expect(r.findings.find((f) => f.id === "laundry-peer")?.monthlyImpactCents).toBe(235_800 - 145 * 1123);
    expect(r.findings.find((f) => f.id === "dupe-mailchimp")?.monthlyImpactCents).toBe(4_900);
    expect(r.findings.find((f) => f.id === "spike-supplies")?.monthlyImpactCents).toBe(24_000);
  });

  it("persists addressed findings and moves them to recovered", async () => {
    const store = new MemoryFindingStore();
    const deps = demoDeps(store, () => now);
    await store.markAddressed(deps.property.id, "spike-supplies");
    const r = await loadAudit(deps);
    expect(r.addressedIds).toEqual(new Set(["spike-supplies"]));
    expect(r.recoveredCents).toBe(24_000);
    expect(r.nextStep?.id).not.toBe("spike-supplies");
  });

  it("serves the previous dataset for the earlier window", async () => {
    const start = () => currentWindow(now).start;
    const bank = new DemoBankFeed(start);
    const cur = await bank.fetchExpenses(currentWindow(now));
    const prev = await bank.fetchExpenses(previousWindow(now));
    expect(cur.length).not.toBe(prev.length);
  });

  it("demo PMS fills the window to the target occupancy", async () => {
    const snap = await new DemoPms().fetchPeriod(currentWindow(now));
    expect(snap.occupiedBedNights).toBe(1123);
  });
});
