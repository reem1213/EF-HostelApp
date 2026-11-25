"use client";

import { useState, useTransition } from "react";

import { recategorizeExpense } from "@/app/actions/property";
import { Select } from "@/components/ui/input";
import { dollarsExact } from "@/lib/domain/money";
import { categoryLabel, type ExpenseCategory } from "@/lib/domain/types";

// Shorter names so the label fits the dropdown on a phone.
const SHORT: Partial<Record<ExpenseCategory, string>> = { channel_commission: "Commission" };

export type ChargeRow = { id: string; date: string; merchant: string; amountCents: number; category: ExpenseCategory };

/** Imported charges, with a way to correct the automatic category. */
export function ChargeReview({ rows }: { rows: ChargeRow[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
      <ul className="divide-y divide-hairline">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{r.merchant}</p>
              <p className="text-[12px] text-muted">{r.date}</p>
            </div>
            <p className="text-[14px] font-semibold tabular-nums">{dollarsExact(r.amountCents)}</p>
            <label className="sr-only" htmlFor={`cat-${r.id}`}>
              Category for {r.merchant}
            </label>
            <Select
              id={`cat-${r.id}`}
              defaultValue={r.category}
              disabled={pending}
              className="w-[128px] py-1.5 text-[13px]"
              onChange={(e) =>
                start(async () => {
                  setError(null);
                  const res = await recategorizeExpense(r.id, e.target.value);
                  if (res.error) setError(res.error);
                })
              }
            >
              {(Object.keys(categoryLabel) as ExpenseCategory[]).map((c) => (
                <option key={c} value={c}>
                  {SHORT[c] ?? categoryLabel[c]}
                </option>
              ))}
            </Select>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="border-t border-hairline px-4 py-2 text-[13px] text-red">
          {error}
        </p>
      )}
    </div>
  );
}
