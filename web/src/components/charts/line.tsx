"use client";

import { useState } from "react";

import { niceMax } from "@/lib/chart-math";
import { formatValue, type ValueFormat } from "@/lib/chart-format";
import { ChartFrame, Tooltip } from "./chart-frame";
import { GRID, SURFACE, TEAL } from "./theme";

export type LinePoint = { label: string; value: number };

const W = 340;

/**
 * A single series over time: 2px line, a faint area wash, an 8px end marker with a surface ring,
 * hairline gridlines and a hover crosshair. `domain` pins the axis (for ratings); otherwise it starts at zero.
 */
export function LineChart({
  title,
  caption,
  points,
  valueFormat,
  domain,
  area = true,
}: {
  title: string;
  caption?: string;
  points: LinePoint[];
  valueFormat: ValueFormat;
  domain?: [number, number];
  area?: boolean;
}) {
  const format = (n: number) => formatValue(valueFormat, n);
  const [hover, setHover] = useState<number | null>(null);
  const H = 170;
  const lo = domain ? domain[0] : 0;
  const hi = domain ? domain[1] : niceMax(Math.max(0, ...points.map((p) => p.value)));
  const padL = Math.max(34, Math.max(...[lo, lo + (hi - lo) / 2, hi].map((t) => format(t).length)) * 6.2 + 12);
  const padB = 22;
  const padT = 14;
  const innerW = W - padL - 14;
  const innerH = H - padB - padT;
  const span = hi - lo || 1;
  const x = (i: number) => padL + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - ((v - lo) / span) * innerH;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const last = points.length - 1;
  const table = { columns: ["", "Value"], rows: points.map((p) => [p.label, format(p.value)]) };

  return (
    <ChartFrame title={title} caption={caption} table={table}>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${points.map((p) => `${p.label} ${format(p.value)}`).join(", ")}`} className="block w-full">
          {[lo, lo + span / 2, hi].map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - 14} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" className="fill-muted text-[10px]">
                {format(t)}
              </text>
            </g>
          ))}
          {area && points.length > 1 && <path d={`${line} L${x(last)},${padT + innerH} L${x(0)},${padT + innerH} Z`} fill={TEAL} opacity={0.1} />}
          {points.length > 1 && <path d={line} fill="none" stroke={TEAL} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {points.map((p, i) => (
            <g key={p.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <rect x={x(i) - innerW / Math.max(points.length, 1) / 2} y={padT} width={innerW / Math.max(points.length, 1)} height={innerH + padB} fill="transparent" />
              {(i === 0 || i === last || i === Math.floor(last / 2)) && (
                <text x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} className="fill-muted text-[10px]">
                  {p.label}
                </text>
              )}
            </g>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke={GRID} strokeWidth={1} />}
          {last >= 0 && <circle cx={x(last)} cy={y(points[last].value)} r={4} fill={TEAL} stroke={SURFACE} strokeWidth={2} />}
          {hover !== null && hover !== last && <circle cx={x(hover)} cy={y(points[hover].value)} r={4} fill={TEAL} stroke={SURFACE} strokeWidth={2} />}
        </svg>
        {hover !== null && (
          <Tooltip x={(x(hover) / W) * 100} y={(y(points[hover].value) / H) * 100}>
            {`${points[hover].label}: ${format(points[hover].value)}`}
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}
