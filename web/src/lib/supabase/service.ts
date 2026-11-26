import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only client that BYPASSES row-level security. Use it only in scheduled jobs and token-checked
 * routes, and scope every query to one property. Never import this from a component.
 */
export function supabaseService(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set on the server.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const serviceConfigured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
