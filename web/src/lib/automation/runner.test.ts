import { describe, expect, it } from "vitest";

import { MemoryStore } from "../data/memory-store";
import { approveRun, AutomationError, proposeRun, rejectRun, undoRun } from "./runner";
import type { ActionRun, Executor } from "./types";

const NOW = new Date("2026-11-25T10:00:00Z");

async function setup() {
  const store = new MemoryStore();
  const property = await store.createProperty("u1", { name: "H", beds: 10, currency: "USD", country: "US" });
  const other = await store.createProperty("u2", { name: "Other", beds: 5, currency: "USD", country: "US" });
  const calls = { apply: 0, undo: 0 };
  const executor: Executor = {
    kind: "price_update",
    async apply() {
      calls.apply++;
      await new Promise((r) => setTimeout(r, 5));
      return { before: 3000, after: 3400, simulated: true, reversible: true };
    },
    async undo() {
      calls.undo++;
    },
    canUndo: () => true,
  };
  const deps = { store, executors: { price_update: executor }, now: () => NOW };
  const propose = (propertyId = property.id) => proposeRun(deps, propertyId, { kind: "price_update", title: "Set Tue to $34", params: { priceCents: 3400 }, createdBy: "u1" });
  return { store, property, other, calls, deps, propose, executor };
}

describe("proposeRun", () => {
  it("records a proposal that nothing has acted on yet", async () => {
    const { propose } = await setup();
    const run = await propose();
    expect(run).toMatchObject({ kind: "price_update", title: "Set Tue to $34", status: "proposed", createdBy: "u1", approvedBy: null, appliedAt: null, error: null });
    expect(run.params).toEqual({ priceCents: 3400 });
  });
});

describe("approveRun", () => {
  it("applies the change, recording before, after, who approved and when", async () => {
    const { deps, property, propose } = await setup();
    const run = await propose();
    const done = await approveRun(deps, property.id, run.id, "u1");
    expect(done).toMatchObject({ status: "applied", before: 3000, after: 3400, simulated: true, reversible: true, approvedBy: "u1", error: null });
    expect(done.appliedAt).toEqual(NOW);
  });

  it("is idempotent: approving twice runs the executor once", async () => {
    const { deps, property, propose, calls } = await setup();
    const run = await propose();
    await approveRun(deps, property.id, run.id, "u1");
    const again = await approveRun(deps, property.id, run.id, "u1");
    expect(again.status).toBe("applied");
    expect(calls.apply).toBe(1);
  });

  it("two simultaneous approvals still apply only once", async () => {
    const { deps, property, propose, calls } = await setup();
    const run = await propose();
    const [a, b] = await Promise.all([approveRun(deps, property.id, run.id, "u1"), approveRun(deps, property.id, run.id, "u1")]);
    expect(calls.apply).toBe(1);
    expect([a.status, b.status]).toContain("applied");
  });

  it("a failing executor leaves a failed run with the reason, and is not retried by a second approval", async () => {
    const { store, property } = await setup();
    let attempts = 0;
    const failing: Executor = { kind: "price_update", async apply() { attempts++; throw new Error("PMS said no"); } };
    const deps = { store, executors: { price_update: failing }, now: () => NOW };
    const run = await proposeRun(deps, property.id, { kind: "price_update", title: "x", params: {}, createdBy: "u1" });
    const failed = await approveRun(deps, property.id, run.id, "u1");
    expect(failed).toMatchObject({ status: "failed", error: "PMS said no", appliedAt: null });
    await approveRun(deps, property.id, run.id, "u1");
    expect(attempts).toBe(1);
  });

  it("fails clearly when nothing can execute that kind of change", async () => {
    const { store, property } = await setup();
    const deps = { store, executors: {}, now: () => NOW };
    const run = await proposeRun(deps, property.id, { kind: "email_campaign", title: "x", params: {}, createdBy: "u1" });
    expect(await approveRun(deps, property.id, run.id, "u1")).toMatchObject({ status: "failed", error: expect.stringMatching(/no executor/i) });
  });

  it("will not touch another property's run", async () => {
    const { deps, other, propose, property } = await setup();
    const run = await propose(property.id);
    await expect(approveRun(deps, other.id, run.id, "u2")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("rejectRun", () => {
  it("a rejected proposal can no longer be applied", async () => {
    const { deps, property, propose, calls } = await setup();
    const run = await propose();
    expect((await rejectRun(deps, property.id, run.id, "u1")).status).toBe("rejected");
    expect((await approveRun(deps, property.id, run.id, "u1")).status).toBe("rejected");
    expect(calls.apply).toBe(0);
  });
});

describe("undoRun", () => {
  it("reverses an applied, reversible change", async () => {
    const { deps, property, propose, calls } = await setup();
    const run = await propose();
    await approveRun(deps, property.id, run.id, "u1");
    const undone = await undoRun(deps, property.id, run.id, "u1");
    expect(undone.status).toBe("undone");
    expect(calls.undo).toBe(1);
  });

  it("refuses to undo something never applied", async () => {
    const { deps, property, propose } = await setup();
    const run = await propose();
    await expect(undoRun(deps, property.id, run.id, "u1")).rejects.toMatchObject({ code: "not_applied" });
  });

  it("refuses a change that was recorded as not reversible", async () => {
    const { store, property } = await setup();
    const oneWay: Executor = { kind: "price_update", async apply() { return { before: null, after: 1, simulated: false, reversible: false }; } };
    const deps = { store, executors: { price_update: oneWay }, now: () => NOW };
    const run = await proposeRun(deps, property.id, { kind: "price_update", title: "x", params: {}, createdBy: "u1" });
    await approveRun(deps, property.id, run.id, "u1");
    await expect(undoRun(deps, property.id, run.id, "u1")).rejects.toMatchObject({ code: "not_reversible" });
  });

  it("refuses when the executor says the window to undo has closed (a night that has passed)", async () => {
    const { store, property } = await setup();
    const late: Executor = { kind: "price_update", async apply() { return { before: 1, after: 2, simulated: true, reversible: true }; }, async undo() {}, canUndo: () => false };
    const deps = { store, executors: { price_update: late }, now: () => NOW };
    const run = await proposeRun(deps, property.id, { kind: "price_update", title: "x", params: {}, createdBy: "u1" });
    await approveRun(deps, property.id, run.id, "u1");
    await expect(undoRun(deps, property.id, run.id, "u1")).rejects.toBeInstanceOf(AutomationError);
    await expect(undoRun(deps, property.id, run.id, "u1")).rejects.toMatchObject({ code: "night_passed" });
  });
});

describe("listRuns", () => {
  it("lists a property's runs newest first", async () => {
    const { store, property, propose } = await setup();
    const a = await propose();
    await new Promise((r) => setTimeout(r, 3));
    const b = await propose();
    const runs: ActionRun[] = await store.listRuns(property.id, 10);
    expect(runs.map((r) => r.id)).toEqual([b.id, a.id]);
  });
});
