import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** True when Supabase is configured. Without it the app runs on demo data. */
export const supabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

/** Server-side Supabase client bound to the request's auth cookies. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (items) => {
          try {
            items.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Called from a Server Component: cookies are read-only there. Middleware refreshes them.
          }
        },
      },
    },
  );
}
