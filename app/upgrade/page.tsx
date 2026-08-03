import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import Paywall from "@/components/upgrade/Paywall";
import { getEntitlement, getQuota, TIERS } from "@/lib/billing";
import { getBrand } from "@/lib/actions/brand.actions";
import { getKeywords } from "@/lib/actions/keyword.actions";
import { toReason } from "@/lib/paywall";

export const metadata: Metadata = {
  title: "Your plan",
  // Signed-in surface behind a gate. Nothing here should ever rank.
  robots: { index: false, follow: false },
};

/**
 * The paywall.
 *
 * Two things decide what it shows. `reason` is the gate the user hit, which
 * picks the headline. `from=onboarding` means they have just finished setup
 * and have never seen the product's value stated back to them, so they get the
 * value step first and the price second — a two step paywall, which is what
 * every comparison of the two formats favours. Everyone else arrived mid task
 * and gets the price immediately, with the value below it.
 */
export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; from?: string }>;
}) {
  const { userId } = await auth();

  if (!userId) redirect("/sign-in");

  const { reason: rawReason, from } = await searchParams;
  const reason = toReason(rawReason);

  const [entitlement, brand] = await Promise.all([
    getEntitlement(),
    getBrand(),
  ]);

  // Already paying, and not here to move up a tier. Sending them to a sales
  // page they cannot act on is worse than sending them to the thing they can.
  if (entitlement.isPaid && reason !== "posts_per_day") {
    redirect("/settings#plan");
  }

  const [quota, keywords] = await Promise.all([
    getQuota(userId),
    // The bank is the proof: it is real research on their real domain, and it
    // already exists by the time anyone reaches this page.
    brand ? getKeywords() : Promise.resolve([]),
  ]);

  const usable = keywords.filter(
    (keyword) => keyword.status === "new" || keyword.status === "approved"
  );

  return (
    <Paywall
      reason={reason}
      startAtValue={from === "onboarding"}
      brandName={brand?.name ?? null}
      domain={brand?.domain ?? null}
      keywordCount={usable.length}
      topKeywords={usable.slice(0, 3).map((keyword) => keyword.keyword)}
      quota={{ used: quota.used, limit: TIERS.free.limits.carousels }}
      currentTierId={entitlement.tier.id}
    />
  );
}
