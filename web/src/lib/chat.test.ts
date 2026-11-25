import { describe, expect, it } from "vitest";

import { buildChatContext, chatRequestSchema, makeRateLimiter, MAX_MESSAGE_CHARS, systemPrompt } from "./chat";
import { loadDashboard } from "./dashboard";
import { seedDemo } from "./data/demo-seed";
import { MemoryStore } from "./data/memory-store";

const now = new Date(Date.UTC(2026, 10, 24, 12));

describe("chat context", () => {
  it("summarises the property with figures and ranked steps, without personal data", async () => {
    const store = new MemoryStore();
    const p = await seedDemo(store, "u", now);
    const ctx = buildChatContext(await loadDashboard(store, p, now));
    expect(ctx).toContain("Roam Quarter Hostel");
    expect(ctx).toMatch(/Cost per occupied bed: \$\d+\.\d\d/);
    expect(ctx).toContain("Ranked next steps:");
    expect(ctx).toContain("Steps:");
    // Aggregates only: no guest emails, no merchant-level transactions.
    expect(ctx).not.toMatch(/@example\.com/);
    expect(ctx).not.toContain("Clean Linen Co");
  });

  it("tells the model when data is missing instead of leaving it to guess", async () => {
    const store = new MemoryStore();
    const p = await store.createProperty("u2", { name: "Empty", beds: 10, currency: "USD", country: "US" });
    const ctx = buildChatContext(await loadDashboard(store, p, now));
    expect(ctx).toContain("none imported yet");
    expect(ctx).toContain("Costs: not entered yet.");
    expect(ctx).toMatch(/setup/i);
  });

  it("instructs the model to act, stay grounded and avoid inventing numbers", () => {
    const sys = systemPrompt("CTX");
    expect(sys).toContain("what to DO next");
    expect(sys).toContain("Never invent figures");
    expect(sys.endsWith("CTX")).toBe(true);
  });
});

describe("chat request validation", () => {
  it("accepts a normal conversation ending with a user message", () => {
    expect(chatRequestSchema.safeParse({ messages: [{ role: "user", content: "hi" }] }).success).toBe(true);
    expect(
      chatRequestSchema.safeParse({ messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" }] }).success,
    ).toBe(true);
  });

  it("rejects empty, oversized, unknown-role and assistant-last requests", () => {
    expect(chatRequestSchema.safeParse({ messages: [] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: [{ role: "user", content: "x".repeat(MAX_MESSAGE_CHARS + 1) }] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: [{ role: "system", content: "x" }] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: [{ role: "assistant", content: "x" }] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: Array.from({ length: 21 }, () => ({ role: "user", content: "x" })) }).success).toBe(false);
    expect(chatRequestSchema.safeParse(null).success).toBe(false);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window, per user, then recovers", () => {
    const allow = makeRateLimiter(2, 1000);
    expect(allow("a", 0)).toBe(true);
    expect(allow("a", 100)).toBe(true);
    expect(allow("a", 200)).toBe(false);
    expect(allow("b", 200)).toBe(true);
    expect(allow("a", 1201)).toBe(true);
  });
});
