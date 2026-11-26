import { describe, expect, it } from "vitest";

import { MemoryStore } from "./memory-store";

async function setup() {
  const store = new MemoryStore();
  const prop = await store.createProperty("owner", { name: "H", beds: 10, currency: "USD", country: "US" }, "Owner@X.com");
  return { store, prop };
}

describe("team membership (memory store)", () => {
  it("the creator becomes the owner and finds their property", async () => {
    const { store, prop } = await setup();
    expect((await store.getProperty("owner"))?.id).toBe(prop.id);
    expect(await store.listMembers(prop.id)).toEqual([{ userId: "owner", email: "owner@x.com", role: "owner" }]);
    expect(await store.getProperty("stranger")).toBeNull();
  });

  it("free plan has no spare seat; team plan allows two more", async () => {
    const { store, prop } = await setup();
    await expect(store.invite(prop.id, "a@x.com", "owner")).rejects.toThrow(/seat limit/);
    store.setPlan(prop.id, "team");
    await store.invite(prop.id, "a@x.com", "owner");
    await store.invite(prop.id, "b@x.com", "owner");
    await expect(store.invite(prop.id, "c@x.com", "owner")).rejects.toThrow(/seat limit/);
    expect(await store.listInvites(prop.id)).toEqual(["a@x.com", "b@x.com"]);
  });

  it("an invited person joins as a manager when they sign in, and the invite is used up", async () => {
    const { store, prop } = await setup();
    store.setPlan(prop.id, "team");
    await store.invite(prop.id, "Ann@X.com", "owner");
    const joined = await store.acceptInvitesFor("ann", "ann@x.com");
    expect(joined?.id).toBe(prop.id);
    expect((await store.getProperty("ann"))?.id).toBe(prop.id);
    expect((await store.listMembers(prop.id)).map((m) => [m.userId, m.role])).toEqual([["owner", "owner"], ["ann", "manager"]]);
    expect(await store.listInvites(prop.id)).toEqual([]);
  });

  it("someone who was not invited, or who already belongs to a property, joins nothing", async () => {
    const { store, prop } = await setup();
    store.setPlan(prop.id, "team");
    await store.invite(prop.id, "ann@x.com", "owner");
    expect(await store.acceptInvitesFor("zed", "zed@x.com")).toBeNull();
    expect(await store.acceptInvitesFor("owner", "ann@x.com")).toBeNull();
  });

  it("the owner can remove a manager but never the owner", async () => {
    const { store, prop } = await setup();
    store.setPlan(prop.id, "team");
    await store.invite(prop.id, "ann@x.com", "owner");
    await store.acceptInvitesFor("ann", "ann@x.com");
    await store.removeMember(prop.id, "ann");
    await store.removeMember(prop.id, "owner");
    expect((await store.listMembers(prop.id)).map((m) => m.userId)).toEqual(["owner"]);
    expect(await store.getProperty("ann")).toBeNull();
  });

  it("revoking an invite frees the seat", async () => {
    const { store, prop } = await setup();
    store.setPlan(prop.id, "team");
    await store.invite(prop.id, "a@x.com", "owner");
    await store.invite(prop.id, "b@x.com", "owner");
    await store.revokeInvite(prop.id, "A@x.com");
    await store.invite(prop.id, "c@x.com", "owner");
    expect(await store.listInvites(prop.id)).toEqual(["b@x.com", "c@x.com"]);
  });
});
