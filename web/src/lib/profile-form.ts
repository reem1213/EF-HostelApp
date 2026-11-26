import { OTA_OPTIONS, parseSocials, parseWebsite, type Socials } from "./domain/profile";

export type ProfileInput = { otas: string[]; website: string | null; socials: Socials; postalAddress: string; replyToEmail: string };

export const PROFILE_FIELD_NAMES = ["website", "postalAddress", "replyToEmail", "social_instagram", "social_facebook", "social_tiktok", "social_youtube", "social_google_business"] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLATFORMS = ["instagram", "facebook", "tiktok", "youtube", "google_business"] as const;

/** Reads the profile section of onboarding / settings forms. Everything is optional; bad values are reported per field. */
export function readProfileForm(fd: FormData): { ok: true; value: ProfileInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const valid = new Set(OTA_OPTIONS.map((o) => o.id));
  const otas = [...new Set(fd.getAll("otas").map(String))].filter((id) => valid.has(id));

  const site = parseWebsite(String(fd.get("website") ?? ""));
  if (!site.ok) errors.website = site.error;

  const rawSocials = Object.fromEntries(PLATFORMS.map((p) => [p, String(fd.get(`social_${p}`) ?? "")]));
  const social = parseSocials(rawSocials);
  for (const [platform, message] of Object.entries(social.errors)) errors[`social_${platform}`] = message;

  const postalAddress = String(fd.get("postalAddress") ?? "").trim();
  if (postalAddress.length > 300) errors.postalAddress = "Keep the address under 300 characters.";

  const replyToEmail = String(fd.get("replyToEmail") ?? "").trim().toLowerCase();
  if (replyToEmail && (!EMAIL.test(replyToEmail) || replyToEmail.length > 254)) errors.replyToEmail = "Enter a valid email address.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { otas, website: site.ok && site.url ? site.url : null, socials: social.socials, postalAddress, replyToEmail } };
}
