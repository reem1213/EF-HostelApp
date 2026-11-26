import { describe, expect, it } from "vitest";

import { buildRunnerDeps } from "../automation/registry";
import { approveRun, proposeRun } from "../automation/runner";
import { MemoryStore } from "../data/memory-store";
import type { Property } from "../data/store";
import { verifyUnsubscribe } from "./unsubscribe";

const SECRET = "a-long-enough-secret-value";
const DAY = 86_400_000;
const NOW = new Date(Date.UTC(2026, 10, 26));

async function setup(over: Partial<Pick<Property, "postalAddress" | "replyToEmail">> = {}) {
  const store = new MemoryStore();
  const created = await store.createProperty("u1", { name: "Roam Quarter Hostel", beds: 10, currency: "USD", country: "US" });
  await store.updateProperty(created.id, { postalAddress: "12 Main St, Chicago, IL", replyToEmail: "hello@roam.example", ...over });
  const property = { ...created, postalAddress: "12 Main St, Chicago, IL", replyToEmail: "hello@roam.example", ...over };
  const imp = await store.recordImport(property.id, { kind: "bookings", filename: "f.csv", fileHash: "h", rowsOk: 6, rowsFailed: 0, errors: [] });
  const row = (id: string, key: string, off: number) => ({ externalId: id, guestKey: key, channel: "direct" as const, checkIn: new Date(NOW.getTime() + off * DAY), nights: 2, revenueCents: 4000 });
  await store.addBookings(property.id, imp.id, [
    row("1", "ann@example.com", -200), row("2", "ann@example.com", -100),
    row("3", "bob@example.com", -300), row("4", "bob@example.com", -150),
    row("5", "relay@guest.booking.com", -300), row("6", "relay@guest.booking.com", -100),
  ]);
  return { store, property };
}

const deps = (s: Awaited<ReturnType<typeof setup>>, extra: { apiKey?: string; from?: string; fetchImpl?: typeof fetch } = {}) =>
  buildRunnerDeps(s.store, { now: () => NOW, email: { property: s.property, siteUrl: "https://app.example", unsubscribeSecret: SECRET, ...extra } });

const propose = (s: Awaited<ReturnType<typeof setup>>, d: ReturnType<typeof deps>, params: Record<string, unknown> = { template: "welcome_back", code: "BACK10", discountPct: 10 }) =>
  proposeRun(d, s.property.id, { kind: "email_campaign", title: "Welcome back email", params, createdBy: "u1" });

describe("email campaign executor", () => {
  it("is registered only when email settings are provided", async () => {
    expect(buildRunnerDeps(new MemoryStore()).executors.email_campaign).toBeUndefined();
    expect(deps(await setup()).executors.email_campaign?.kind).toBe("email_campaign");
  });

  it("with no provider sends nothing, fills the outbox, and reports it as simulated", async () => {
    const s = await setup();
    const d = deps(s);
    const run = await approveRun(d, s.property.id, (await propose(s, d)).id, "u1");
    expect(run.status).toBe("applied");
    expect(run.simulated).toBe(true);
    expect(run.after).toMatchObject({ audience: 2, sent: 0, mode: "outbox" });
    const out = await s.store.listOutbox(s.property.id);
    expect(out).toHaveLength(2);
    expect(out.every((o) => o.status === "not_sent" && !o.maskedEmail.includes("ann@"))).toBe(true);
    expect(await s.store.listCampaigns(s.property.id)).toHaveLength(1);
  });

  it("with a provider sends to each real guest with a signed unsubscribe link, and not to relay addresses", async () => {
    const s = await setup();
    const sent: { to: string[]; text: string; subject: string }[] = [];
    const d = deps(s, { apiKey: "re_x", from: "hello@mail.example", fetchImpl: async (_u, init) => (sent.push(JSON.parse(String(init?.body))), new Response("{}", { status: 200 })) });
    const run = await approveRun(d, s.property.id, (await propose(s, d)).id, "u1");
    expect(run.simulated).toBe(false);
    expect(run.after).toMatchObject({ audience: 2, sent: 2, mode: "sent" });
    expect(sent.map((x) => x.to[0]).sort()).toEqual(["ann@example.com", "bob@example.com"]);
    const link = sent[0].text.match(/https:\/\/app\.example\/unsubscribe\/([\w.-]+)/)![1];
    expect(verifyUnsubscribe(link, SECRET)).toEqual({ propertyId: s.property.id, email: sent[0].to[0] });
    expect(sent[0].text).toContain("12 Main St");
  });

  it("leaves out guests who unsubscribed since the campaign was proposed", async () => {
    const s = await setup();
    const d = deps(s);
    const id = (await propose(s, d)).id;
    await s.store.addSuppression(s.property.id, "ann@example.com");
    const run = await approveRun(d, s.property.id, id, "u1");
    expect(run.after).toMatchObject({ audience: 1 });
  });

  it("fails clearly, sending nothing, with no postal address or no guests", async () => {
    const s = await setup({ postalAddress: "" });
    const d = deps(s);
    const run = await approveRun(d, s.property.id, (await propose(s, d)).id, "u1");
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/postal address/i);
    expect(await s.store.listOutbox(s.property.id)).toHaveLength(0);

    const empty = await setup();
    await empty.store.addSuppression(empty.property.id, "ann@example.com");
    await empty.store.addSuppression(empty.property.id, "bob@example.com");
    const d2 = deps(empty);
    const run2 = await approveRun(d2, empty.property.id, (await propose(empty, d2)).id, "u1");
    expect(run2.status).toBe("failed");
    expect(run2.error).toMatch(/no guests/i);
  });

  it("rejects an unknown template", async () => {
    const s = await setup();
    const d = deps(s);
    const run = await approveRun(d, s.property.id, (await propose(s, d, { template: "spam" })).id, "u1");
    expect(run.status).toBe("failed");
  });

  it("cannot be undone", async () => {
    const s = await setup();
    const d = deps(s);
    const run = await approveRun(d, s.property.id, (await propose(s, d)).id, "u1");
    expect(run.reversible).toBe(false);
  });
});
