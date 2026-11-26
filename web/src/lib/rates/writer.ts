import type { RateWriter } from "../automation/executors";
import type { Store } from "../data/store";
import { currentSnapshot } from "../domain/rates";

const DAY = 86_400_000;
const dayRange = (d: Date) => {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return { start, end: new Date(start.getTime() + DAY) };
};

/**
 * Lets the automation executor read and change a night's own-channel rate in the Store.
 * A change is saved as a "manual" snapshot, so the newest snapshot wins and clearing it
 * reveals whatever the underlying source said. Swap for a PMS writer to go live.
 */
export function storeRateWriter(store: Pick<Store, "listRates" | "saveRates" | "deleteManualRate">, now: () => Date = () => new Date()): RateWriter {
  return {
    async getRate(a) {
      const rows = (await store.listRates(a.propertyId, dayRange(a.stayDate))).filter((r) => r.channel === a.channel && r.roomType === a.roomType && r.competitorId === null);
      return currentSnapshot(rows)?.priceCents ?? null;
    },
    async setRate(a) {
      await store.saveRates(a.propertyId, [
        { stayDate: a.stayDate, channel: a.channel, competitorId: null, roomType: a.roomType, priceCents: a.priceCents, discountedPriceCents: null, discountLabel: null, source: "manual", capturedAt: now() },
      ]);
    },
    async clearRate(a) {
      await store.deleteManualRate(a.propertyId, { stayDate: a.stayDate, channel: a.channel, roomType: a.roomType });
    },
  };
}
