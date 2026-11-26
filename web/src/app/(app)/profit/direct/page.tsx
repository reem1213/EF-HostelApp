import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ChevronRight, Globe, LineChart, Megaphone } from "lucide-react";

import { PageHeader } from "@/components/page-kit";
import { PageSkeleton } from "@/components/skeleton";
import { requireProperty } from "@/lib/session";

export default function DirectHubPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DirectHub />
    </Suspense>
  );
}

async function DirectHub() {
  await connection();
  const { property } = await requireProperty();
  const tiers = [
    { href: "/profit/direct/seo", icon: Globe, title: "Website and Google", text: property.website ? "Check your site and get copy that helps Google show it." : "Add your website, then check what Google reads on it." },
    { href: "/profit/direct/visibility", icon: Megaphone, title: "Appear before booking sites", text: "Ask booking sites to stop bidding on your hostel's own name, so guests land on your site first." },
    { href: "/profit/direct/rates", icon: LineChart, title: "Price comparison", text: "See tonight's price on every site and against competitors, and change it in one place." },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Direct bookings" trail={[{ label: "Profit", href: "/profit" }, { label: "Direct bookings", href: "/profit/direct" }]} subtitle="Every booking that comes direct skips the booking-site commission. Three steps, in order." />
      <ol className="flex flex-col gap-3">
        {tiers.map((t, i) => (
          <li key={t.href}>
            <Link href={t.href} className="flex items-start gap-3.5 rounded-2xl border border-hairline bg-surface p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-soft text-teal">
                <t.icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-muted">Step {i + 1}</span>
                <span className="block text-[16px] font-semibold">{t.title}</span>
                <span className="mt-0.5 block text-[13.5px] text-muted">{t.text}</span>
              </span>
              <ChevronRight className="mt-1 size-4 shrink-0 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
