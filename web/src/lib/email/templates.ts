export type TemplateId = "welcome_back" | "seasonal" | "review_request";

export const TEMPLATE_INFO: Record<TemplateId, { name: string; blurb: string }> = {
  welcome_back: { name: "Welcome back", blurb: "Invite past guests to book direct, with an optional discount code." },
  seasonal: { name: "Seasonal invitation", blurb: "A friendly note about planning their next trip." },
  review_request: { name: "Review request", blurb: "Ask recent guests how their stay was." },
};

export type EmailVars = { hostelName: string; postalAddress: string; replyTo: string; unsubscribeUrl: string; code?: string; discountPct?: number };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Builds one email. Refuses to render without a postal address and a working https/http unsubscribe link: both are required by law in most places. */
export function renderEmail(id: TemplateId, v: EmailVars): { subject: string; html: string; text: string } {
  if (!v.postalAddress.trim()) throw new Error("A postal address is required on every marketing email.");
  if (!/^https?:\/\//i.test(v.unsubscribeUrl.trim())) throw new Error("An unsubscribe link (http or https) is required on every marketing email.");

  const offer = v.code && v.discountPct ? `Book direct with code ${v.code} and get ${v.discountPct}% off.` : v.code ? `Book direct with code ${v.code}.` : "Book direct with us for our best price.";
  const copy: Record<TemplateId, { subject: string; paragraphs: string[] }> = {
    welcome_back: {
      subject: `We would love to see you again at ${v.hostelName}`,
      paragraphs: [`Thank you for staying with us at ${v.hostelName}. We hope you had a great time.`, `If you are planning another trip, we would love to host you again. ${offer}`],
    },
    seasonal: {
      subject: `Planning your next trip? ${v.hostelName} has beds waiting`,
      paragraphs: [`The new season is a great time to travel, and ${v.hostelName} is ready for you.`, `Beds fill up early on busy weekends, so it is worth choosing your dates soon. ${offer}`],
    },
    review_request: {
      subject: `How was your stay at ${v.hostelName}?`,
      paragraphs: [`Thank you for choosing ${v.hostelName}. We would love to hear how your stay was.`, "Reply to this email with a few words, or leave a short review where you booked. It helps other travellers choose, and it helps us improve."],
    },
  };
  const c = copy[id];
  const footerText = [`${v.hostelName}`, v.postalAddress.trim(), v.replyTo ? `Reply to this email to reach us: ${v.replyTo}` : "", `You are receiving this because you stayed with us. Unsubscribe: ${v.unsubscribeUrl}`].filter(Boolean);

  const text = [...c.paragraphs, "", "Warm regards,", v.hostelName, "", "--", ...footerText].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f2f4f3;font-family:Inter,Arial,sans-serif;color:#17231f"><div style="max-width:520px;margin:0 auto;padding:24px"><div style="background:#fff;border-radius:16px;padding:24px">${c.paragraphs
    .map((p) => `<p style="font-size:16px;line-height:1.5;margin:0 0 14px">${esc(p)}</p>`)
    .join("")}<p style="font-size:16px;margin:18px 0 0">Warm regards,<br>${esc(v.hostelName)}</p></div><p style="font-size:12px;line-height:1.5;color:#5b6b66;margin:16px 4px 0">${esc(v.hostelName)}<br>${esc(v.postalAddress.trim())}<br>${v.replyTo ? `Reply to this email to reach us.<br>` : ""}You are receiving this because you stayed with us. <a href="${esc(v.unsubscribeUrl.trim())}" style="color:#1f5e5a">Unsubscribe</a></p></div></body></html>`;
  return { subject: c.subject, html, text };
}
