/** The prompt and parsing for ready-to-paste website copy. The model is told to use only the facts it is given. */
export function buildSeoPrompt(a: { name: string; city?: string; currentTitle: string | null; currentDescription: string | null; failed: string[] }): string {
  return [
    `Write website copy for a hostel called "${a.name}"${a.city ? ` in ${a.city}` : ""}.`,
    a.currentTitle ? `Its current page title is: ${a.currentTitle}` : "It has no page title yet.",
    a.currentDescription ? `Its current meta description is: ${a.currentDescription}` : "It has no meta description yet.",
    a.failed.length ? `Problems found on the site: ${a.failed.join("; ")}.` : "",
    "Use only the facts above. Do not invent amenities, prices, awards, reviews or addresses.",
    "Reply with exactly three parts, in this form:",
    "TITLE: a page title of at most 60 characters with the hostel type and place",
    "DESCRIPTION: a meta description of at most 155 characters inviting guests to book direct",
    "INTRO: a friendly two-sentence introduction for the top of the home page",
  ]
    .filter(Boolean)
    .join("\n");
}

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

export type SeoCopy = { title: string; description: string; intro: string };

export function parseSeoCopy(text: string): SeoCopy | null {
  const m = text.match(/TITLE:\s*(.+?)\s*\n+\s*DESCRIPTION:\s*(.+?)\s*\n+\s*INTRO:\s*([\s\S]+)/i);
  if (!m) return null;
  const intro = m[3].replace(/\s*\n\s*/g, " ").trim();
  if (!m[1].trim() || !m[2].trim() || !intro) return null;
  return { title: clip(m[1].trim(), 60), description: clip(m[2].trim(), 155), intro };
}
