import { describe, expect, it } from "vitest";

import { makeDailyCap } from "./cap";

describe("makeDailyCap", () => {
  const d = (day: number, h = 12) => new Date(Date.UTC(2026, 10, day, h));
  it("allows the limit per key per day, then blocks, and resets the next day", () => {
    const allow = makeDailyCap(2);
    expect(allow("a", d(1))).toBe(true);
    expect(allow("a", d(1, 20))).toBe(true);
    expect(allow("a", d(1, 23))).toBe(false);
    expect(allow("a", d(2, 1))).toBe(true);
  });
  it("counts each key separately", () => {
    const allow = makeDailyCap(1);
    expect(allow("a", d(1))).toBe(true);
    expect(allow("b", d(1))).toBe(true);
    expect(allow("a", d(1))).toBe(false);
  });
});
