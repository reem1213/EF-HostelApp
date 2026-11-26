"use client";

import { useActionState, useState } from "react";
import { Download, Upload } from "lucide-react";

import { importFile } from "@/app/actions/imports";
import { idle } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Select } from "@/components/ui/input";

export type ImportKindInfo = { kind: string; label: string; hint: string; columns: string; template: string };

/** Upload a CSV. The server validates it, reports unreadable rows by line number, and refuses an identical re-upload. */
export function ImportForm({ kinds, initialKind = "bookings" }: { kinds: ImportKindInfo[]; initialKind?: string }) {
  const [state, action, pending] = useActionState(importFile, idle);
  const [kind, setKind] = useState(initialKind);
  const info = kinds.find((k) => k.kind === kind) ?? kinds[0];

  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-4" noValidate>
      <Field label="What are you uploading?" name="kind">
        <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {kinds.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="rounded-xl bg-bg px-3.5 py-2.5 text-[13px]">
        <p>{info.hint}</p>
        <p className="mt-1 text-muted">
          Columns we look for: <span className="text-ink">{info.columns}</span>
        </p>
        <a href={info.template} download className="mt-2 inline-flex items-center gap-1.5 font-semibold text-teal">
          <Download className="size-3.5" aria-hidden />
          Download a template
        </a>
      </div>

      <Field label="CSV file" name="file" help="Up to 5 MB. In Excel or Sheets: File > Save as > CSV.">
        <input
          id="file"
          name="file"
          type="file"
          accept=".csv,text/csv,.txt"
          required
          className="block w-full text-[14px] file:mr-3 file:rounded-lg file:border-0 file:bg-teal-soft file:px-3.5 file:py-2 file:text-[13px] file:font-semibold file:text-teal"
        />
      </Field>

      <FormMessage {...state} />
      <Button type="submit" disabled={pending}>
        <Upload className="size-4" aria-hidden />
        {pending ? "Importing…" : "Import file"}
      </Button>
    </form>
  );
}
