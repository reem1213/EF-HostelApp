import { Suspense } from "react";
import { connection } from "next/server";

import { Notice, PageHeader, Section } from "@/components/page-kit";
import { RunCard, type RunView } from "@/components/run-card";
import { PageSkeleton } from "@/components/skeleton";
import { describeRun } from "@/lib/automation/describe";
import { requireProperty } from "@/lib/session";

export default function ActionsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ActionsView />
    </Suspense>
  );
}

const when = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";

async function ActionsView() {
  await connection();
  const { store, property, user } = await requireProperty();
  const runs = await store.listRuns(property.id, 40);
  const view = (r: (typeof runs)[number]): RunView => ({
    id: r.id,
    title: r.title,
    status: r.status,
    simulated: r.simulated,
    reversible: r.reversible,
    error: r.error,
    lines: describeRun(r),
    when: when(r.createdAt),
    byYou: r.createdBy === user.id,
  });
  const waiting = runs.filter((r) => r.status === "proposed");
  const history = runs.filter((r) => r.status !== "proposed");

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title="Actions" trail={[{ label: "Home", href: "/" }, { label: "Actions", href: "/actions" }]} subtitle="Changes HostelPulse can make for you. Nothing happens until you approve it." />

      <Section title="Waiting for you">
        {waiting.length === 0 ? (
          <Notice>Nothing is waiting. When a fix can be done automatically, it shows up here for your approval first.</Notice>
        ) : (
          waiting.map((r) => <RunCard key={r.id} run={view(r)} />)
        )}
      </Section>

      <Section title="History">
        {history.length === 0 ? <Notice>Approved, dismissed and undone actions are kept here, so you can always see what changed and who approved it.</Notice> : history.map((r) => <RunCard key={r.id} run={view(r)} />)}
      </Section>
    </div>
  );
}
