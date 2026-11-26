import { describe, expect, it } from "vitest";

import { axisTicks, niceMax } from "./chart-math";

describe("niceMax", () => {
  it("rounds up to 1, 2 or 5 times a power of ten", () => {
    expect(niceMax(37)).toBe(50);
    expect(niceMax(4.2)).toBe(5);
    expect(niceMax(10)).toBe(10);
    expect(niceMax(10.1)).toBe(20);
    expect(niceMax(190)).toBe(200);
    expect(niceMax(201)).toBe(500);
    expect(niceMax(0.03)).toBeCloseTo(0.05, 9);
  });

  it("never returns zero or a non-finite number", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-5)).toBe(1);
    expect(niceMax(Number.NaN)).toBe(1);
    expect(niceMax(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("axisTicks", () => {
  it("gives zero, half and the max", () => {
    expect(axisTicks(200)).toEqual([0, 100, 200]);
  });
});
