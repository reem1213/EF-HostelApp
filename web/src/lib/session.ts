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
  try {
    const supabase = await supabaseServer();
    // getUser() validates the token with Supabase; getSession() alone would trust the cookie.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { user: { id: data.user.id, email: data.user.email ?? "" }, store: new SupabaseStore(supabase), demo: false };
  } catch (e) {
    // Supabase unreachable or misconfigured: treat as signed out rather than crashing the page.
    console.error("[session] could not verify the user", e);
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

/**
 * Reads the user's property. A failure here almost always means the database is
 * not set up (schema not run, wrong keys), so send them to a page that says so
 * instead of letting React show an unreadable production error.
 */
async function loadProperty(s: Session): Promise<Property> {
  let property: Property | null;
  try {
    property = await s.store.getProperty(s.user.id);
  } catch (e) {
    console.error("[session] could not read the property", e);
    redirect("/setup-problem");
  }
  if (!property) redirect("/onboarding");
  return property;
}

/** Session plus the user's property. Sends new users to onboarding. */
export async function requireProperty(): Promise<Session & { property: Property }> {
  const s = await requireSession();
  return { ...s, property: await loadProperty(s) };
}
