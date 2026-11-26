import { DORM_BED } from "../domain/guardrails";
import { resolveOta, type OtaSettings } from "../domain/ota";
import type { Competitor, RateSnapshot, RateSource } from "../domain/rates";

/** Where rates come from. Real feeds (PMS, partner API, vendor) implement this too, so the UI never changes. */
export interface RateSourceAdapter {
  readonly name: string;
  readonly source: RateSource;
  fetchRates(a: {
    nights: Date[];
    channels: string[];
    competitors: Competitor[];
    baseRateCents: number;
    today: Date;
    otaSettings?: OtaSettings;
  }): Promise<RateSnapshot[]>;
}

/** Deterministic number in [0, 1) from a string (xmur3 hash). */
function unit(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Sunday = 0. Weekends cost more, midweek less. */
const WEEKDAY = [0.97, 0.92, 0.9, 0.95, 1.0, 1.15, 1.2];
const round50 = (cents: number) => Math.max(50, Math.round(cents / 50) * 50);

/**
 * Plausible stand-in rates, generated from a seed and the hostel's own base rate.
 * Always labelled "simulated". Replace with a real adapter without changing anything else.
 */
export class SimulatedRates implements RateSourceAdapter {
  readonly name = "Simulated rates";
  readonly source: RateSource = "simulated";

  constructor(private readonly seed = "hostelpulse") {}

  async fetchRates(a: Parameters<RateSourceAdapter["fetchRates"]>[0]): Promise<RateSnapshot[]> {
    const base = a.baseRateCents > 0 ? a.baseRateCents : 2800;
    const out: RateSnapshot[] = [];

    for (const night of a.nights) {
      const day = night.toISOString().slice(0, 10);
      const dow = WEEKDAY[night.getUTCDay()];

      for (const channel of a.channels) {
        const channelFactor = channel === "direct" ? 0.97 : 1.03;
        const noise = 0.97 + unit(`${this.seed}|${channel}|${day}`) * 0.06;
        const price = round50(base * dow * channelFactor * noise);
        const ota = channel === "direct" ? null : resolveOta(channel, a.otaSettings);
        const discount = ota?.memberDiscount ?? null;
        out.push({
          stayDate: night,
          channel,
          competitorId: null,
          roomType: DORM_BED,
          priceCents: price,
          discountedPriceCents: discount === null ? null : Math.round(price * (1 - discount)),
          discountLabel: discount === null ? null : ota!.memberLabel,
          source: this.source,
          capturedAt: a.today,
        });
      }

      for (const c of a.competitors) {
        const compFactor = 0.88 + unit(`${this.seed}|comp|${c.id}`) * 0.24; // each competitor sits at its own level
        const noise = 0.97 + unit(`${this.seed}|${c.id}|${day}`) * 0.06;
        out.push({
          stayDate: night,
          channel: "market",
          competitorId: c.id,
          roomType: DORM_BED,
          priceCents: round50(base * dow * compFactor * noise),
          discountedPriceCents: null,
          discountLabel: null,
          source: this.source,
          capturedAt: a.today,
        });
      }
    }
    return out;
  }
}
