"use client";

import { useState } from "react";

import { axisTicks, niceMax } from "@/lib/chart-math";
import { formatValue, type ValueFormat } from "@/lib/chart-format";
import { ChartFrame, Tooltip } from "./chart-frame";
import { GRID, roundedRight, roundedTop, SURFACE, TEAL } from "./theme";

export type BarDatum = { label: string; value: number };

const W = 340;

/**
 * One series of bars. Vertical for time or weekday, horizontal for ranked categories
 * (the form to use instead of a pie). Labels only the largest and the last value.
 */
export function BarChart({
  title,
  caption,
  data,
  valueFormat,
  orientation = "vertical",
  valueHeader = "Value",
  max,
}: {
  title: string;
  caption?: string;
  data: BarDatum[];
  valueFormat: ValueFormat;
  orientation?: "vertical" | "horizontal";
  valueHeader?: string;
  max?: number;
}) {
  const format = (n: number) => formatValue(valueFormat, n);
  const [hover, setHover] = useState<number | null>(null);
  const top = max ?? niceMax(Math.max(0, ...data.map((d) => d.value)));
  const maxIdx = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);
  const labelled = new Set([maxIdx, data.length - 1]);
  const table = { columns: ["", valueHeader], rows: data.map((d) => [d.label, format(d.value)]) };

  if (orientation === "horizontal") {
    const rowH = 30;
    const labelW = 150;
    const H = Math.max(rowH * data.length, rowH);
    const inner = W - labelW - 50;
    return (
      <ChartFrame title={title} caption={caption} table={table}>
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${data.map((d) => `${d.label} ${format(d.value)}`).join(", ")}`} className="block w-full">
            {data.map((d, i) => {
              const y = i * rowH;
              const w = top > 0 ? (d.value / top) * inner : 0;
              return (
                <g key={d.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                  <rect x={0} y={y} width={W} height={rowH} fill="transparent" />
                  <text x={0} y={y + rowH / 2 + 4} className="fill-ink text-[11.5px]">
                    {d.label.length > 25 ? `${d.label.slice(0, 24)}…` : d.label}
                  </text>
                  <path d={roundedRight(labelW, y + 7, w, 16)} fill={TEAL} opacity={hover === null || hover === i ? 1 : 0.55} />
                  <text x={labelW + w + 6} y={y + rowH / 2 + 4} className="fill-ink text-[11.5px] font-semibold">
                    {format(d.value)}
                  </text>
                </g>
              );
            })}
          </svg>
          {hover !== null && <Tooltip x={50} y={((hover + 0.2) / data.length) * 100}>{`${data[hover].label}: ${format(data[hover].value)}`}</Tooltip>}
        </div>
      </ChartFrame>
    );
  }

  const H = 190;
  const padL = Math.max(34, Math.max(...axisTicks(top).map((t) => format(t).length)) * 6.2 + 12);
  const padB = 24;
  const padT = 18;
  const innerW = W - padL - 8;
  const innerH = H - padB - padT;
  const band = innerW / Math.max(data.length, 1);
  const barW = Math.min(24, band * 0.62);

  return (
    <ChartFrame title={title} caption={caption} table={table}>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${data.map((d) => `${d.label} ${format(d.value)}`).join(", ")}`} className="block w-full">
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
          {data.map((d, i) => {
            const h = top > 0 ? (d.value / top) * innerH : 0;
            const cx = padL + band * i + band / 2;
            return (
              <g key={d.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <rect x={padL + band * i} y={padT} width={band} height={innerH + padB} fill="transparent" />
                <path d={roundedTop(cx - barW / 2, padT + innerH - h, barW, h)} fill={TEAL} stroke={SURFACE} strokeWidth={0} opacity={hover === null || hover === i ? 1 : 0.55} />
                {labelled.has(i) && d.value > 0 && (
                  <text x={cx} y={padT + innerH - h - 5} textAnchor="middle" className="fill-ink text-[10.5px] font-semibold">
                    {format(d.value)}
                  </text>
                )}
                <text x={cx} y={H - 7} textAnchor="middle" className="fill-muted text-[10px]">
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <Tooltip x={((padL + band * hover + band / 2) / W) * 100} y={((padT + innerH - (data[hover].value / top) * innerH) / H) * 100}>
            {`${data[hover].label}: ${format(data[hover].value)}`}
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}
