import { Landmark, PieChart } from "lucide-react";

import { dollars, dollarsExact } from "@/lib/domain/money";
import type { AuditResult } from "@/lib/domain/types";

export function Breakdown({ audit }: { audit: AuditResult }) {
  const moneyLeak = audit.openLeaks.filter((f) => f.area === "money").reduce((s, f) => s + f.monthlyImpactCents, 0);
  const costLeak = audit.openLeaks.filter((f) => f.area === "costs").reduce((s, f) => s + f.monthlyImpactCents, 0);

  return (
    <div className="grid grid-cols-2 gap-3">
      <BreakdownCard
        icon={<Landmark className="size-5 text-teal" aria-hidden />}
        title="Money"
        subtitle="Channels & SaaS"
        value={`${dollars(moneyLeak)}/mo leak`}
        flagged={moneyLeak > 0}
      />
      <BreakdownCard
        icon={<PieChart className="size-5 text-teal" aria-hidden />}
        title="Costs"
        subtitle="Per occupied bed"
        value={`${dollarsExact(audit.costPerBedNightCents)} / bed`}
        flagged={costLeak > 0}
      />
    </div>
  );
}

function BreakdownCard({
  icon,
  title,
  subtitle,
  value,
  flagged,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  value: string;
  flagged: boolean;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-3.5">
      <div className="flex items-center justify-between">
        {icon}
        {flagged && <span className="size-1.5 rounded-full bg-amber" aria-label="Needs attention" />}
      </div>
      <p className="mt-3.5 text-[17px] font-semibold">{title}</p>
      <p className="text-[12.5px] text-muted">{subtitle}</p>
      <p className="mt-2.5 text-[13.5px] font-semibold text-amber">{value}</p>
    </div>
  );
}
