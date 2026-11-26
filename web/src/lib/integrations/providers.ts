import { z } from "zod";

/**
 * PMS providers the manager can connect. The connection record, validation and
 * encrypted storage are fully built. The live API calls are switched on later:
 * until then a saved connection is "saved, not yet verified".
 */

export type ProviderId = "cloudbeds" | "hostaway" | "little_hotelier";

export type ProviderField = {
  key: string;
  label: string;
  /** Secret fields are encrypted, masked in the UI, and never sent back to the browser. */
  secret: boolean;
  placeholder?: string;
  help?: string;
};

export type ProviderDef = {
  id: ProviderId;
  name: string;
  tagline: string;
  fields: ProviderField[];
  /** What the connection will pull once the API is enabled. */
  syncs: string[];
  /** Where the manager finds the credentials. */
  howTo: string[];
  schema: z.ZodType<Record<string, string>>;
};

const text = (label: string, max = 200) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

/** Credentials never contain whitespace or control characters. */
const token = (label: string, max = 300) =>
  text(label, max).regex(/^[\x21-\x7e]+$/, `${label} must not contain spaces or special characters`);

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  cloudbeds: {
    id: "cloudbeds",
    name: "Cloudbeds",
    tagline: "Bookings, occupancy and daily rates.",
    fields: [
      { key: "api_key", label: "API key", secret: true, placeholder: "cbat_...", help: "Cloudbeds API keys start with cbat_." },
      { key: "property_id", label: "Property ID", secret: false, placeholder: "e.g. 123456" },
    ],
    syncs: ["Reservations and channels", "Daily rates", "Occupancy and guest history"],
    howTo: [
      "In Cloudbeds, open Account > API Credentials.",
      "Create an API key with read-only access to reservations and rates.",
      "Copy the key and your Property ID here.",
    ],
    schema: z.object({
      api_key: token("API key").regex(/^cbat_/, "Cloudbeds API keys start with cbat_"),
      property_id: token("Property ID", 40),
    }),
  },
  hostaway: {
    id: "hostaway",
    name: "Hostaway",
    tagline: "Reservations and pricing.",
    fields: [
      { key: "client_id", label: "Client ID", secret: false, placeholder: "Account ID / client id" },
      { key: "client_secret", label: "Client secret", secret: true },
    ],
    syncs: ["Reservations and channels", "Listing prices", "Guest history"],
    howTo: [
      "In Hostaway, open Settings > Hostaway API.",
      "Create a new API key (client credentials).",
      "Copy the Client ID and Client secret here.",
    ],
    schema: z.object({ client_id: token("Client ID", 60), client_secret: token("Client secret") }),
  },
  little_hotelier: {
    id: "little_hotelier",
    name: "Little Hotelier",
    tagline: "Bookings and availability.",
    fields: [
      { key: "api_key", label: "API key", secret: true, help: "Little Hotelier issues API access on request. Ask their support for a key." },
      { key: "property_id", label: "Property ID", secret: false },
    ],
    syncs: ["Reservations and channels", "Availability and rates"],
    howTo: [
      "Contact Little Hotelier support and request API access for your property.",
      "They will send an API key and your Property ID.",
      "Paste both here.",
    ],
    schema: z.object({ api_key: token("API key"), property_id: token("Property ID", 40) }),
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);

export const isProviderId = (v: string): v is ProviderId => v in PROVIDERS;

export type ConnectionStatus = "saved_unverified" | "connected" | "error";

export const STATUS_COPY: Record<ConnectionStatus, string> = {
  saved_unverified: "Credentials stored encrypted. Live sync is not switched on yet.",
  connected: "Connected",
  error: "Connection error",
};

/**
 * Checks a connection against the provider. Until the live API integration is
 * added this does not call out; it reports that honestly.
 */
export async function verifyConnection(): Promise<{ status: ConnectionStatus; message: string }> {
  return { status: "saved_unverified", message: STATUS_COPY.saved_unverified };
}

/** Splits validated values into what may be stored in the clear and what must be encrypted. */
export function splitFields(def: ProviderDef, values: Record<string, string>) {
  const secret: Record<string, string> = {};
  const clear: Record<string, string> = {};
  for (const f of def.fields) (f.secret ? secret : clear)[f.key] = values[f.key];
  return { secret, clear };
}
