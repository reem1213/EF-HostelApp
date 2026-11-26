import type { ReactNode } from "react";

/** Title, one-line caption, the chart, and a table view (the accessible fallback and the contrast relief). */
export function ChartFrame({
  title,
  caption,
  children,
  table,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
  table: { columns: string[]; rows: (string | number)[][] };
}) {
  return (
    <figure className="rounded-2xl border border-hairline bg-surface p-4">
      <figcaption className="mb-3">
        <p className="text-[14px] font-semibold">{title}</p>
        {caption && <p className="text-[12.5px] text-muted">{caption}</p>}
      </figcaption>
      {children}
      <details className="mt-3 text-[12px] text-muted">
        <summary className="cursor-pointer select-none font-medium">View as table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c} scope="col" className="py-1 pr-3 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-ink">
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-hairline">
                  {r.map((cell, j) => (
                    <td key={j} className="py-1 pr-3 tabular-nums">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Floating readout used by the interactive charts. `x`/`y` are percentages of the chart box. */
export function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-dark px-2.5 py-1.5 text-[12px] leading-tight text-dark-text shadow"
      style={{ left: `${Math.min(88, Math.max(12, x))}%`, top: `${Math.max(14, y)}%` }}
    >
      {children}
    </div>
  );
}
