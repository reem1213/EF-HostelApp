import { describe, expect, it } from "vitest";

import { scoreSite } from "./score";

const GOOD = `<!doctype html><html><head>
<title>Roam Quarter Hostel | Budget beds in Chicago</title>
<meta name="description" content="Clean, friendly hostel beds in downtown Chicago with free breakfast, a rooftop and private rooms. Book direct for the best price and flexible cancellation.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Hostel","name":"Roam Quarter Hostel"}</script>
</head><body><h1>Hostel beds in Chicago</h1><img src="a.jpg" alt="Dorm room"><a href="https://book.example.com/reserve">Book now</a></body></html>`;
const hostel = { name: "Roam Quarter Hostel", city: "Chicago" };
const byId = (r: ReturnType<typeof scoreSite>) => Object.fromEntries(r.checks.map((c) => [c.id, c]));

describe("scoreSite", () => {
  it("passes every check on a well-built page and scores 100", () => {
    const r = scoreSite(GOOD, "https://roam.example/", hostel);
    expect(r.checks.filter((c) => !c.pass).map((c) => c.id)).toEqual([]);
    expect(r.score).toBe(100);
  });

  it("fails every check on a bare page, each with a specific fix", () => {
    const r = scoreSite("<html><body><p>Welcome</p></body></html>", "https://roam.example/", hostel);
    expect(r.score).toBe(0);
    expect(r.checks.every((c) => !c.pass && c.fix.length > 20)).toBe(true);
    expect(new Set(r.checks.map((c) => c.fix)).size).toBe(r.checks.length);
  });

  it("flags a missing or too-short title and description separately", () => {
    const r = byId(scoreSite("<html><head><title>Hi</title><meta name='description' content='Short'></head><body></body></html>", "https://x.example/", hostel));
    expect(r.title.pass).toBe(false);
    expect(r.description.pass).toBe(false);
    expect(r.description.fix).toMatch(/70/);
  });

  it("flags more than one h1", () => {
    const r = byId(scoreSite(GOOD.replace("<body>", "<body><h1>Another</h1>"), "https://x.example/", hostel));
    expect(r.h1.pass).toBe(false);
  });

  it("flags images without alt text", () => {
    const r = byId(scoreSite(GOOD.replace('alt="Dorm room"', ""), "https://x.example/", hostel));
    expect(r.alt.pass).toBe(false);
  });

  it("looks for the city or the word hostel in the title or main heading", () => {
    const page = GOOD.replace(/Roam Quarter Hostel \| Budget beds in Chicago/, "Welcome").replace("Hostel beds in Chicago", "Welcome");
    expect(byId(scoreSite(page, "https://x.example/", hostel)).keywords.pass).toBe(false);
    expect(byId(scoreSite(GOOD, "https://x.example/", hostel)).keywords.pass).toBe(true);
  });

  it("tolerates invalid JSON-LD and unusual markup without throwing", () => {
    const r = scoreSite(GOOD.replace('{"@context"', "{broken"), "https://x.example/", hostel);
    expect(byId(r).structured.pass).toBe(false);
    expect(() => scoreSite("", "https://x.example/", hostel)).not.toThrow();
  });

  it("recognises JSON-LD with an array of types or a @graph", () => {
    const g = GOOD.replace(/\{"@context".*?\}<\/script>/, '{"@context":"https://schema.org","@graph":[{"@type":["Organization","LodgingBusiness"]}]}</script>');
    expect(byId(scoreSite(g, "https://x.example/", hostel)).structured.pass).toBe(true);
  });
});
