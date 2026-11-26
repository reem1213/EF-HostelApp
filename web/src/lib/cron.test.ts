import { describe, expect, it } from "vitest";

import { authorizeCron, makeCronHandler } from "./cron";

const SECRET = "a-long-enough-secret-value";
const req = (auth?: string) => new Request("https://x.test/api/cron/rates", { headers: auth ? { authorization: auth } : {} });

describe("authorizeCron", () => {
  it("accepts exactly the right bearer token", () => {
    expect(authorizeCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("rejects missing, wrong, differently-cased, truncated and oversized tokens", () => {
    for (const bad of [null, "", SECRET, "Bearer ", "Bearer wrong-secret-value-here", `bearer ${SECRET}`, `Bearer ${SECRET.slice(0, -1)}`, `Bearer ${SECRET}x`, `Basic ${SECRET}`]) {
      expect(authorizeCron(bad, SECRET), String(bad)).toBe(false);
    }
  });

  it("never authorises when no secret is configured or it is too short to be safe", () => {
    expect(authorizeCron("Bearer ", "")).toBe(false);
    expect(authorizeCron("Bearer short", "short")).toBe(false);
    expect(authorizeCron("Bearer undefined", undefined)).toBe(false);
  });
});

describe("makeCronHandler", () => {
  const props = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
  const base = { secret: SECRET, listProperties: async () => props };

  it("answers 503 without touching anything when the secret is not configured", async () => {
    let called = 0;
    const h = makeCronHandler({ ...base, secret: undefined, refresh: async () => void called++ as never });
    expect((await h(req(`Bearer ${SECRET}`))).status).toBe(503);
    expect(called).toBe(0);
  });

  it("answers 401 for a wrong or missing token and refreshes nothing", async () => {
    let called = 0;
    const h = makeCronHandler({ ...base, refresh: async () => (called++, 1) });
    expect((await h(req())).status).toBe(401);
    expect((await h(req("Bearer nope-nope-nope-nope-nope"))).status).toBe(401);
    expect(called).toBe(0);
  });

  it("refreshes every property and totals the rates saved", async () => {
    const seen: string[] = [];
    const h = makeCronHandler({ ...base, refresh: async (p) => (seen.push(p.id), 10) });
    const res = await h(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ properties: 3, rates: 30, failed: 0 });
    expect(seen).toEqual(["p1", "p2", "p3"]);
  });

  it("one hostel failing does not stop the others, and is counted", async () => {
    const h = makeCronHandler({ ...base, refresh: async (p) => { if (p.id === "p2") throw new Error("boom"); return 5; } });
    const res = await h(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ properties: 3, rates: 10, failed: 1 });
  });
});
