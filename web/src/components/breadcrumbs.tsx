import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Where you are and the way back. The last item is the current page. */
export function Breadcrumbs({ trail }: { trail: { label: string; href: string }[] }) {
  const back = trail.at(-2) ?? trail[0];
  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <Link href={back.href} className="-ml-1 inline-flex items-center gap-0.5 rounded-lg px-1 py-1 text-[13px] font-medium text-teal">
        <ChevronLeft className="size-4" aria-hidden />
        {back.label}
      </Link>
    </nav>
  );
}
