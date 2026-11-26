import { Suspense } from "react";
import { redirect } from "next/navigation";

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
  const { store, user } = await requireSession();
  if (await store.getProperty(user.id)) redirect("/");
  return <OnboardingForm />;
}
