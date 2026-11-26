import { describe, expect, it } from "vitest";

import { parseRatesCsv } from "./rates-csv";

const csv = [
  "Date,Channel,Price,Discounted price,Room type",
  "2026-11-28,Direct,$30.00,,",
  "2026-11-28,Booking.com,33.00,29.70,Dorm bed",
  "2026-11-28,Wrigley Hostel,$34.00,,",
  "2026-11-29,Hostelworld,31,,Private room",
].join("\n");

describe("parseRatesCsv", () => {
  it("separates your own channels from competitors, and defaults the room type to a dorm bed", () => {
    const r = parseRatesCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => [x.kind, x.channel ?? x.competitorName])).toEqual([
      ["own", "direct"],
      ["own", "booking_com"],
      ["competitor", "Wrigley Hostel"],
      ["own", "hostelworld"],
    ]);
    expect(r.rows[0].roomType).toBe("Dorm bed");
    expect(r.rows[3].roomType).toBe("Private room");
  });

  it("reads prices and member prices as whole cents", () => {
    const [direct, booking] = parseRatesCsv(csv).rows;
    expect(direct).toMatchObject({ priceCents: 3000, discountedPriceCents: null });
    expect(booking).toMatchObject({ priceCents: 3300, discountedPriceCents: 2970 });
  });

  it("reads dates either way round, deciding from the file", () => {
    const r = parseRatesCsv("Date,Channel,Price\n13/11/2026,Direct,30\n14/11/2026,Direct,31");
    expect(r.rows.map((x) => x.stayDate.toISOString().slice(0, 10))).toEqual(["2026-11-13", "2026-11-14"]);
  });

  it("reports unusable rows with their line numbers and keeps the good ones", () => {
    const r = parseRatesCsv(["Date,Channel,Price,Discounted price", "2026-11-28,Direct,30,", "nope,Direct,30,", "2026-11-29,Direct,-5,", "2026-11-30,Direct,abc,", "2026-12-01,,30,", "2026-12-02,Direct,30,45"].join("\n"));
    expect(r.rows).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5, 6, 7]);
    expect(r.errors[4].message).toMatch(/member price/i);
  });

  it("explains missing columns", () => {
    const r = parseRatesCsv("Name,Cost\nA,1");
    expect(r.rows).toEqual([]);
    expect(r.errors[0].message).toMatch(/date.*channel.*price/i);
  });

  it("refuses an oversized file", () => {
    const big = "Date,Channel,Price\n" + Array.from({ length: 5001 }, () => "2026-11-28,Direct,30").join("\n");
    expect(parseRatesCsv(big).errors[0].message).toMatch(/5,?000/);
  });
});
