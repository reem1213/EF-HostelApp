import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="text-center">
      <h1 className="font-serif text-[32px] font-semibold leading-none">{title}</h1>
      {subtitle && <p className="mt-1.5 text-[12.5px] text-muted">{subtitle}</p>}
    </header>
  );
}

export function Section({
  title,
  eyebrow,
  id,
  children,
  action,
}: {
  title: string;
  eyebrow?: string;
  id?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-wider text-teal">{eyebrow}</p>}
          <h2 className="text-[16px] font-semibold">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "good" | "bad";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-2xl border border-hairline bg-surface p-3.5", className)}>
      <p className="text-[12px] text-muted">{label}</p>
      <p className="mt-1.5 truncate font-serif text-[30px] font-semibold leading-none">{value}</p>
      {sub && (
        <p className={cn("mt-1.5 text-[11.5px] font-semibold", tone === "good" && "text-green", tone === "bad" && "text-red", tone === "neutral" && "text-muted")}>
          {sub}
        </p>
      )}
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "later" }) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-hairline p-4 text-[13px] text-muted", tone === "later" && "bg-bg")}>
      {children}
    </div>
  );
}

/** Signed percentage like "+12%" or "-3%". */
export function signedPct(change: number | null): string | undefined {
  if (change === null) return undefined;
  const p = Math.round(change * 100);
  return `${p >= 0 ? "+" : ""}${p}% vs last period`;
}
