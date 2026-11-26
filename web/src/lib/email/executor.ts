import type { Executor } from "../automation/types";
import type { Property, Store } from "../data/store";
import { audienceReport } from "../domain/email-audience";
import { utcDay } from "../period";
import { sendCampaign } from "./send";
import { renderEmail, TEMPLATE_INFO, type TemplateId } from "./templates";
import { signUnsubscribe } from "./unsubscribe";

export type EmailSettings = {
  property: Property;
  /** Public address of this app, used in unsubscribe links. */
  siteUrl: string;
  unsubscribeSecret: string;
  /** With both an API key and a from address, emails are really sent. Otherwise they only go to the outbox. */
  apiKey?: string;
  from?: string;
  fetchImpl?: typeof fetch;
};

type EmailStore = Pick<Store, "listBookings" | "listSuppressions" | "addOutbox" | "recordCampaign">;

/**
 * Sends a repeat-guest campaign when it is approved. The audience is worked out again at that moment, so anyone
 * who unsubscribed in between is left out. Refuses to run without a postal address.
 */
export function emailCampaignExecutor(store: EmailStore, s: EmailSettings): Executor {
  return {
    kind: "email_campaign",
    async apply(run, ctx) {
      const p = run.params as { template?: unknown; code?: unknown; discountPct?: unknown };
      const template = typeof p.template === "string" && p.template in TEMPLATE_INFO ? (p.template as TemplateId) : null;
      if (!template) throw new Error("Unknown email template.");
      if (!s.property.postalAddress.trim()) throw new Error("Add your postal address in More before sending. It is required on every marketing email.");
      const code = typeof p.code === "string" && /^[A-Za-z0-9_-]{1,30}$/.test(p.code) ? p.code : undefined;
      const discountPct = typeof p.discountPct === "number" && p.discountPct > 0 && p.discountPct <= 90 ? Math.round(p.discountPct) : undefined;

      const [bookings, suppressed] = await Promise.all([store.listBookings(ctx.propertyId), store.listSuppressions(ctx.propertyId)]);
      const { emails } = audienceReport(bookings, suppressed, utcDay(ctx.now));
      if (emails.length === 0) throw new Error("There are no guests to write to right now.");

      const base = s.siteUrl.replace(/\/+$/, "");
      const vars = (email: string) => ({
        hostelName: s.property.name,
        postalAddress: s.property.postalAddress,
        replyTo: s.property.replyToEmail,
        unsubscribeUrl: `${base}/unsubscribe/${signUnsubscribe(ctx.propertyId, email, s.unsubscribeSecret)}`,
        code,
        discountPct,
      });
      const subject = renderEmail(template, vars(emails[0])).subject;
      const live = Boolean(s.apiKey && s.from);

      const result = await sendCampaign(
        { apiKey: live ? s.apiKey : undefined, fetchImpl: s.fetchImpl, recordOutbox: (rows) => store.addOutbox(ctx.propertyId, rows) },
        {
          from: s.from ? `${s.property.name.replace(/[<>"]/g, "")} via HostelPulse <${s.from}>` : "",
          replyTo: s.property.replyToEmail,
          subject,
          recipients: emails,
          suppressed,
          render: (email) => {
            const v = vars(email);
            const m = renderEmail(template, v);
            return { html: m.html, text: m.text, unsubscribeUrl: v.unsubscribeUrl };
          },
        },
      );
      await store.recordCampaign(ctx.propertyId, { template, subject, audience: emails.length, sent: result.sent, skipped: result.skipped, mode: result.mode, createdBy: run.approvedBy ?? run.createdBy });
      return { before: null, after: { audience: emails.length, sent: result.sent, skipped: result.skipped, mode: result.mode }, simulated: result.mode === "outbox", reversible: false };
    },
  };
}
