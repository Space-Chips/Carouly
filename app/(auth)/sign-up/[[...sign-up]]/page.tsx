import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";

import AuthShell from "@/components/auth/AuthShell";
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

  return (
    <AuthShell
      site={site}
      eyebrow={site ? "Queued" : "Early access"}
      heading={
        site
          ? "Create your account and this run starts."
          : "One address is the whole setup."
      }
      blurb={
        site
          ? "Free while we are in early access, and there is no card at signup. Nothing publishes until you connect an account."
          : "No brief, no forms, no filming. Paste the address you already have and the first vertical cut lands minutes later — free while we are in early access."
      }
    >
      <SignUp appearance={paperClerkForm} />
    </AuthShell>
  );
}
