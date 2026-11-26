import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Check, X } from "lucide-react";

import { Notice, PageHeader, Section } from "@/components/page-kit";
import { SeoCopyGenerator } from "@/components/seo-copy";
import { PageSkeleton } from "@/components/skeleton";
import { requireProperty } from "@/lib/session";
import { fetchSite } from "@/lib/seo/fetch-site";
import { scoreSite } from "@/lib/seo/score";

export default function SeoPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SeoView />
    </Suspense>
  );
}

const SOCIALS: { key: string; label: string }[] = [
  { key: "google_business", label: "Google Business Profile" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
];

async function SeoView() {
  await connection();
  const { property } = await requireProperty();
  const trail = [{ label: "Profit", href: "/profit" }, { label: "Direct bookings", href: "/profit/direct" }, { label: "Website and Google", href: "/profit/direct/seo" }];
  const socials = property.socials as Record<string, string | undefined>;
  const site = property.website ? await fetchSite(property.website) : null;
  const scored = site?.ok ? scoreSite(site.html, site.finalUrl, { name: property.name }) : null;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title="Website and Google" trail={trail} subtitle="What Google reads on your site, and what to fix so guests find you and book direct." />

      {!property.website ? (
        <Notice>
          Add your website so we can check it.{" "}
          <Link href="/more" className="font-semibold text-teal">
            Go to More
          </Link>
          .
        </Notice>
      ) : !site?.ok ? (
        <Notice>
          We could not check {property.website}. {site && !site.ok ? site.error : ""}{" "}
          <Link href="/more" className="font-semibold text-teal">
            Update your website address
          </Link>
          .
        </Notice>
      ) : (
        scored && (
          <>
            <Section title="Your site score">
              <div className="rounded-2xl border border-hairline bg-surface p-4">
                <p className="font-serif text-[38px] font-semibold leading-none tabular-nums">
                  {scored.score}
                  <span className="text-[18px] text-muted"> / 100</span>
                </p>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-hairline" role="img" aria-label={`Site score ${scored.score} out of 100`}>
                  <div className="h-full rounded-full bg-teal" style={{ width: `${scored.score}%` }} />
                </div>
                <p className="mt-2 text-[12px] text-muted">
                  Checked {site.finalUrl}. This looks at the page you give guests first; it is a basic health check, not a promise about rankings.
                </p>
              </div>
            </Section>

            <Section title="What to fix">
              <ul className="flex flex-col gap-2">
                {[...scored.checks].sort((a, b) => Number(a.pass) - Number(b.pass)).map((c) => (
                  <li key={c.id} className="rounded-2xl border border-hairline bg-surface p-4">
                    <p className="flex items-center gap-2 text-[14.5px] font-semibold">
                      {c.pass ? <Check className="size-4 text-green" aria-label="Passed" /> : <X className="size-4 text-red" aria-label="Needs work" />}
                      {c.label}
                    </p>
                    {!c.pass && <p className="mt-1 text-[13.5px]">{c.fix}</p>}
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Ready-to-paste copy">
              <SeoCopyGenerator />
            </Section>
          </>
        )
      )}

      <Section title="Where guests can find you">
        <ul className="rounded-2xl border border-hairline bg-surface p-4 text-[14px]">
          {SOCIALS.map((s) => (
            <li key={s.key} className="flex items-center justify-between py-1.5">
              <span>{s.label}</span>
              {socials[s.key] ? <span className="font-semibold text-green">Added</span> : <Link href="/more" className="font-semibold text-teal">Add</Link>}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
