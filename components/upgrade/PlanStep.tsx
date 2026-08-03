"use client";

import { CheckoutButton } from "@clerk/nextjs/experimental";
import { ArrowRight, Check } from "@phosphor-icons/react";
import { useState } from "react";

import TrialTimeline from "@/components/upgrade/TrialTimeline";
import { Tier } from "@/lib/plans";
import { annualMath, PaywallCopy } from "@/lib/paywall";

export type Period = "annual" | "month";

/**
 * The price step.
 *
 * Deliberately two options, not three. A third row measurably slows the
 * decision down without moving revenue, so Studio lives behind "Compare all
 * plans" instead of competing for attention here. Annual is preselected: it is
 * the higher lifetime value and, with a trial in front of it, the lower risk
 * choice for the user too.
 *
 * Prices come from Clerk rather than from the local tier catalogue, so editing
 * a price in the dashboard changes this screen with no deploy. The catalogue is
 * still what describes the plan, because Clerk has no field for "what does this
 * actually do for me".
 */
export default function PlanStep({
  tier,
  copy,
  planId,
  monthly,
  annual,
  trialDays,
  onCompareAll,
  onDismiss,
  children,
}: {
  tier: Tier;
  copy: PaywallCopy;
  /** Clerk's plan id. Null while plans are still loading or misconfigured. */
  planId: string | null;
  monthly: number;
  annual: number;
  trialDays: number;
  onCompareAll: () => void;
  /** Called when the user tries to leave without choosing. */
  onDismiss: () => void;
  /** The value argument, rendered underneath the price. */
  children?: React.ReactNode;
}) {
  const [period, setPeriod] = useState<Period>("annual");
  const math = annualMath(monthly, annual);
  const price = period === "annual" ? annual : monthly;

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="rise">
        <p className="text-xs uppercase tracking-[0.25em] text-dim">
          {copy.eyebrow}
        </p>
        {/* Capped so the line breaks where the thought breaks rather than
            wherever the viewport happens to end. */}
        <h1 className="balance mt-4 max-w-[680px] text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {copy.headline}
        </h1>
        <p className="pretty mt-4 max-w-[680px] text-base text-muted-foreground">
          {copy.body}
        </p>
      </div>

      <div className="rise stagger-1 mt-10 rounded-2xl border border-hair bg-raise p-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-lg font-semibold">{tier.name}</p>
            <p className="pretty mt-1 text-sm text-muted-foreground">
              {tier.tagline}
            </p>
          </div>
          {trialDays > 0 ? (
            <span className="shrink-0 rounded-full border border-ember/40 bg-ember/10 px-3 py-1 text-xs font-medium text-ember-lit">
              {trialDays} days free
            </span>
          ) : null}
        </div>

        {/* Two rows, not a segmented toggle. Apple now rejects trial toggles
            that make the charge ambiguous, and a radio group states the choice
            plainly: each row shows its own total and what it renews at. */}
        <fieldset className="mt-6">
          <legend className="sr-only">Billing period</legend>
          <div className="grid gap-3">
            <PeriodOption
              checked={period === "annual"}
              onSelect={() => setPeriod("annual")}
              title="Yearly"
              price={`$${annual}`}
              unit="a year"
              note={`$${math.perDay} a day, billed once`}
              badge={`${math.monthsFree} months free`}
            />
            <PeriodOption
              checked={period === "month"}
              onSelect={() => setPeriod("month")}
              title="Monthly"
              price={`$${monthly}`}
              unit="a month"
              note={`$${(monthly * 12).toFixed(0)} a year at this rate`}
            />
          </div>
        </fieldset>

        {trialDays > 0 ? (
          <div className="mt-8 border-t border-hair pt-6">
            <TrialTimeline
              days={trialDays}
              price={`$${price}`}
              period={period}
            />
          </div>
        ) : null}

        <div className="mt-8">
          {planId ? (
            <CheckoutButton
              planId={planId}
              planPeriod={period}
              newSubscriptionRedirectUrl="/dashboard?welcome=1"
            >
              <button
                type="button"
                className="group flex w-full items-center justify-center gap-2 rounded-full bg-ember px-6 py-3 text-base font-semibold text-white outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-ember-lit active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                {trialDays > 0 ? copy.cta : `Subscribe · $${price}`}
                {/* The chevron is on nearly every paywall that wins its test.
                    It reads as "there is a next step", which is true: this
                    opens checkout, it does not charge anything. */}
                <ArrowRight
                  weight="bold"
                  aria-hidden
                  className="size-4 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1"
                />
              </button>
            </CheckoutButton>
          ) : (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
              Billing is not configured yet. Create a plan with the slug{" "}
              <code className="font-mono text-xs">{tier.slug}</code> under
              Subscription plans in the Clerk dashboard.
            </p>
          )}

          {/* The single highest leverage line on the page for its size. */}
          <p className="mt-3 text-center text-xs text-dim">
            {trialDays > 0
              ? `No commitment. Cancel any time in the first ${trialDays} days and you are not charged.`
              : "No commitment. Cancel any time."}
          </p>
        </div>
      </div>

      <div className="rise stagger-2 mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
        <button
          type="button"
          onClick={onCompareAll}
          className="text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
        >
          Compare all plans
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-dim transition-colors hover:text-muted-foreground"
        >
          Not now
        </button>
      </div>

      {children}
    </div>
  );
}

const PeriodOption = ({
  checked,
  onSelect,
  title,
  price,
  unit,
  note,
  badge,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  price: string;
  unit: string;
  note: string;
  badge?: string;
}) => (
  // The card sits 24px inside a rounded-2xl parent, so the nested radius
  // formula lands it below the 2px floor and it takes the next step down.
  <label
    className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
      checked
        ? "border-ember/60 bg-ember/[0.06]"
        : "border-hair bg-raise-2 hover:border-white/20"
    }`}
  >
    <input
      type="radio"
      name="period"
      checked={checked}
      onChange={onSelect}
      className="sr-only"
    />
    <span
      aria-hidden
      className={`grid size-5 shrink-0 place-items-center rounded-full border transition-colors ${
        checked ? "border-ember bg-ember text-white" : "border-white/25"
      }`}
    >
      {checked ? <Check weight="bold" className="size-3" /> : null}
    </span>

    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium">{title}</span>
        {badge ? (
          <span className="rounded-full bg-signal/15 px-2 py-0.5 text-xs font-medium text-signal">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="mt-0.5 block text-xs text-dim">{note}</span>
    </span>

    <span className="shrink-0 text-right">
      <span className="block text-lg font-semibold tabular-nums">{price}</span>
      <span className="block text-xs text-dim">{unit}</span>
    </span>
  </label>
);
