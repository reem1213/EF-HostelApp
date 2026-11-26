import { describe, expect, it } from "vitest";

import { renderEmail, type TemplateId } from "./templates";

const v = { hostelName: "Roam Quarter Hostel", postalAddress: "12 Main St, Chicago, IL 60601", replyTo: "hello@roam.example", unsubscribeUrl: "https://app.example/unsubscribe/tok.en", code: "WELCOME10", discountPct: 10 };
const IDS: TemplateId[] = ["welcome_back", "seasonal", "review_request"];

describe("renderEmail", () => {
  it.each(IDS)("%s includes the hostel, postal address and unsubscribe link in html and text", (id) => {
    const m = renderEmail(id, v);
    for (const part of [m.html, m.text]) {
      expect(part).toContain("Roam Quarter Hostel");
      expect(part).toContain("12 Main St, Chicago, IL 60601");
      expect(part).toContain("https://app.example/unsubscribe/tok.en");
    }
    expect(m.subject.length).toBeGreaterThan(5);
  });

  it("the three templates differ", () => {
    const out = IDS.map((id) => renderEmail(id, v));
    expect(new Set(out.map((o) => o.subject)).size).toBe(3);
    expect(new Set(out.map((o) => o.text)).size).toBe(3);
  });

  it("welcome back shows the direct code and discount only when given", () => {
    expect(renderEmail("welcome_back", v).text).toMatch(/WELCOME10/);
    expect(renderEmail("welcome_back", v).text).toMatch(/10%/);
    const bare = renderEmail("welcome_back", { ...v, code: undefined, discountPct: undefined });
    expect(bare.text).not.toMatch(/undefined|null|%/);
  });

  it("throws without a postal address or an unsubscribe link", () => {
    expect(() => renderEmail("seasonal", { ...v, postalAddress: "  " })).toThrow(/postal address/i);
    expect(() => renderEmail("seasonal", { ...v, unsubscribeUrl: "" })).toThrow(/unsubscribe/i);
  });

  it("escapes the hostel's name and address in html", () => {
    const m = renderEmail("seasonal", { ...v, hostelName: "<script>alert(1)</script> & Co", postalAddress: "1 <b>St</b>" });
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<b>St</b>");
    expect(m.html).toContain("&amp; Co");
  });

  it("only links to http(s) addresses", () => {
    expect(() => renderEmail("seasonal", { ...v, unsubscribeUrl: "javascript:alert(1)" })).toThrow();
  });
});
