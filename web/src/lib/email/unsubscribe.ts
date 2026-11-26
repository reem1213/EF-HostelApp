import { createHmac, timingSafeEqual } from "node:crypto";

const MIN_SECRET = 16;

const mac = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

/** A link token that proves this exact address asked to stop hearing from this hostel. Signed, not secret. */
export function signUnsubscribe(propertyId: string, email: string, secret: string): string {
  if (secret.length < MIN_SECRET) throw new Error("UNSUBSCRIBE_SECRET must be at least 16 characters.");
  const payload = Buffer.from(`${propertyId}|${email.trim().toLowerCase()}`).toString("base64url");
  return `${payload}.${mac(payload, secret)}`;
}

export function verifyUnsubscribe(token: string, secret: string): { propertyId: string; email: string } | null {
  if (secret.length < MIN_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, sig] = parts;
  const expected = Buffer.from(mac(payload, secret));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const text = Buffer.from(payload, "base64url").toString("utf8");
  const i = text.indexOf("|");
  if (i <= 0 || i === text.length - 1) return null;
  return { propertyId: text.slice(0, i), email: text.slice(i + 1) };
}
