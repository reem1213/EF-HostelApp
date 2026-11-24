import type { Benchmark, Booking, DateRange, Expense, PropertyProfile } from "../domain/types";
import type { BankFeedConnector, PmsConnector, PmsSnapshot } from "./connectors";

/** Demo property shaped like the Roam Quarter Hostel design. */
export const demoProperty: PropertyProfile = {
  id: "roam-quarter",
  name: "Roam Quarter Hostel",
  beds: 48,
  benchmark: {
    peerCostPerBedNightCents: 490,
    targetCostPerBedNightCents: 450,
    peerLaundryPerBedNightCents: 145,
    targetOtaCommissionRate: 0.15,
    targetDirectShare: 0.4,
    targetOtaShare: 0.5,
  } satisfies Benchmark,
};

const DAY = 86_400_000;

export class DemoPms implements PmsConnector {
  readonly name = "Cloudbeds PMS (demo)";

  async fetchPeriod(period: DateRange): Promise<PmsSnapshot> {
    const days = Math.round((period.end.getTime() - period.start.getTime()) / DAY);
    // 48 beds at 78% occupancy across the period.
    const target = Math.round(demoProperty.beds * days * 0.78);
    const bookings: Booking[] = [];
    let nights = 0;
    for (let i = 0; nights < target; i++) {
      const n = 1 + (i % 3);
      bookings.push({
        id: `demo-${i}`,
        channel: i % 100 < 26 ? "direct" : "ota", // 26% direct, rest OTA
        nights: n,
        revenueCents: n * 2800,
        checkIn: new Date(period.start.getTime() + (i % Math.max(days, 1)) * DAY),
      });
      nights += n;
    }
    return { bookings, occupiedBedNights: nights };
  }
}

export class DemoBankFeed implements BankFeedConnector {
  readonly name = "Bank & cards (demo)";

  /** `currentWindowStart` decides which dataset a window gets. */
  constructor(private readonly currentWindowStart: () => Date) {}

  async fetchExpenses(period: DateRange): Promise<Expense[]> {
    return period.start.getTime() < this.currentWindowStart().getTime()
      ? previousExpenses(period.start)
      : currentExpenses(period.start);
  }
}

function currentExpenses(start: Date): Expense[] {
  const at = (n: number) => new Date(start.getTime() + 3 * n * DAY);
  const e = (n: number, merchant: string, category: Expense["category"], amountCents: number): Expense => ({
    id: `cur-${n}`,
    date: at(n),
    amountCents,
    merchant,
    category,
  });
  return [
    e(1, "Clean Linen Co", "laundry", 61_200),
    e(2, "Clean Linen Co", "laundry", 58_900),
    e(3, "Clean Linen Co", "laundry", 59_400),
    e(4, "Clean Linen Co", "laundry", 56_300),
    e(5, "City Power", "utilities", 120_000),
    e(6, "Boiler Gas", "utilities", 120_000),
    e(7, "Front desk payroll", "staff", 110_000),
    e(8, "Housekeeping", "staff", 60_000),
    e(9, "Supply Depot", "supplies", 35_000),
    e(10, "Supply Depot", "supplies", 27_000),
    e(11, "Cloudbeds", "software", 25_000),
    e(12, "Mailchimp", "software", 4_900),
    e(13, "Mailchimp", "software", 4_900),
    e(14, "Booking.com", "channel_commission", 200_000),
    e(15, "Hostelworld", "channel_commission", 183_900),
  ];
}

function previousExpenses(start: Date): Expense[] {
  const row = (id: string, merchant: string, category: Expense["category"], amountCents: number): Expense => ({
    id,
    date: start,
    amountCents,
    merchant,
    category,
  });
  return [
    row("prev-1", "Clean Linen Co", "laundry", 200_000),
    row("prev-2", "City Power", "utilities", 230_000),
    row("prev-3", "Front desk payroll", "staff", 168_000),
    row("prev-4", "Supply Depot", "supplies", 38_000),
    row("prev-5", "Cloudbeds", "software", 30_000),
    row("prev-6", "Booking.com", "channel_commission", 350_000),
  ];
}
