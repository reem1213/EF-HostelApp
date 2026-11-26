import * as cheerio from "cheerio";

export type SiteCheck = { id: string; label: string; pass: boolean; fix: string };

const BOOKING_HOSTS = /cloudbeds|hostaway|littlehotelier|thebookingbutton|beds24|checkfront|resnexus|roomraccoon|mews|guestline|sirvoy|book\./i;
const BOOK_WORDS = /\b(book|reserve|reservation|availability|check availability)\b/i;
const LODGING_TYPES = new Set(["lodgingbusiness", "hostel", "hotel", "bedandbreakfast", "lodging", "motel", "resort", "apartment"]);

function jsonLdTypes(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => jsonLdTypes(n, out));
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    const t = o["@type"];
    for (const x of Array.isArray(t) ? t : t ? [t] : []) if (typeof x === "string") out.push(x.toLowerCase());
    if (o["@graph"]) jsonLdTypes(o["@graph"], out);
  }
  return out;
}

/** Plain, repeatable checks of the basics Google reads on a hostel's site. No guessing: each has a specific fix. */
export function scoreSite(html: string, _url: string, hostel: { name: string; city?: string }): { score: number; checks: SiteCheck[] } {
  const $ = cheerio.load(html || "");
  const title = $("head title").first().text().trim();
  const desc = ($('meta[name="description"]').attr("content") ?? "").trim();
  const h1s = $("h1");
  const images = $("img").toArray();
  const withAlt = images.filter((i) => ($(i).attr("alt") ?? "").trim() !== "").length;

  let hasLodging = false;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      if (jsonLdTypes(JSON.parse($(el).text())).some((t) => LODGING_TYPES.has(t))) hasLodging = true;
    } catch {
      /* invalid JSON-LD counts as missing */
    }
  });

  const links = $("a[href]").toArray();
  const hasBooking = links.some((a) => {
    const href = $(a).attr("href") ?? "";
    return BOOK_WORDS.test($(a).text()) || BOOK_WORDS.test(href) || BOOKING_HOSTS.test(href);
  });

  const focus = [title, h1s.first().text()].join(" ").toLowerCase();
  const city = hostel.city?.trim().toLowerCase();
  const hasKeywords = focus.includes("hostel") || (city ? focus.includes(city) : false);
  const place = hostel.city ? ` ${hostel.city}` : "";

  const checks: SiteCheck[] = [
    { id: "title", label: "Page title", pass: title.length >= 20 && title.length <= 65, fix: `Write a page title of 20 to 65 characters that says what you are and where, like "${hostel.name} | Hostel beds${place ? ` in${place}` : ""}".` },
    { id: "description", label: "Search description", pass: desc.length >= 70 && desc.length <= 160, fix: "Add a meta description of 70 to 160 characters: what makes the hostel different, and an invitation to book direct." },
    { id: "h1", label: "One main heading", pass: h1s.length === 1 && h1s.first().text().trim().length > 0, fix: "Use exactly one h1 heading on the page, and put the hostel type and place in it." },
    { id: "keywords", label: `Says "hostel"${city ? ` or ${hostel.city}` : ""} up front`, pass: hasKeywords, fix: `Put the word "hostel"${city ? ` or "${hostel.city}"` : ""} in the page title or main heading so searchers see they are in the right place.` },
    { id: "structured", label: "Hostel details for Google", pass: hasLodging, fix: "Add structured data (JSON-LD) of type Hostel or LodgingBusiness with your name, address, phone and price range, so Google can show your details." },
    { id: "booking", label: "A clear way to book", pass: hasBooking, fix: "Add a visible Book now link or button that goes to your booking engine, on the home page." },
    { id: "alt", label: "Photo descriptions", pass: images.length > 0 && withAlt / images.length >= 0.8, fix: "Give every photo a short alt text such as \"Six-bed dorm with lockers\". Search engines and screen readers rely on it." },
    { id: "viewport", label: "Works on phones", pass: $('meta[name="viewport"]').length > 0, fix: "Add a viewport meta tag so the page fits a phone screen. Most guests book from their phone." },
  ];
  const passed = checks.filter((c) => c.pass).length;
  return { score: Math.round((passed / checks.length) * 100), checks };
}
