import type { Property, Store } from "../data/store";
import { profitMetrics } from "../domain/metrics";
import { utcDay } from "../period";
import type { RateSourceAdapter } from "./sources";

const DAY = 86_400_000;
export const REFRESH_NIGHTS = 14;

/**
 * Pulls the next 14 nights of rates from `adapter` for direct, the hostel's own OTAs and its
 * competitors, and saves them. Prices are anchored on what the hostel really earns per bed-night.
 * Returns how many rates were saved.
 */
export async function refreshRates(a: {
  store: Pick<Store, "listCompetitors" | "listBookings" | "saveRates">;
  adapter: RateSourceAdapter;
  property: Pick<Property, "id" | "beds" | "otas" | "otaSettings">;
  now?: () => Date;
}): Promise<number> {
  const today = utcDay((a.now ?? (() => new Date()))());
  const nights = Array.from({ length: REFRESH_NIGHTS }, (_, i) => new Date(today.getTime() + i * DAY));
  const [competitors, bookings] = await Promise.all([a.store.listCompetitors(a.property.id), a.store.listBookings(a.property.id)]);

  const adr = profitMetrics(bookings, { start: new Date(today.getTime() - 30 * DAY), end: today }, a.property.beds).adrCents;
  const snaps = await a.adapter.fetchRates({
    nights,
    channels: ["direct", ...a.property.otas],
    competitors,
    baseRateCents: adr,
    today,
    otaSettings: a.property.otaSettings,
  });
  if (snaps.length === 0) return 0;
  await a.store.saveRates(a.property.id, snaps);
  return snaps.length;
}
