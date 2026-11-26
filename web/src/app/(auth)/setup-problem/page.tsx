import Link from "next/link";

import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

/**
 * Shown when the database cannot be read after sign-in. In production the real
 * error is hidden from the browser, so this lists the usual causes in order.
 */
export default function SetupProblemPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-hairline bg-surface p-5">
        <h1 className="text-[20px] font-semibold">We signed you in, but can&apos;t reach your data</h1>
        <p className="mt-1 text-[13.5px] text-muted">This is a setup problem, not something you did. Check these in order:</p>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-[14px] leading-snug">
          <li>
            <strong>Run the database schema.</strong> In Supabase, open the SQL Editor and run the contents of <code>web/supabase/schema.sql</code>. Without it the tables do not exist.
          </li>
          <li>
            <strong>Check the keys.</strong> In Vercel, <code>NEXT_PUBLIC_SUPABASE_URL</code> must be your project URL and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> your publishable (anon) key from Supabase &gt; Project Settings &gt; API. Redeploy after changing them.
          </li>
          <li>
            <strong>Read the real error.</strong> Vercel &gt; your project &gt; Logs. Look for a line starting with <code>[session]</code>. It names the exact cause.
          </li>
        </ol>
      </div>
      <Link href="/" className="inline-flex h-11 items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-white">
        Try again
      </Link>
      <form action={signOut}>
        <Button type="submit" variant="outline" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}
