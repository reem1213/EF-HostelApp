import { AuthForm } from "@/components/auth-form";
import { supabaseConfigured } from "@/lib/supabase/server";

export default function SignupPage() {
  return <AuthForm mode="signup" demo={!supabaseConfigured()} />;
}
