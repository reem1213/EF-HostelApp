"use client";

import { useState } from "react";

import { axisTicks, niceMax } from "@/lib/chart-math";
import { formatValue, type ValueFormat } from "@/lib/chart-format";
import { ChartFrame, Tooltip } from "./chart-frame";
import { GRID, SERIES, SURFACE } from "./theme";

export type StackSeries = { key: string; label: string };
export type StackColumn = { label: string; parts: Record<string, number> };

const W = 340;

/**
 * Stacked columns for a handful of named series (up to 5), with a legend, a 2px surface gap
 * between segments, hover readouts, and a table view. Colours follow the series, in fixed order.
 */
export function StackedBars({
  title,
  caption,
  columns,
  series,
  valueFormat,
}: {
  title: string;
  caption?: string;
  columns: StackColumn[];
  series: StackSeries[];
  valueFormat: ValueFormat;
}) {
  const format = (n: number) => formatValue(valueFormat, n);
  const [hover, setHover] = useState<number | null>(null);
  const totals = columns.map((c) => series.reduce((s, k) => s + (c.parts[k.key] ?? 0), 0));
  const top = niceMax(Math.max(0, ...totals));
  const H = 200;
  const padL = Math.max(34, Math.max(...axisTicks(top).map((t) => format(t).length)) * 6.2 + 12);
  const padB = 24;
  const padT = 18;
  const innerW = W - padL - 8;
  const innerH = H - padB - padT;
  const band = innerW / Math.max(columns.length, 1);
  const barW = Math.min(24, band * 0.62);
  const table = { columns: ["", ...series.map((s) => s.label), "Total"], rows: columns.map((c, i) => [c.label, ...series.map((s) => format(c.parts[s.key] ?? 0)), format(totals[i])]) };

  return (
    <ChartFrame title={title} caption={caption} table={table}>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
        {series.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${columns.map((c, i) => `${c.label} total ${format(totals[i])}`).join(", ")}`} className="block w-full">
          {axisTicks(top).map((t) => {
            const y = padT + innerH - (t / top) * innerH;
            return (
              <g key={t}>
                <line x1={padL} x2={W - 8} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
                <text x={padL - 6} y={y + 3.5} textAnchor="end" className="fill-muted text-[10px]">
                  {format(t)}
                </text>
              </g>
            );
          })}
          {columns.map((c, i) => {
            const cx = padL + band * i + band / 2;
            let acc = 0;
            return (
              <g key={c.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} opacity={hover === null || hover === i ? 1 : 0.6}>
                <rect x={padL + band * i} y={padT} width={band} height={innerH + padB} fill="transparent" />
                {series.map((s, k) => {
                  const v = c.parts[s.key] ?? 0;
                  const h = (v / top) * innerH;
                  const y = padT + innerH - ((acc + v) / top) * innerH;
                  acc += v;
                  // 2px surface gap between touching segments: shrink each by the gap.
                  return h > 0 ? <rect key={s.key} x={cx - barW / 2} y={y} width={barW} height={Math.max(h - 2, 0.5)} fill={SERIES[k % SERIES.length]} stroke={SURFACE} strokeWidth={0} /> : null;
                })}
                <text x={cx} y={H - 7} textAnchor="middle" className="fill-muted text-[10px]">
                  {c.label}
                </text>
                {i === columns.length - 1 && totals[i] > 0 && (
                  <text x={cx} y={padT + innerH - (totals[i] / top) * innerH - 5} textAnchor="middle" className="fill-ink text-[10.5px] font-semibold">
                    {format(totals[i])}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <Tooltip x={((padL + band * hover + band / 2) / W) * 100} y={((padT + innerH - (totals[hover] / top) * innerH) / H) * 100}>
            <span className="block font-semibold">{columns[hover].label}</span>
            {series.map((s) => (
              <span key={s.key} className="block">{`${s.label}: ${format(columns[hover].parts[s.key] ?? 0)}`}</span>
            ))}
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}
