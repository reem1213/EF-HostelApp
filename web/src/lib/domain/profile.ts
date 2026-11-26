/** Hostel profile inputs: which OTAs it uses, its website and social links. Validation only; no network. */

export const OTA_OPTIONS: { id: string; name: string }[] = [
  { id: "booking_com", name: "Booking.com" },
  { id: "hostelworld", name: "Hostelworld" },
  { id: "expedia", name: "Expedia" },
  { id: "airbnb", name: "Airbnb" },
  { id: "agoda", name: "Agoda" },
  { id: "trip_com", name: "Trip.com" },
  { id: "hotels_com", name: "Hotels.com" },
  { id: "other", name: "Other" },
];

export type Socials = Partial<Record<"instagram" | "facebook" | "tiktok" | "youtube" | "google_business", string>>;

const PRIVATE_SUFFIXES = [".local", ".internal", ".localhost", ".lan", ".home", ".corp"];

function isPublicLookingHost(host: string): boolean {
  if (!host.includes(".")) return false; // single label: localhost, intranet names
  if (host === "localhost" || PRIVATE_SUFFIXES.some((s) => host.endsWith(s))) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false; // IPv4 literal
  if (host.includes(":") || host.startsWith("[")) return false; // IPv6 literal
  return true;
}

export type WebsiteResult = { ok: true; url: string } | { ok: false; error: string };

/** https only, public-looking hostnames only. A bare domain gets https:// added. */
export function parseWebsite(input: string): WebsiteResult {
  const text = input.trim();
  if (text === "") return { ok: true, url: "" };
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https:\/\//i.test(text)) {
    return { ok: false, error: "Use an https:// address (no ports or other link types)." };
  }
  let url: URL;
  try {
    url = new URL(/^https:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, error: "That does not look like a web address." };
  }
  if (url.protocol !== "https:" || !isPublicLookingHost(url.hostname.toLowerCase())) {
    return { ok: false, error: "Enter your public website address, like https://yourhostel.com" };
  }
  return { ok: true, url: url.toString() };
}

const PLATFORM_HOSTS: Record<keyof Socials, string[]> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com"],
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"],
  google_business: ["google.com", "g.page", "goo.gl"],
};

const onHost = (hostname: string, hosts: string[]) => {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return hosts.some((x) => h === x || h.endsWith(`.${x}`));
};

export function parseSocials(input: Record<string, string>): { socials: Socials; errors: Record<string, string> } {
  const socials: Socials = {};
  const errors: Record<string, string> = {};
  for (const platform of Object.keys(PLATFORM_HOSTS) as (keyof Socials)[]) {
    const raw = (input[platform] ?? "").trim();
    if (!raw) continue;
    const site = parseWebsite(raw);
    if (!site.ok || !site.url) {
      errors[platform] = "Enter a full link, like https://instagram.com/yourhostel";
      continue;
    }
    if (!onHost(new URL(site.url).hostname, PLATFORM_HOSTS[platform])) {
      errors[platform] = `That link is not on ${PLATFORM_HOSTS[platform][0]}.`;
      continue;
    }
    socials[platform] = site.url;
  }
  return { socials, errors };
}
