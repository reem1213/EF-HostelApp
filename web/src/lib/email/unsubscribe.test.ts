import { describe, expect, it } from "vitest";

import { signUnsubscribe, verifyUnsubscribe } from "./unsubscribe";

const SECRET = "a-long-enough-secret-value";

describe("unsubscribe tokens", () => {
  it("round-trips a property and an email (lowercased)", () => {
    const t = signUnsubscribe("p1", "Ann@Example.com", SECRET);
    expect(verifyUnsubscribe(t, SECRET)).toEqual({ propertyId: "p1", email: "ann@example.com" });
  });
  it("is safe to put in a URL", () => {
    expect(signUnsubscribe("p1", "a+b@example.com", SECRET)).toMatch(/^[A-Za-z0-9_.-]+$/);
  });
  it("rejects a tampered token", () => {
    const t = signUnsubscribe("p1", "ann@example.com", SECRET);
    const [payload, sig] = t.split(".");
    const other = Buffer.from("p2|ann@example.com").toString("base64url");
    expect(verifyUnsubscribe(`${other}.${sig}`, SECRET)).toBeNull();
    expect(verifyUnsubscribe(`${payload}.${sig.slice(0, -2)}xx`, SECRET)).toBeNull();
  });
  it("rejects a token signed with another secret, and garbage", () => {
    expect(verifyUnsubscribe(signUnsubscribe("p1", "a@b.com", "another-secret-value-1"), SECRET)).toBeNull();
    for (const g of ["", "garbage", "a.b.c", ".", "x.", ".y", "%%%.%%%"]) expect(verifyUnsubscribe(g, SECRET)).toBeNull();
  });
  it("refuses to sign or verify with a short or missing secret", () => {
    expect(() => signUnsubscribe("p1", "a@b.com", "short")).toThrow();
    expect(verifyUnsubscribe(signUnsubscribe("p1", "a@b.com", SECRET), "short")).toBeNull();
  });
});
