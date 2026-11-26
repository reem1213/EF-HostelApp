import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { OnboardingForm } from "@/components/onboarding-form";
import { requireSession } from "@/lib/session";

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-hairline" aria-busy="true" />}>
      <OnboardingView />
    </Suspense>
  );
}

async function OnboardingView() {
  // Must render per request. Without this the page is prerendered at build time and a
  // redirect gets baked in and cached, which sends new users in a loop.
  await connection();
  const { store, user } = await requireSession();
  let existing = null;
  try {
    existing = await store.getProperty(user.id);
  } catch (e) {
    console.error("[onboarding] could not read the property", e);
    redirect("/setup-problem");
  }
  if (existing) redirect("/");
  return <OnboardingForm />;
}
