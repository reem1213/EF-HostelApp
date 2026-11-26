import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";

import { Notice, PageHeader, Section } from "@/components/page-kit";
import { PageSkeleton } from "@/components/skeleton";
import { TicketCard, TicketPicker, type TicketView } from "@/components/ticket-card";
import { resolveOta } from "@/lib/domain/ota";
import { OTA_SUPPORT_HINTS } from "@/lib/domain/tickets";
import { requireProperty } from "@/lib/session";

export default function VisibilityPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <VisibilityView />
    </Suspense>
  );
}

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

async function VisibilityView() {
  await connection();
  const { store, property } = await requireProperty();
  const tickets = await store.listTickets(property.id);
  const have = new Set(tickets.map((t) => t.otaId));
  const name = (id: string) => resolveOta(id, property.otaSettings).name;

  const views: TicketView[] = tickets
    .filter((t) => property.otas.includes(t.otaId))
    .map((t) => ({
      otaId: t.otaId,
      otaName: name(t.otaId),
      status: t.status,
      subject: t.subject,
      body: t.body,
      hint: OTA_SUPPORT_HINTS[t.otaId] ?? OTA_SUPPORT_HINTS.other,
      dates: [`Drafted ${day(t.createdAt)}`, t.submittedAt ? `submitted ${day(t.submittedAt)}` : "", t.answeredAt ? `answered ${day(t.answeredAt)}` : ""].filter(Boolean).join(", "),
    }));
  const options = property.otas.filter((id) => !have.has(id)).map((id) => ({ id, name: name(id) }));

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Appear before booking sites"
        trail={[{ label: "Profit", href: "/profit" }, { label: "Direct bookings", href: "/profit/direct" }, { label: "Appear before booking sites", href: "/profit/direct/visibility" }]}
        subtitle="When guests search for your hostel's name, booking sites can pay to show above you. Ask them to stop."
      />
      <Notice>We write the request and track it. You send it yourself, because booking sites offer no way for us to send it for you.</Notice>

      {property.otas.length === 0 ? (
        <Notice>
          Add the booking sites you use first.{" "}
          <Link href="/more" className="font-semibold text-teal">
            Go to More
          </Link>
          .
        </Notice>
      ) : (
        <>
          <TicketPicker options={options} />
          {views.length > 0 && (
            <Section title="Your requests">
              {views.map((t) => (
                <TicketCard key={t.otaId} t={t} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
