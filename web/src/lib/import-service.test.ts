import { describe, expect, it } from "vitest";

import { MemoryStore } from "./data/memory-store";
import { dateOrderFor, runImport } from "./import-service";

async function setup(country = "US") {
  const store = new MemoryStore();
  const property = await store.createProperty("u", { name: "H", beds: 10, currency: "USD", country });
  return { store, property };
}

const BOOKINGS = "Reservation ID,Email,Source,Check-in,Check-out,Total\nA,a@x.com,Booking.com,11/01/2026,11/03/2026,80\nB,b@x.com,Direct,11/02/2026,11/04/2026,90\nC,,Direct,bad,11/04/2026,10";

describe("runImport", () => {
  it("saves valid rows, reports skipped ones, and logs the import", async () => {
    const { store, property } = await setup();
    const out = await runImport({ store, property, kind: "bookings", filename: "b.csv", text: BOOKINGS });
    expect(out).toMatchObject({ ok: true, rowsOk: 2, rowsFailed: 1 });
    expect(out.message).toMatch(/Imported 2 new/);
    expect(out.message).toMatch(/1 row was skipped/);
    expect(await store.listBookings(property.id)).toHaveLength(2);
    const log = await store.listImports(property.id);
    expect(log[0]).toMatchObject({ kind: "bookings", filename: "b.csv", rowsOk: 2, rowsFailed: 1 });
  });

  it("refuses to import the identical file twice and changes nothing", async () => {
    const { store, property } = await setup();
    await runImport({ store, property, kind: "bookings", filename: "b.csv", text: BOOKINGS });
    const again = await runImport({ store, property, kind: "bookings", filename: "b-copy.csv", text: BOOKINGS });
    expect(again).toMatchObject({ ok: true, duplicate: true, rowsOk: 0 });
    expect(await store.listImports(property.id)).toHaveLength(1);
    expect(await store.listBookings(property.id)).toHaveLength(2);
  });

  it("keeps separate kinds apart even when the text matches", async () => {
    const { store, property } = await setup();
    const csv = "Date,Vendor,Amount\n2026-11-01,Acme,10";
    const a = await runImport({ store, property, kind: "expenses", filename: "a.csv", text: csv });
    const b = await runImport({ store, property, kind: "utilities", filename: "a.csv", text: "Date,Provider,Amount\n2026-11-01,Acme,10" });
    expect(a.ok && b.ok).toBe(true);
    expect(await store.listExpenses(property.id)).toHaveLength(2);
  });

  it("writes nothing and explains why when no row is usable", async () => {
    const { store, property } = await setup();
    const out = await runImport({ store, property, kind: "bookings", filename: "x.csv", text: "Name,Total\nAnn,5" });
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/check-in and check-out/i);
    expect(await store.listImports(property.id)).toHaveLength(0);
  });

  it("imports bank charges as categorised expenses", async () => {
    const { store, property } = await setup();
    const out = await runImport({ store, property, kind: "bank", filename: "bank.csv", text: "Date,Description,Amount\n2026-11-02,Clean Linen Co,-612.00\n2026-11-03,Deposit,100" });
    expect(out.ok).toBe(true);
    const [e] = await store.listExpenses(property.id);
    expect(e).toMatchObject({ category: "laundry", amountCents: 61_200 });
  });

  it("imports a schedule as shifts", async () => {
    const { store, property } = await setup();
    const out = await runImport({ store, property, kind: "schedule", filename: "s.csv", text: "Employee,Date,Hours,Rate\nAnn,2026-11-02,8,15" });
    expect(out.rowsOk).toBe(1);
    const shifts = await store.listShifts(property.id, { start: new Date("2026-11-01"), end: new Date("2026-12-01") });
    expect(shifts).toHaveLength(1);
  });

  it("reads dates day-first outside the US", async () => {
    const { store, property } = await setup("Spain");
    await runImport({ store, property, kind: "bookings", filename: "es.csv", text: "Check-in,Check-out,Total\n03/11/2026,05/11/2026,50" });
    const [b] = await store.listBookings(property.id);
    expect(b.checkIn.toISOString().slice(0, 10)).toBe("2026-11-03"); // 3 November, not 11 March
  });

  it("rejects an oversized payload before parsing", async () => {
    const { store, property } = await setup();
    const out = await runImport({ store, property, kind: "bookings", filename: "big.csv", text: "a".repeat(5 * 1024 * 1024 + 1) });
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/5 MB/);
  });

  it("maps countries to date order", () => {
    expect(dateOrderFor("US")).toBe("mdy");
    expect(dateOrderFor("")).toBe("mdy");
    expect(dateOrderFor("Portugal")).toBe("dmy");
  });

  it("warns when imported bookings need more beds than the hostel declared", async () => {
    const { store, property } = await setup(); // 10 beds
    const rows = Array.from({ length: 11 }, (_, i) => `R${i},2026-11-10,2026-11-12,50`).join("\n");
    const out = await runImport({ store, property, kind: "bookings", filename: "crowded.csv", text: `Reservation ID,Check-in,Check-out,Total\n${rows}` });
    expect(out.ok).toBe(true);
    expect(out.capacity).toMatchObject({ exceeded: true, peak: 11, nightsOver: 2 });
  });

  it("reports capacity as fine when the beds are enough, and not at all for other file types", async () => {
    const { store, property } = await setup();
    const ok = await runImport({ store, property, kind: "bookings", filename: "ok.csv", text: "Reservation ID,Check-in,Check-out,Total\nA,2026-11-10,2026-11-12,50" });
    expect(ok.capacity).toMatchObject({ exceeded: false, peak: 1 });
    const bank = await runImport({ store, property, kind: "bank", filename: "b.csv", text: "Date,Description,Amount\n2026-11-02,Clean Linen Co,-612.00" });
    expect(bank.capacity).toBeUndefined();
  });
});
