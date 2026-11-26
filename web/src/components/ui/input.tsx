import * as React from "react";

import { cn } from "@/lib/utils";

const base =
  "w-full rounded-xl border border-hairline bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(base, className)} {...props} />,
);
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(base, "appearance-none pr-8", className)} {...props} />,
);
Select.displayName = "Select";

/** Label + control + help text + error, wired together for screen readers. */
export function Field({
  label,
  name,
  error,
  help,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-[13px] font-medium">
        {label}
      </label>
      {children}
      {help && !error && <p className="text-[12px] text-muted">{help}</p>}
      {error && (
        <p role="alert" className="text-[12px] text-red">
          {error}
        </p>
      )}
    </div>
  );
}

/** Success / error banner for form results. */
export function FormMessage({ ok, error, message, details }: { ok?: boolean; error?: string; message?: string; details?: string[] }) {
  const text = error ?? (ok ? message : undefined);
  if (!text) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn("rounded-xl px-3.5 py-2.5 text-[13px]", error ? "bg-red/10 text-red" : "bg-green/10 text-green")}
    >
      <p>{text}</p>
      {details && details.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12px] opacity-90">
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
