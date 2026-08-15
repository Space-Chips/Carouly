import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";

import AuthFormSkeleton from "@/components/auth/AuthFormSkeleton";
import AuthShell from "@/components/auth/AuthShell";
import { authCopy, studioHref } from "@/components/auth/copy";
import { paperClerkForm } from "@/lib/clerk-appearance";
import { siteFromRedirect } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Start free",
  description: "Paste one address. Carouly turns it into vertical video nightly.",
  robots: { index: false, follow: false },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const { redirect_url } = await searchParams;
  const site = siteFromRedirect(redirect_url);
  const copy = authCopy("sign-up", site);

  return (
    <AuthShell
      site={site}
      eyebrow={copy.eyebrow}
      heading={copy.heading}
      blurb={copy.blurb}
    >
      <SignUp
        fallbackRedirectUrl={studioHref(site)}
        appearance={paperClerkForm}
        fallback={<AuthFormSkeleton />}
      />
    </AuthShell>
  );
}
