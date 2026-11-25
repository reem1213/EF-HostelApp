import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ChevronRight, FileUp, PlugZap, Sparkles } from "lucide-react";

import { signOut } from "@/app/actions/auth";
import { PageHeader, Section } from "@/components/page-kit";
import { PasswordForm } from "@/components/password-form";
import { PageSkeleton } from "@/components/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireProperty } from "@/lib/session";

export default function MorePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MoreView />
    </Suspense>
  );
}

async function MoreView() {
  await connection();
  const { store, property, user, demo } = await requireProperty();
  const connections = await store.listConnections(property.id);

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title="More" />

      <Section title="Plan and property">
        <div className="rounded-2xl border border-hairline bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-teal-soft">
              <Sparkles className="size-5 text-teal" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-semibold">Free audit plan</p>
              <p className="truncate text-[12.5px] text-muted">
                {property.name} · {property.beds} beds
              </p>
            </div>
            <Badge tone="good">Active</Badge>
          </div>
          <p className="mt-3 text-[13.5px] text-muted">Cost tracking, leak alerts and prioritised fixes.</p>
        </div>
      </Section>

      <Section title="Data">
        <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface">
          <li>
            <Link href="/connections" className="flex items-center gap-3 px-4 py-3.5">
              <PlugZap className="size-5 text-teal" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">PMS connections</span>
                <span className="text-[12.5px] text-muted">
                  {connections.length > 0 ? `${connections.length} saved` : "Cloudbeds, Hostaway, Little Hotelier"}
                </span>
              </span>
              <ChevronRight className="size-4 text-muted" aria-hidden />
            </Link>
          </li>
          <li>
            <Link href="/connections#import" className="flex items-center gap-3 px-4 py-3.5">
              <FileUp className="size-5 text-teal" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">Import files</span>
                <span className="text-[12.5px] text-muted">Bookings, bank summary, bills, schedules</span>
              </span>
              <ChevronRight className="size-4 text-muted" aria-hidden />
            </Link>
          </li>
        </ul>
      </Section>

      <Section title="Account">
        <div className="rounded-2xl border border-hairline bg-surface p-4">
          <p className="text-[13px] text-muted">Signed in as</p>
          <p className="text-[15px] font-medium">{user.email}</p>
          {demo ? (
            <p className="mt-3 text-[13px] text-muted">Demo mode: accounts are not connected on this deployment.</p>
          ) : (
            <div className="mt-4 border-t border-hairline pt-4">
              <PasswordForm />
            </div>
          )}
        </div>
        {!demo && (
          <form action={signOut}>
            <Button type="submit" variant="outline" className="w-full">
              Sign out
            </Button>
          </form>
        )}
      </Section>
    </div>
  );
}
