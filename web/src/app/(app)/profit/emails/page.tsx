import { Suspense } from "react";
import { connection } from "next/server";

import { EmailComposer } from "@/components/email-composer";
import { Notice, PageHeader, Section } from "@/components/page-kit";
import { PageSkeleton } from "@/components/skeleton";
import { audienceReport } from "@/lib/domain/email-audience";
import { emailMode, emailSettingsFor } from "@/lib/email/config";
import { maskEmail } from "@/lib/email/send";
import { utcDay } from "@/lib/period";
import { requireProperty } from "@/lib/session";

export default function EmailsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EmailsView />
    </Suspense>
  );
}

const STATUS: Record<string, string> = { sent: "Sent", failed: "Failed", not_sent: "Not sent" };

async function EmailsView() {
  await connection();
  const { store, property } = await requireProperty();
  const [bookings, suppressed, outbox, campaigns] = await Promise.all([store.listBookings(property.id), store.listSuppressions(property.id), store.listOutbox(property.id, 12), store.listCampaigns(property.id, 5)]);
  const report = audienceReport(bookings, suppressed, utcDay(new Date()));
  const live = emailMode() === "live";

  const blockedReason = !property.postalAddress.trim()
    ? "Add your postal address first. It is required on every marketing email."
    : !property.replyToEmail.trim()
      ? "Add a reply-to email first, so guests can reply to you."
      : !emailSettingsFor(property)
        ? "Email is not set up on the server yet. The app owner needs to set UNSUBSCRIBE_SECRET and NEXT_PUBLIC_SITE_URL."
        : null;
  const { relay, missing, suppressed: sup } = report.excluded;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title="Win back past guests" trail={[{ label: "Profit", href: "/profit" }, { label: "Win back past guests", href: "/profit/emails" }]} subtitle="Invite guests who already stayed to book direct next time." />

      <Notice>
        {live
          ? "Emails are sent from the HostelPulse sending address with your hostel's name, and replies go to you."
          : "No email provider is connected yet, so nothing is sent. Approved campaigns are written to the outbox below instead."}{" "}
        Every email has your postal address and an unsubscribe link, and people who unsubscribe are never written to again.
      </Notice>

      <Section title="Who will get it">
        <div className="rounded-2xl border border-hairline bg-surface p-4 text-[14px]">
          <p>
            <strong className="tabular-nums">{report.emails.length}</strong> past guest{report.emails.length === 1 ? "" : "s"} with a usable email address.
          </p>
          {report.emails.length > 0 && <p className="mt-1 text-[13px] text-muted">For example {report.emails.slice(0, 3).map(maskEmail).join(", ")}</p>}
          {relay + missing + sup > 0 && (
            <ul className="mt-2 list-disc pl-5 text-[13px] text-muted">
              {relay > 0 && <li>{relay} left out: booking-site forwarding addresses cannot be used.</li>}
              {missing > 0 && <li>{missing} left out: no email address on file.</li>}
              {sup > 0 && <li>{sup} left out: they unsubscribed.</li>}
            </ul>
          )}
        </div>
      </Section>

      <Section title="Write the email">
        <EmailComposer hostelName={property.name} postalAddress={property.postalAddress} replyTo={property.replyToEmail} audience={report.emails.length} blockedReason={blockedReason} />
      </Section>

      {campaigns.length > 0 && (
        <Section title="Past campaigns">
          <ul className="flex flex-col gap-2">
            {campaigns.map((c) => (
              <li key={c.createdAt.toISOString()} className="rounded-2xl border border-hairline bg-surface px-4 py-3 text-[13.5px]">
                <span className="block font-semibold">{c.subject}</span>
                <span className="text-muted">
                  {c.mode === "sent" ? `${c.sent} sent, ${c.skipped} skipped` : `${c.audience} held in the outbox, none sent`} · {c.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {outbox.length > 0 && (
        <Section title="Outbox">
          <ul className="rounded-2xl border border-hairline bg-surface px-4 py-2 text-[13px]">
            {outbox.map((o, i) => (
              <li key={i} className="flex items-center justify-between gap-3 border-b border-hairline py-2 last:border-0">
                <span className="min-w-0 truncate">{o.maskedEmail}</span>
                <span className="shrink-0 text-muted">{STATUS[o.status]}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
