import { describe, expect, it } from "vitest";

import { formatValue } from "./chart-format";

describe("formatValue", () => {
  it("formats cents as whole dollars", () => {
    expect(formatValue("dollars", 51_234)).toBe("$512");
    expect(formatValue("dollars", 0)).toBe("$0");
    expect(formatValue("dollars", 120_000_000)).toBe("$1,200,000");
  });

  it("formats a 0-1 share as a whole percent", () => {
    expect(formatValue("percent", 0.5)).toBe("50%");
    expect(formatValue("percent", 0.666)).toBe("67%");
    expect(formatValue("percent", 0)).toBe("0%");
  });

  it("formats counts as whole numbers and ratings to one decimal", () => {
    expect(formatValue("count", 12.4)).toBe("12");
    expect(formatValue("rating", 4.44)).toBe("4.4");
    expect(formatValue("rating", 5)).toBe("5.0");
  });

  it("never returns NaN text", () => {
    expect(formatValue("percent", Number.NaN)).toBe("0%");
    expect(formatValue("dollars", Number.NaN)).toBe("$0");
  });
});
