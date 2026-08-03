"use client";

import { SubscriptionDetailsButton, useSubscription } from "@clerk/nextjs/experimental";
import { ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";

import { Tier } from "@/lib/plans";

/**
 * The plan, in Settings.
 *
 * Reads Clerk directly rather than the mirrored table, so it shows renewal
 * dates and trial state the instant they change instead of whenever the
 * webhook last landed. The mirror exists for the cron; this is a live view.
 *
 * Cancelling lives one click away inside Clerk's own sheet. Burying it would
 * buy a month and cost the renewal after it — and the retention number is the
 * one that decides whether any of this was worth building.
 */
export default function PlanPanel({
  tier,
  quota,
}: {
  tier: Tier;
  quota: { used: number; limit: number } | null;
}) {
  const { data: subscription, isLoading } = useSubscription();

  const item = subscription?.subscriptionItems?.find(
    (candidate) => candidate.plan?.slug === tier.slug
  );
  const onTrial = Boolean(item?.isFreeTrial);
  const renewsAt = subscription?.nextPayment?.date ?? null;

  return (
    <div className="rounded-xl border border-white/10 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold">{tier.name}</span>
            {onTrial ? (
              <span className="rounded-full border border-ember/40 bg-ember/10 px-2 py-0.5 text-xs font-medium text-ember-lit">
                Free trial
              </span>
            ) : null}
          </p>
          <p className="pretty mt-1 text-sm text-muted-foreground">
            {tier.tagline}
          </p>
        </div>

        {tier.id === "free" ? (
          <Link
            href="/upgrade"
            className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-ember-lit active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            See plans
            <ArrowRight
              weight="bold"
              aria-hidden
              className="size-4 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1"
            />
          </Link>
        ) : (
          <SubscriptionDetailsButton>
            <button
              type="button"
              className="shrink-0 rounded-full border border-hair px-4 py-2 text-sm font-medium transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/25"
            >
              Manage subscription
            </button>
          </SubscriptionDetailsButton>
        )}
      </div>

      <p className="mt-4 border-t border-white/10 pt-4 text-sm text-muted-foreground">
        {tier.id === "free" ? (
          quota ? (
            <>
              {quota.used} of {quota.limit} free carousels used. Autopilot and
              publishing both need a plan.
            </>
          ) : (
            <>Autopilot and publishing both need a plan.</>
          )
        ) : isLoading ? (
          // No skeleton for one line of text — a shimmer here would be louder
          // than the thing it stands in for.
          <span className="breathe">Checking your subscription…</span>
        ) : onTrial && renewsAt ? (
          <>
            Your trial runs until {renewsAt.toLocaleDateString()}. Cancel before
            then and you are not charged.
          </>
        ) : renewsAt ? (
          <>Renews {renewsAt.toLocaleDateString()}. Cancel any time.</>
        ) : (
          <>Cancel any time.</>
        )}
      </p>
    </div>
  );
}
