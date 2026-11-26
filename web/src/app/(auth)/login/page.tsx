import { Suspense } from "react";

import { AuthForm } from "@/components/auth-form";
import { supabaseConfigured } from "@/lib/supabase/server";

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <Suspense>
      <LoginView searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginView({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return <AuthForm mode="login" demo={!supabaseConfigured()} linkError={sp.error === "link"} />;
}
