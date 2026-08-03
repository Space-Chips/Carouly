"use client";

import { usePlans } from "@clerk/nextjs/experimental";
import { useRouter } from "next/navigation";
import { useState } from "react";

import AllPlansDialog from "@/components/upgrade/AllPlansDialog";
import ExitOffer from "@/components/upgrade/ExitOffer";
import PlanStep from "@/components/upgrade/PlanStep";
import ValueStep from "@/components/upgrade/ValueStep";
import { PaywallReason, TierId, TIERS } from "@/lib/plans";
import { PAYWALL_COPY } from "@/lib/paywall";

/**
 * The paywall as a flow rather than a screen.
 *
 * Coming out of onboarding it runs value first, price second. Coming from a
 * feature gate it opens on the price, because the user already knows what they
 * wanted — they just tried to do it. Either way the exit is a smaller
 * commitment, never a lower price.
 *
 * Prices, trial length and plan ids all come from Clerk at render time. Nothing
 * about money is hardcoded here; `TIERS` supplies only the description of what
 * each plan does, which Clerk has nowhere to store.
 */
export default function Paywall({
  reason,
  startAtValue,
  brandName,
  domain,
  keywordCount,
  topKeywords,
  quota,
  currentTierId,
}: {
  reason: PaywallReason;
  startAtValue: boolean;
  brandName: string | null;
  domain: string | null;
  keywordCount: number;
  topKeywords: string[];
  quota: { used: number; limit: number };
  currentTierId: TierId;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"value" | "plan">(
    startAtValue ? "value" : "plan"
  );
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [exitOffered, setExitOffered] = useState(false);

  const { data: plans, isLoading } = usePlans({ for: "user" });

  // Someone already on Autopilot who hit the volume gate is being sold Studio,
  // not Autopilot again.
  const target =
    reason === "posts_per_day" || currentTierId === "autopilot"
      ? TIERS.studio
      : TIERS.autopilot;

  const plan = plans?.find((candidate) => candidate.slug === target.slug);

  // Clerk stores prices in cents. Falling back to the catalogue keeps the page
  // readable while the request is in flight instead of flashing "$0".
  const monthly = plan ? Math.round(plan.fee.amount / 100) : target.monthly;
  const annual = plan?.annualFee
    ? Math.round(plan.annualFee.amount / 100)
    : target.annual;
  const trialDays = plan?.freeTrialEnabled ? (plan.freeTrialDays ?? 0) : 0;

  const dismiss = () => {
    // One exit offer per visit. Showing it every time someone reaches for the
    // back button is how a paywall starts feeling like a trap.
    if (!exitOffered && plan) {
      setExitOffered(true);
      setShowExit(true);
      return;
    }

    router.push("/dashboard");
  };

  return (
    <main className="pb-24">
      {step === "value" ? (
        <ValueStep
          brandName={brandName}
          domain={domain}
          keywordCount={keywordCount}
          topKeywords={topKeywords}
          perDay={target.limits.postsPerDay}
          onContinue={() => setStep("plan")}
        />
      ) : (
        <PlanStep
          tier={target}
          copy={PAYWALL_COPY[reason]}
          planId={isLoading ? null : (plan?.id ?? null)}
          monthly={monthly}
          annual={annual}
          trialDays={trialDays}
          onCompareAll={() => setShowAllPlans(true)}
          onDismiss={dismiss}
        >
          <WhatYouGet outcomes={target.outcomes} quota={quota} />
        </PlanStep>
      )}

      <AllPlansDialog open={showAllPlans} onOpenChange={setShowAllPlans} />

      <ExitOffer
        open={showExit}
        onOpenChange={setShowExit}
        planId={plan?.id ?? null}
        monthly={monthly}
        trialDays={trialDays}
      />
    </main>
  );
}

/**
 * The argument, underneath the price rather than above it.
 *
 * Someone who arrived from a feature gate has already decided they want the
 * thing; making them scroll past a benefits list to reach the button taxes the
 * decision they already made. Someone still weighing it up scrolls.
 */
const WhatYouGet = ({
  outcomes,
  quota,
}: {
  outcomes: string[];
  quota: { used: number; limit: number };
}) => (
  <div className="rise stagger-3 mt-16 border-t border-hair pt-10">
    <h2 className="text-xs uppercase tracking-[0.25em] text-dim">
      What the plan changes
    </h2>

    <ul className="mt-6 grid gap-4">
      {outcomes.map((outcome) => (
        <li key={outcome} className="flex gap-3">
          <span
            aria-hidden
            className="mt-2 size-1.5 shrink-0 rounded-full bg-ember"
          />
          <span className="pretty text-sm">{outcome}</span>
        </li>
      ))}
    </ul>

    <p className="pretty mt-8 text-sm text-muted-foreground">
      You have used {quota.used} of your {quota.limit} free carousels. Those
      stay yours either way, and every slide stays downloadable on any plan.
    </p>
  </div>
);
