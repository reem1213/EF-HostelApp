"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { echo, fieldErrors } from "@/lib/forms";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";
import type { ActionState } from "./types";

const credentials = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address").max(254)),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});

const NOT_CONFIGURED = "Accounts are not switched on for this deployment. Set the Supabase environment variables.";

async function siteOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signUp(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!supabaseConfigured()) return { error: NOT_CONFIGURED };
  const parsed = credentials.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: echo(fd, ["email"]) };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/callback` },
  });
  if (error) return { error: error.message };
  // With email confirmation on there is no session yet.
  if (!data.session) return { ok: true, message: "Check your email and click the link to confirm your account." };
  redirect("/onboarding");
}

export async function signIn(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!supabaseConfigured()) return { error: NOT_CONFIGURED };
  const parsed = credentials.safeParse({ email: fd.get("email"), password: fd.get("password") });
  // Do not reveal which part was wrong.
  if (!parsed.success) return { error: "Incorrect email or password." };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Incorrect email or password." };
  redirect("/");
}

export async function requestPasswordReset(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!supabaseConfigured()) return { error: NOT_CONFIGURED };
  const email = z.email().safeParse(String(fd.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { fieldErrors: { email: "Enter a valid email address" } };
  const supabase = await supabaseServer();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${await siteOrigin()}/auth/callback?next=/more` });
  // Same answer whether or not the account exists.
  return { ok: true, message: "If that email has an account, a reset link is on its way." };
}

export async function signOut() {
  if (supabaseConfigured()) {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
