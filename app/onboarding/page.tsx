import { redirect } from "next/navigation";

import OnboardingWizard from "@/components/OnboardingWizard";
import { getBrand } from "@/lib/actions/brand.actions";

export default async function OnboardingPage() {
  const brand = await getBrand();

  // Onboarding is first-run only. Editing an existing brand belongs in Settings.
  if (brand) redirect("/settings");

  return (
    <main className="pb-24">
      <div className="rise max-w-xl">
        <h1 className="text-3xl font-bold tracking-tight">
          Set up your brand
        </h1>
        <p className="mt-3 text-muted-foreground">
          This is everything the generator knows about you. About a minute.
        </p>
      </div>

      <div className="mt-12">
        <OnboardingWizard />
      </div>
    </main>
  );
}
