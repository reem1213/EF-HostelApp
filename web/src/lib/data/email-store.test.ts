import { describe, expect, it } from "vitest";

import { MemoryStore } from "./memory-store";

async function setup() {
  const store = new MemoryStore();
  const property = await store.createProperty("u1", { name: "H", beds: 10, currency: "USD", country: "US" });
  return { store, property };
}

describe("email data in the store", () => {
  it("keeps a suppression list per hostel, lowercase, without duplicates", async () => {
    const { store, property } = await setup();
    const other = await store.createProperty("u2", { name: "O", beds: 5, currency: "USD", country: "US" });
    await store.addSuppression(property.id, "Ann@Example.com");
    await store.addSuppression(property.id, "ann@example.com");
    expect(await store.listSuppressions(property.id)).toEqual(["ann@example.com"]);
    expect(await store.listSuppressions(other.id)).toEqual([]);
  });

  it("records outbox rows and lists the newest first, limited", async () => {
    const { store, property } = await setup();
    await store.addOutbox(property.id, [{ maskedEmail: "a***@x.com", subject: "S1", status: "not_sent" }]);
    await store.addOutbox(property.id, [{ maskedEmail: "b***@x.com", subject: "S2", status: "sent" }, { maskedEmail: "c***@x.com", subject: "S2", status: "failed", error: "no" }]);
    const rows = await store.listOutbox(property.id, 2);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.subject)).not.toContain("S1");
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });

  it("records campaigns and lists them newest first", async () => {
    const { store, property } = await setup();
    await store.recordCampaign(property.id, { template: "welcome_back", subject: "A", audience: 10, sent: 0, skipped: 0, mode: "outbox", createdBy: "u1" });
    await store.recordCampaign(property.id, { template: "seasonal", subject: "B", audience: 8, sent: 8, skipped: 0, mode: "sent", createdBy: "u1" });
    expect((await store.listCampaigns(property.id, 5)).map((c) => c.subject)).toEqual(["B", "A"]);
  });
});
