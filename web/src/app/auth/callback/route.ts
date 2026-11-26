import { NextResponse, type NextRequest } from "next/server";

import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";

/** Landing point for email-confirmation and password-reset links. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  // Only allow same-site relative redirects. "//evil.com" and "/\evil.com" are rejected.
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";

  if (code && supabaseConfigured()) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext === "/" ? "/onboarding" : safeNext}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
