import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

import AuthFormSkeleton from "@/components/auth/AuthFormSkeleton";
import AuthShell from "@/components/auth/AuthShell";
import { authCopy, studioHref } from "@/components/auth/copy";
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
  const copy = authCopy("sign-in", site);

  return (
    <AuthShell
      site={site}
      eyebrow={copy.eyebrow}
      heading={copy.heading}
      blurb={copy.blurb}
    >
      {/* The address is only in hand when Clerk parked it in `redirect_url`,
          and in that case Clerk will honour it on its own. Naming it as a
          fallback covers the other arrival — somebody who opened /sign-in
          directly — without overriding a destination the middleware chose. */}
      <SignIn
        withSignUp
        fallbackRedirectUrl={studioHref(site)}
        appearance={paperClerkForm}
        fallback={<AuthFormSkeleton />}
      />
    </AuthShell>
  );
}
