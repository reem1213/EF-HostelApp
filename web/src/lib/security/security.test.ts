import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { CredentialsError, decryptCredentials, encryptCredentials, loadKey, maskSecret } from "./credentials";
import { PROVIDERS, splitFields } from "../integrations/providers";

const key = randomBytes(32);
const secret = { api_key: "cbat_abcdef123456", extra: "sensitive value" };
const aad = "property-1:cloudbeds";

describe("credential encryption", () => {
  it("round-trips", () => {
    expect(decryptCredentials(encryptCredentials(secret, aad, key), aad, key)).toEqual(secret);
  });

  it("never stores the plaintext", () => {
    const blob = encryptCredentials(secret, aad, key);
    expect(blob).not.toContain("cbat_");
    expect(blob).not.toContain("sensitive");
    expect(blob.startsWith("v1.")).toBe(true);
  });

  it("uses a fresh IV every time", () => {
    expect(encryptCredentials(secret, aad, key)).not.toBe(encryptCredentials(secret, aad, key));
  });

  it("refuses to decrypt for a different property or provider (AAD binding)", () => {
    const blob = encryptCredentials(secret, aad, key);
    expect(() => decryptCredentials(blob, "property-2:cloudbeds", key)).toThrow(CredentialsError);
    expect(() => decryptCredentials(blob, "property-1:hostaway", key)).toThrow(CredentialsError);
  });

  it("detects tampering", () => {
    const [v, iv, tag, ct] = encryptCredentials(secret, aad, key).split(".");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 0xff;
    expect(() => decryptCredentials([v, iv, tag, flipped.toString("base64url")].join("."), aad, key)).toThrow(CredentialsError);
  });

  it("fails with the wrong key and on malformed input", () => {
    const blob = encryptCredentials(secret, aad, key);
    expect(() => decryptCredentials(blob, aad, randomBytes(32))).toThrow(CredentialsError);
    expect(() => decryptCredentials("garbage", aad, key)).toThrow(CredentialsError);
  });

  it("validates the key", () => {
    expect(() => loadKey(undefined)).toThrow(/not set/);
    expect(() => loadKey(Buffer.from("short").toString("base64"))).toThrow(/32 random bytes/);
    expect(loadKey(key.toString("base64"))).toHaveLength(32);
  });

  it("masks secrets to the last four characters", () => {
    expect(maskSecret("cbat_abcdef123456")).toBe("••••3456");
    expect(maskSecret("abc")).toBe("••••");
  });
});

describe("provider validation", () => {
  it("accepts a well-formed Cloudbeds credential and rejects bad ones", () => {
    const s = PROVIDERS.cloudbeds.schema;
    expect(s.safeParse({ api_key: "cbat_abc123", property_id: "12345" }).success).toBe(true);
    expect(s.safeParse({ api_key: "wrong_abc123", property_id: "12345" }).success).toBe(false);
    expect(s.safeParse({ api_key: "cbat_abc 123", property_id: "12345" }).success).toBe(false);
    expect(s.safeParse({ api_key: "cbat_abc123" }).success).toBe(false);
    expect(s.safeParse({ api_key: "cbat_abc123", property_id: "" }).success).toBe(false);
  });

  it("requires every Hostaway field", () => {
    const s = PROVIDERS.hostaway.schema;
    expect(s.safeParse({ client_id: "abc", client_secret: "def" }).success).toBe(true);
    expect(s.safeParse({ client_id: "abc" }).success).toBe(false);
  });

  it("splits secret fields from clear ones", () => {
    const { secret: s, clear } = splitFields(PROVIDERS.cloudbeds, { api_key: "cbat_x", property_id: "9" });
    expect(s).toEqual({ api_key: "cbat_x" });
    expect(clear).toEqual({ property_id: "9" });
  });
});
