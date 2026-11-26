/** OTA economics: commission and member-discount rules. Defaults are editable per hostel. */

export type OtaProfile = {
  id: string;
  name: string;
  /** Share of the booking price the OTA keeps, 0-1. */
  defaultCommission: number;
  /** Member discount the hostel funds (Booking.com Genius style), 0-1, or null. */
  memberDiscount: number | null;
  memberLabel: string | null;
};

export type OtaSettings = Record<string, { commission?: number; memberDiscount?: number }>;

const base = (id: string, name: string): OtaProfile => ({ id, name, defaultCommission: 0.15, memberDiscount: null, memberLabel: null });

/** Public sources put Booking.com's commission near 15% and Genius at 10-20%, funded by the host. */
export const KNOWN_OTAS: Record<string, OtaProfile> = {
  booking_com: { ...base("booking_com", "Booking.com"), memberDiscount: 0.1, memberLabel: "Genius" },
  hostelworld: base("hostelworld", "Hostelworld"),
  expedia: base("expedia", "Expedia"),
  airbnb: base("airbnb", "Airbnb"),
  agoda: base("agoda", "Agoda"),
  trip_com: base("trip_com", "Trip.com"),
  hotels_com: base("hotels_com", "Hotels.com"),
  other: base("other", "Other"),
};

export function resolveOta(id: string, overrides: OtaSettings = {}): OtaProfile {
  const known = KNOWN_OTAS[id] ?? base(id, id);
  const o = overrides[id] ?? {};
  const memberDiscount = o.memberDiscount ?? known.memberDiscount;
  return {
    ...known,
    defaultCommission: o.commission ?? known.defaultCommission,
    memberDiscount,
    memberLabel: memberDiscount === null ? null : (known.memberLabel ?? "Member price"),
  };
}
