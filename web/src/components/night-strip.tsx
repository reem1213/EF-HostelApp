"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

export type StripCell = { date: string; occupancy: number; future: boolean; isToday: boolean; /** Replaces the default caption, for strips that show something other than occupancy (such as price). */ note?: string };

// Occupancy to colour. On the dark band a fuller night is a brighter "lit window"; on light surfaces it is a deeper teal.
const DARK = ["rgba(255,255,255,0.10)", "#34585a", "#62908b", "#d9bb6c", "#f4b940"];
const LIGHT = ["#e8eceb", "#cfe0dd", "#8fb8b2", "#4f8b84", "#1f5e5a"];
const step = (o: number) => (o <= 0 ? 0 : o <= 0.25 ? 1 : o <= 0.5 ? 2 : o <= 0.75 ? 3 : 4);

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/**
 * One cell per night. A fuller night is a brighter window. Nights that have not happened and have no
 * bookings are hollow ("no bookings yet"), never drawn as empty. Tap or hover a night for its detail.
 */
export function NightStrip({ cells, tone = "light", label }: { cells: StripCell[]; tone?: "light" | "dark"; label: string }) {
  const [sel, setSel] = useState<number | null>(cells.findIndex((c) => c.isToday));
  const palette = tone === "dark" ? DARK : LIGHT;
  const active = sel !== null && sel >= 0 ? cells[sel] : null;

  const detail = (c: StripCell) => c.note ?? (c.future && c.occupancy === 0 ? `${fmt(c.date)}: no bookings yet` : `${fmt(c.date)}: ${Math.round(c.occupancy * 100)}% full`);

  return (
    <div>
      <div role="group" aria-label={label} className="flex items-end gap-[2px]">
        {cells.map((c, i) => {
          const hollow = c.future && c.occupancy === 0;
          return (
            <button
              key={c.date}
              type="button"
              aria-label={detail(c)}
              aria-pressed={sel === i}
              onClick={() => setSel(i)}
              onPointerEnter={() => setSel(i)}
              className={cn("relative h-9 min-w-0 flex-1 rounded-[3px] outline-offset-2 focus-visible:outline-2", hollow && "border border-dashed", tone === "dark" ? "outline-white/80" : "outline-teal")}
              style={{
                background: hollow ? "transparent" : palette[step(c.occupancy)],
                borderColor: hollow ? (tone === "dark" ? "rgba(255,255,255,0.25)" : "#c9d1ce") : undefined,
                height: c.isToday ? 44 : undefined,
              }}
            >
              {c.isToday && <span aria-hidden className={cn("absolute -bottom-3 left-1/2 size-1.5 -translate-x-1/2 rounded-full", tone === "dark" ? "bg-gold" : "bg-teal")} />}
            </button>
          );
        })}
      </div>
      <p className={cn("mt-4 text-[12.5px]", tone === "dark" ? "text-dark-text/80" : "text-muted")} role="status">
        {active ? detail(active) : "Tap a night"}
      </p>
    </div>
  );
}
