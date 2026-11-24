"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Home, PieChart, Settings, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "/costs", label: "Costs", icon: PieChart },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/more", label: "More", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-3 z-40 mx-auto flex w-[calc(100%-32px)] max-w-[398px] justify-around rounded-2xl border border-hairline bg-surface/95 px-2 py-2 shadow-sm backdrop-blur"
    >
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-[56px] flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-medium",
              active ? "bg-teal-soft text-teal" : "text-muted",
            )}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
