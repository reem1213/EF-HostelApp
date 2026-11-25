import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypts PMS credentials before they are stored.
 *
 * - AES-256-GCM: confidentiality plus tamper detection.
 * - A fresh random 96-bit IV for every encryption.
 * - `aad` (additional authenticated data) binds the blob to its owner, for
 *   example `${propertyId}:${provider}`, so a stored blob cannot be copied to
 *   another property or provider and still decrypt.
 * - The key lives only in the server environment (CREDENTIALS_ENCRYPTION_KEY,
 *   32 random bytes, base64). It is never sent to the browser or the database.
 *
 * Format: `v1.<iv>.<tag>.<ciphertext>` (base64url parts).
 *
 * Generate a key with:  openssl rand -base64 32
 */

const VERSION = "v1";

export class CredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialsError";
  }
}

export function loadKey(raw: string | undefined = process.env.CREDENTIALS_ENCRYPTION_KEY): Buffer {
  if (!raw) throw new CredentialsError("CREDENTIALS_ENCRYPTION_KEY is not set on the server.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new CredentialsError("CREDENTIALS_ENCRYPTION_KEY must be 32 random bytes, base64-encoded.");
  }
  return key;
}

export const encryptionConfigured = () => {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
};

export function encryptCredentials(secret: Record<string, string>, aad: string, key: Buffer = loadKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(JSON.stringify(secret), "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptCredentials(blob: string, aad: string, key: Buffer = loadKey()): Record<string, string> {
  const [version, iv, tag, ct] = blob.split(".");
  if (version !== VERSION || !iv || !tag || !ct) throw new CredentialsError("Unrecognised credential format.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const pt = Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]);
    return JSON.parse(pt.toString("utf8")) as Record<string, string>;
  } catch {
    // Wrong key, wrong owner (aad) or tampered data all look the same on purpose.
    throw new CredentialsError("Could not decrypt stored credentials.");
  }
}

/** Last four characters only, for showing that a secret exists without revealing it. */
export function maskSecret(value: string): string {
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}
