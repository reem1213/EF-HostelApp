import { dollars } from "@/lib/domain/money";
import type { AuditResult } from "@/lib/domain/types";
import { Badge } from "@/components/ui/badge";

export function LeakHero({ audit }: { audit: AuditResult }) {
  const recovered = audit.addressedLeaks[0];
  return (
    <section className="rounded-[18px] bg-dark p-5 text-dark-text">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px]">Money leaks found</h2>
        <Badge className="gap-2 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 normal-case tracking-normal text-[12px] font-normal text-dark-text">
          <span className="size-1.5 rounded-full bg-gold" aria-hidden />
          {audit.openLeaks.length} unaddressed
        </Badge>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="min-w-0 truncate font-serif text-[60px] leading-none text-gold">
          {dollars(audit.openLeakCents)}
        </span>
        <span className="text-[15px]">/month</span>
      </div>

      <p className="mt-3 text-[13.5px] leading-snug text-[#8fd3a8]">
        {recovered
          ? `${dollars(audit.recoveredCents)}/mo recovered from ${recovered.title.toLowerCase()}`
          : "Nothing recovered yet. Mark a finding done to track it here."}
      </p>
    </section>
  );
}
