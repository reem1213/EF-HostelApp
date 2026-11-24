import type { Booking, DateRange, Expense } from "../domain/types";

/** Thrown when an upstream system cannot be read. The message is safe to show. */
export class IntegrationError extends Error {
  constructor(
    public readonly source: string,
    message: string,
  ) {
    super(`${source}: ${message}`);
    this.name = "IntegrationError";
  }
}

export type PmsSnapshot = { bookings: Booking[]; occupiedBedNights: number };

/** Reads bookings and occupancy from a property-management system. */
export interface PmsConnector {
  readonly name: string;
  fetchPeriod(period: DateRange): Promise<PmsSnapshot>;
}

/** Reads operating expenses from bank and card feeds. */
export interface BankFeedConnector {
  readonly name: string;
  fetchExpenses(period: DateRange): Promise<Expense[]>;
}
