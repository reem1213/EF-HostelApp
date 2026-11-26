import { describe, expect, it } from "vitest";

import { buildSeoPrompt, parseSeoCopy } from "./seo-copy";

describe("buildSeoPrompt", () => {
  it("includes the hostel, the failed checks, and bans invented facts", () => {
    const p = buildSeoPrompt({ name: "Roam Quarter Hostel", city: "Chicago", currentTitle: "Home", currentDescription: null, failed: ["Meta description is missing"] });
    expect(p).toContain("Roam Quarter Hostel");
    expect(p).toContain("Chicago");
    expect(p).toContain("Meta description is missing");
    expect(p).toMatch(/do not invent/i);
  });
});

describe("parseSeoCopy", () => {
  it("reads title, description and intro, and trims them to search-friendly lengths", () => {
    const out = parseSeoCopy(`TITLE: ${"T".repeat(80)}\nDESCRIPTION: ${"D".repeat(200)}\nINTRO: Welcome to the hostel.\nIt is great.`);
    expect(out?.title.length).toBeLessThanOrEqual(60);
    expect(out?.description.length).toBeLessThanOrEqual(155);
    expect(out?.intro).toBe("Welcome to the hostel. It is great.");
  });
  it("returns null when a part is missing", () => {
    expect(parseSeoCopy("TITLE: Only a title")).toBeNull();
    expect(parseSeoCopy("")).toBeNull();
  });
});
