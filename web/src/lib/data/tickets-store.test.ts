import { describe, expect, it } from "vitest";

import { MemoryStore } from "./memory-store";

async function setup() {
  const store = new MemoryStore();
  const property = await store.createProperty("u1", { name: "H", beds: 10, currency: "USD", country: "US" });
  return { store, property };
}

describe("tickets in the store", () => {
  it("starts empty", async () => {
    const { store, property } = await setup();
    expect(await store.listTickets(property.id)).toEqual([]);
  });

  it("keeps one ticket per booking site: saving again updates it", async () => {
    const { store, property } = await setup();
    await store.upsertTicket(property.id, { otaId: "booking_com", status: "draft", subject: "S", body: "B" });
    await store.upsertTicket(property.id, { otaId: "booking_com", status: "submitted", subject: "S", body: "B" });
    await store.upsertTicket(property.id, { otaId: "hostelworld", status: "draft", subject: "S2", body: "B2" });
    const list = await store.listTickets(property.id);
    expect(list).toHaveLength(2);
    expect(list.find((t) => t.otaId === "booking_com")?.status).toBe("submitted");
  });

  it("stamps when a ticket was submitted and answered", async () => {
    const { store, property } = await setup();
    await store.upsertTicket(property.id, { otaId: "booking_com", status: "draft", subject: "S", body: "B" });
    expect((await store.listTickets(property.id))[0].submittedAt).toBeNull();
    await store.upsertTicket(property.id, { otaId: "booking_com", status: "submitted", subject: "S", body: "B" });
    const t = (await store.listTickets(property.id))[0];
    expect(t.submittedAt).toBeInstanceOf(Date);
    expect(t.answeredAt).toBeNull();
    await store.upsertTicket(property.id, { otaId: "booking_com", status: "answered", subject: "S", body: "B" });
    expect((await store.listTickets(property.id))[0].answeredAt).toBeInstanceOf(Date);
  });

  it("keeps hostels' tickets apart", async () => {
    const { store, property } = await setup();
    const other = await store.createProperty("u2", { name: "O", beds: 5, currency: "USD", country: "US" });
    await store.upsertTicket(property.id, { otaId: "booking_com", status: "draft", subject: "S", body: "B" });
    expect(await store.listTickets(other.id)).toEqual([]);
  });
});
