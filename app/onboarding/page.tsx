import { redirect } from "next/navigation";

import OnboardingWizard from "@/components/OnboardingWizard";
import { getBrand } from "@/lib/actions/brand.actions";
import { normalizeSite } from "@/lib/site-url";

/**
 * Where the hero box lands.
 *
 * The route is protected, so a signed-out visitor who pastes an address is
 * lifted into sign-up by the middleware and dropped back here with `site` still
 * on the URL. That is the whole reason the composer routes here rather than
 * opening Clerk itself: one path, and the address survives the detour.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const brand = await getBrand();

  // Onboarding is first-run only. Editing an existing brand belongs in Settings.
  if (brand) redirect("/settings");

  // Re-checked here rather than trusted: this value arrives from a query string
  // and is about to be written into a form and a database row.
  const { site } = await searchParams;
  const parsed = site ? normalizeSite(site) : null;
  const host = parsed?.ok ? parsed.host : null;

  return (
    <main className="pb-24">
      <div className="rise max-w-xl">
        <h1 className="text-3xl font-bold tracking-tight">
          Set up your brand
        </h1>
        <p className="mt-3 text-muted-foreground">
          {host
            ? "We have started you off from your address. Check what is below and fill in the rest."
            : "This is everything the generator knows about you. About a minute."}
        </p>
      </div>

      <div className="mt-12">
        <OnboardingWizard site={host} />
      </div>
    </main>
  );
}
