import { TrendingDown, TrendingUp } from "lucide-react";

import { dollarsExact } from "@/lib/domain/money";
import type { AuditResult } from "@/lib/domain/types";

export function PropertyPulse({ audit }: { audit: AuditResult }) {
  const bench = audit.property.benchmark;
  const directPct = Math.round(audit.directSharePct * 100);
  const otaPct = Math.round(audit.otaSharePct * 100);
  const costGap = audit.costPerBedNightCents - bench.peerCostPerBedNightCents;
  const otaHigh = audit.otaSharePct > bench.targetOtaShare;

  return (
    <section className="rounded-2xl border border-hairline bg-surface p-3.5">
      <h2 className="text-[13px] text-muted">Property pulse</h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Tile
          label="Direct split"
          value={`${directPct}%`}
          delta={`${otaPct}% OTA`}
          tone={otaHigh ? "bad" : "good"}
          icon={<TrendingDown className="size-3" aria-hidden />}
        />
        <Tile
          label="Bed cost"
          value={dollarsExact(audit.costPerBedNightCents)}
          delta={`${costGap >= 0 ? "+" : "-"}${dollarsExact(Math.abs(costGap))} vs peer`}
          tone={costGap > 0 ? "bad" : "good"}
          icon={costGap > 0 ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}
        />
        <Tile
          label="Profit health"
          value={String(audit.profitHealth)}
          delta="Audited"
          tone="good"
          icon={<TrendingUp className="size-3" aria-hidden />}
        />
      </div>
    </section>
  );
}

function Tile({
  label,
  value,
  delta,
  tone,
  icon,
}: {
  label: string;
  value: string;
  delta: string;
  tone: "good" | "bad";
  icon: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-hairline p-2.5">
      <p className="text-[11.5px] text-muted">{label}</p>
      <p className="mt-1.5 truncate font-serif text-[26px] font-semibold leading-none">{value}</p>
      <p className={`mt-1.5 flex items-center gap-1 truncate text-[10.5px] font-semibold ${tone === "good" ? "text-green" : "text-red"}`}>
        {icon}
        <span className="truncate">{delta}</span>
      </p>
    </div>
  );
}
