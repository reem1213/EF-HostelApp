import { describe, expect, it } from "vitest";

import { buildReasonPrompt, parseReasons } from "./quiet-reasons";

const night = { date: new Date(Date.UTC(2026, 11, 1)), weekday: 2, occupancy: 0.1, weekdayAvg: 0.4, gap: 0.3 };

describe("buildReasonPrompt", () => {
  it("includes the night and the supplied facts", () => {
    const p = buildReasonPrompt(night, { rateVsCompMedianPct: 12, leadTimeDays: 7 }, []);
    expect(p).toMatch(/Tuesday/);
    expect(p).toMatch(/Dec 1/);
    expect(p).toMatch(/10%/);
    expect(p).toMatch(/40%/);
    expect(p).toMatch(/12% above/);
    expect(p).toMatch(/7 days/);
  });

  it("with no events, says none were available and forbids naming events or news", () => {
    const p = buildReasonPrompt(night, { rateVsCompMedianPct: null, leadTimeDays: null }, []);
    expect(p).toMatch(/no event data was available/i);
    expect(p).toMatch(/never name/i);
    expect(p).toMatch(/no competitor price/i);
  });

  it("with events, lists each title and link", () => {
    const p = buildReasonPrompt(night, { rateVsCompMedianPct: -5, leadTimeDays: 3 }, [{ title: "Marathon", url: "https://example.com/m" }]);
    expect(p).toContain("Marathon");
    expect(p).toContain("https://example.com/m");
    expect(p).toMatch(/5% below/);
  });
});

describe("parseReasons", () => {
  it("keeps up to four bullet lines and marks each as possible", () => {
    const out = parseReasons("- Midweek travel is slow\n- Your price is above rivals\n\nnot a bullet\n* Short notice\n- a\n- b\n- c");
    expect(out).toHaveLength(4);
    expect(out[0]).toBe("Possible: Midweek travel is slow");
    expect(out.every((r) => r.startsWith("Possible: "))).toBe(true);
  });
  it("does not double the word possible, and returns nothing for empty text", () => {
    expect(parseReasons("- Possible: slow week")[0]).toBe("Possible: Slow week");
    expect(parseReasons("")).toEqual([]);
  });
});
