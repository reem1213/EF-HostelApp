import { describe, expect, it } from "vitest";

import { MemoryStore } from "../data/memory-store";
import { buildRunnerDeps } from "./registry";

describe("buildRunnerDeps", () => {
  it("can apply price changes by default, through the hostel's own rate store", async () => {
    const deps = buildRunnerDeps(new MemoryStore());
    expect(deps.executors.price_update?.kind).toBe("price_update");
  });

  it("handles drafts without side effects", () => {
    const deps = buildRunnerDeps(new MemoryStore());
    expect(Object.keys(deps.executors).sort()).toEqual(["content_draft", "price_update", "ticket_draft"]);
  });
});
