import type { BookingRow, ExpenseRow } from "../domain/import/parsers";
import { monthOf } from "../period";
import { MemoryStore } from "./memory-store";
import type { Property } from "./store";

const DAY = 86_400_000;
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * Seeds a believable hostel (48 beds, about 78% occupied) so the app is usable
 * with no setup. Dates are relative to `now`, so the demo never goes stale.
 */
export async function seedDemo(store: MemoryStore, userId: string, now = new Date()): Promise<Property> {
  const property = await store.createProperty(userId, { name: "Roam Quarter Hostel", beds: 48, currency: "USD", country: "US" });
  const today = utcDay(now);

  // 90 days of bookings ending today: 19 arrivals a day, 1-3 nights each.
  const bookings: BookingRow[] = [];
  let idx = 0;
  for (let back = 89; back >= 0; back--) {
    const checkIn = new Date(today.getTime() - back * DAY);
    for (let k = 0; k < 19; k++, idx++) {
      const nights = 1 + (idx % 3);
      const returning = idx % 8 === 0 && idx > 600;
      bookings.push({
        externalId: `demo-${idx}`,
        guestKey: `guest${returning ? idx - 600 - (idx % 50) : idx}@example.com`,
        channel: idx % 100 < 26 ? "direct" : "ota",
        checkIn,
        nights,
        revenueCents: nights * 2800,
      });
    }
  }
  const imp = await store.recordImport(property.id, { kind: "bookings", filename: "demo-bookings.csv", fileHash: "demo-bookings", rowsOk: bookings.length, rowsFailed: 0, errors: [] });
  await store.addBookings(property.id, imp.id, bookings);

  // Bank data for the last 60 days (two 30-day windows).
  const at = (back: number) => new Date(today.getTime() - back * DAY);
  const ex = (back: number, merchant: string, category: ExpenseRow["category"], amountCents: number): ExpenseRow => ({ date: at(back), amountCents, merchant, category });
  const bank: ExpenseRow[] = [
    // this window (days 0-29 back)
    ex(27, "Clean Linen Co", "laundry", 61_200),
    ex(20, "Clean Linen Co", "laundry", 58_900),
    ex(13, "Clean Linen Co", "laundry", 59_400),
    ex(6, "Clean Linen Co", "laundry", 56_300),
    ex(18, "Supply Depot", "supplies", 35_000),
    ex(8, "Supply Depot", "supplies", 27_000),
    ex(25, "Cloudbeds", "software", 25_000),
    ex(22, "Mailchimp", "software", 4_900),
    ex(21, "Mailchimp", "software", 4_900),
    ex(15, "Booking.com", "channel_commission", 200_000),
    ex(9, "Hostelworld", "channel_commission", 183_900),
    // previous window (days 30-59 back)
    ex(55, "Clean Linen Co", "laundry", 200_000),
    ex(50, "Supply Depot", "supplies", 38_000),
    ex(45, "Cloudbeds", "software", 30_000),
    ex(40, "Booking.com", "channel_commission", 350_000),
  ];
  const impBank = await store.recordImport(property.id, { kind: "bank", filename: "demo-bank.csv", fileHash: "demo-bank", rowsOk: bank.length, rowsFailed: 0, errors: [] });
  await store.addExpenses(property.id, impBank.id, bank);

  const thisMonth = monthOf(today);
  const lastMonth = monthOf(new Date(today.getTime() - 31 * DAY));
  await store.saveCostInputs(property.id, { month: thisMonth, rentCents: 180_000, utilitiesCents: 70_000, staffCents: 200_000, breakfastCents: 40_000, laundryCents: 0 });
  await store.saveCostInputs(property.id, { month: lastMonth, rentCents: 180_000, utilitiesCents: 62_000, staffCents: 200_000, breakfastCents: 38_000, laundryCents: 0 });

  await store.saveReviewSnapshot(property.id, { month: lastMonth, rating: 4.3, reviewCount: 212, impressions: 8_400 });
  await store.saveReviewSnapshot(property.id, { month: thisMonth, rating: 4.4, reviewCount: 219, impressions: 9_100 });
  return property;
}
