import type { Property } from "../data/store";
import type { EmailSettings } from "./executor";

/** Reads the server's email settings. Null until an unsubscribe secret and the site address are set. */
export function emailSettingsFor(property: Property): EmailSettings | null {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
  if (!secret || secret.length < 16 || !site) return null;
  return { property, siteUrl: site, unsubscribeSecret: secret, apiKey: process.env.RESEND_API_KEY || undefined, from: process.env.EMAIL_FROM || undefined };
}

/** What is switched on, for the page to explain. */
export function emailMode(): "live" | "outbox" {
  return process.env.RESEND_API_KEY && process.env.EMAIL_FROM ? "live" : "outbox";
}
