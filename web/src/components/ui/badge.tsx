import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold capitalize",
  {
    variants: {
      tone: {
        high: "bg-red/10 text-red",
        medium: "bg-amber/10 text-amber",
        low: "bg-muted/10 text-muted",
        neutral: "bg-bg text-ink",
        good: "bg-green/10 text-green",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
