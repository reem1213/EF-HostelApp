"use client";

import { useId, useState } from "react";

import { BarChart } from "@/components/charts/bars";
import { directWhatIf } from "@/lib/domain/ota-economics";
import { dollars } from "@/lib/domain/money";

type Props = {
  revenueCents: number;
  currentDirectShare: number;
  otaCommission: number;
  directFee: number;
  otaNames: string[];
};

/** Drag to see how much more the hostel would keep each month if more guests booked direct. */
export function DirectSlider({ revenueCents, currentDirectShare, otaCommission, directFee, otaNames }: Props) {
  const id = useId();
  const nowPct = Math.round(currentDirectShare * 100);
  const [pct, setPct] = useState(nowPct);
  // The slider moves in whole percent, so compare against today's rounded share: the starting position reads as no change.
  const r = directWhatIf({ revenueCents, currentDirectShare: nowPct / 100, newDirectShare: pct / 100, otaCommission, directFee });

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-hairline bg-surface p-4">
      <div>
        <p className="text-[14px] font-semibold">What if more guests booked direct?</p>
        <p className="text-[12.5px] text-muted">Drag to change the share of bookings that come direct instead of through booking sites.</p>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor={id} className="text-[13px] font-medium">
            Direct bookings
          </label>
          <span className="font-serif text-[26px] font-semibold leading-none">{pct}%</span>
        </div>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          aria-valuetext={`${pct} percent direct`}
          className="mt-2 w-full accent-teal"
        />
        <div className="flex justify-between text-[11px] text-muted" aria-hidden>
          <span>0%</span>
          <span>Today {nowPct}%</span>
          <span>100%</span>
        </div>
      </div>

      <p className={`text-[15px] font-semibold ${r.deltaCents >= 0 ? "text-green" : "text-red"}`} role="status">
        {r.deltaCents === 0 ? "Same as today" : `${r.deltaCents > 0 ? "+" : "−"}${dollars(Math.abs(r.deltaCents))} a month vs today`}
      </p>

      <BarChart
        title="Money you keep each month"
        data={[
          { label: `Today (${nowPct}%)`, value: r.currentNetCents },
          { label: `At ${pct}%`, value: r.newNetCents },
        ]}
        valueFormat="dollars"
        valueHeader="Kept after fees"
      />

      <p className="text-[12px] text-muted">
        Assumes {Math.round(otaCommission * 100)}% commission{otaNames.length > 0 ? ` (${otaNames.join(", ")})` : ""} on booking-site bookings and {Math.round(directFee * 100)}% payment fees on direct ones.
      </p>
    </div>
  );
}
