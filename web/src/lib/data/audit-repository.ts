import { runAudit } from "../domain/audit-engine";
import type { AuditResult, DateRange, PropertyProfile } from "../domain/types";
import { DemoBankFeed, DemoPms, demoProperty } from "../integrations/demo-data";
import type { BankFeedConnector, PmsConnector } from "../integrations/connectors";

/** Remembers which findings the user has acted on. */
export interface FindingStore {
  addressedIds(propertyId: string): Promise<Set<string>>;
  markAddressed(propertyId: string, findingId: string): Promise<void>;
}

export class MemoryFindingStore implements FindingStore {
  private readonly byProperty = new Map<string, Set<string>>();

  async addressedIds(propertyId: string) {
    return new Set(this.byProperty.get(propertyId) ?? []);
  }

  async markAddressed(propertyId: string, findingId: string) {
    const set = this.byProperty.get(propertyId) ?? new Set<string>();
    set.add(findingId);
    this.byProperty.set(propertyId, set);
  }
}

export type AuditDeps = {
  property: PropertyProfile;
  pms: PmsConnector;
  bank: BankFeedConnector;
  store: FindingStore;
  now?: () => Date;
};

/** Audit window: the last 30 days, compared with the 30 days before that. */
export const WINDOW_DAYS = 30;
const DAY = 86_400_000;

export function currentWindow(now: Date): DateRange {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start: new Date(end.getTime() - WINDOW_DAYS * DAY), end };
}

export function previousWindow(now: Date): DateRange {
  const cur = currentWindow(now);
  return { start: new Date(cur.start.getTime() - WINDOW_DAYS * DAY), end: cur.start };
}

/** Builds the home-screen audit from live connectors and the user's progress. */
export async function loadAudit(deps: AuditDeps): Promise<AuditResult> {
  const now = deps.now?.() ?? new Date();
  const period = currentWindow(now);
  const previous = previousWindow(now);

  const [pms, expenses, previousExpenses, addressed] = await Promise.all([
    deps.pms.fetchPeriod(period),
    deps.bank.fetchExpenses(period),
    deps.bank.fetchExpenses(previous),
    deps.store.addressedIds(deps.property.id),
  ]);

  return runAudit(
    {
      property: deps.property,
      period,
      previousPeriod: previous,
      occupiedBedNights: pms.occupiedBedNights,
      bookings: pms.bookings,
      expenses,
      previousExpenses,
      syncedAt: now,
    },
    addressed,
  );
}

/** Demo wiring: no credentials, data shaped like the design. */
export function demoDeps(store: FindingStore = new MemoryFindingStore(), now?: () => Date): AuditDeps {
  const clock = now ?? (() => new Date());
  return {
    property: demoProperty,
    pms: new DemoPms(),
    bank: new DemoBankFeed(() => currentWindow(clock()).start),
    store,
    now: clock,
  };
}

