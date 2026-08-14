import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

import AuthShell from "@/components/auth/AuthShell";
import { paperClerkForm } from "@/lib/clerk-appearance";
import { siteFromRedirect } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Carouly and pick up the run.",
  // A login wall has nothing to offer a crawler and should never be the result
  // somebody lands on for a brand search.
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const { redirect_url } = await searchParams;
  const site = siteFromRedirect(redirect_url);

  return (
    <AuthShell
      site={site}
      eyebrow={site ? "Queued" : "Welcome back"}
      heading={
        site
          ? "Sign in and this run starts."
          : "Sign in and pick up where you left off."
      }
      blurb={
        site
          ? "We read the address as soon as you are through, and the first cut is waiting a few minutes later. Nothing publishes until you connect an account."
          : "Your projects, your brand kits and everything the runs have kept are where you left them."
      }
    >
      <SignIn appearance={paperClerkForm} />
    </AuthShell>
  );
}
