import { redirect } from "next/navigation";

import { MemoryStore } from "./data/memory-store";
import { seedDemo } from "./data/demo-seed";
import { SupabaseStore } from "./data/supabase-store";
import type { Property, Store } from "./data/store";
import { supabaseConfigured, supabaseServer } from "./supabase/server";

export type AppUser = { id: string; email: string };

export type Session = { user: AppUser; store: Store; demo: boolean };

const DEMO_USER: AppUser = { id: "demo-user", email: "demo@hostelpulse.app" };

// Survive hot reloads in dev so demo edits are not lost on every save.
const g = globalThis as unknown as { __hpStore?: MemoryStore; __hpSeed?: Promise<Property> };

async function demoStore(): Promise<MemoryStore> {
  if (!g.__hpStore) {
    g.__hpStore = new MemoryStore();
    g.__hpSeed = seedDemo(g.__hpStore, DEMO_USER.id);
  }
  await g.__hpSeed;
  return g.__hpStore;
}

/** The signed-in session, or null. In demo mode (no Supabase configured) there is always a demo user. */
export async function getSession(): Promise<Session | null> {
  if (!supabaseConfigured()) return { user: DEMO_USER, store: await demoStore(), demo: true };
  const supabase = await supabaseServer();
  // getUser() validates the token with Supabase; getSession() alone would trust the cookie.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { user: { id: data.user.id, email: data.user.email ?? "" }, store: new SupabaseStore(supabase), demo: false };
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

/** Session plus the user's property. Sends new users to onboarding. */
export async function requireProperty(): Promise<Session & { property: Property }> {
  const s = await requireSession();
  const property = await s.store.getProperty(s.user.id);
  if (!property) redirect("/onboarding");
  return { ...s, property };
}
