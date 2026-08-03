"use client";

import { CheckoutButton } from "@clerk/nextjs/experimental";
import { ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Shown when someone tries to leave the price step without choosing.
 *
 * It offers a smaller commitment, not a smaller price. A last minute discount
 * teaches users that dismissing a paywall is how you get a better deal, and
 * once enough apps do that nobody believes the first price. A monthly plan at
 * the same trial length gets the same "yes" without training that behaviour,
 * and it stays honest with the person who paid full price yesterday.
 */
export default function ExitOffer({
  open,
  onOpenChange,
  planId,
  monthly,
  trialDays,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string | null;
  monthly: number;
  trialDays: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-hair bg-raise sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="balance text-xl leading-snug">
            Not ready to commit to a year?
          </DialogTitle>
          <DialogDescription className="pretty text-sm">
            Autopilot runs the same on the monthly plan, with the same{" "}
            {trialDays > 0 ? `${trialDays} day free trial` : "cancel any time"}.
            You can move to yearly later and keep what is left of the month.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 rounded-xl border border-hair bg-raise-2 p-4">
          <p className="flex items-baseline justify-between gap-4">
            <span className="text-sm font-medium">Autopilot, monthly</span>
            <span className="text-lg font-semibold tabular-nums">
              ${monthly}
              <span className="ml-1 text-xs font-normal text-dim">a month</span>
            </span>
          </p>
        </div>

        <div className="mt-4 grid gap-3">
          {planId ? (
            <CheckoutButton
              planId={planId}
              planPeriod="month"
              newSubscriptionRedirectUrl="/dashboard?welcome=1"
            >
              <button
                type="button"
                className="group flex w-full items-center justify-center gap-2 rounded-full bg-ember px-6 py-3 text-base font-semibold text-white outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-ember-lit active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                {trialDays > 0 ? "Start my free trial" : "Subscribe monthly"}
                <ArrowRight
                  weight="bold"
                  aria-hidden
                  className="size-4 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1"
                />
              </button>
            </CheckoutButton>
          ) : null}

          {/* The way out has to actually work, or the sheet is a trap. */}
          <Link
            href="/dashboard"
            className="rounded-full px-6 py-2 text-center text-sm text-dim transition-colors hover:text-muted-foreground"
          >
            Keep looking around
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
