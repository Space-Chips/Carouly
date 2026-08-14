"use client";

import { ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";

import type { CreditGate } from "@/lib/credits/gates";

/**
 * The way to the buy page, from wherever somebody ran out.
 *
 * Carries the gate so the page it lands on opens on the sentence about the
 * thing they were doing, rather than a generic pitch — the person is holding an
 * intent and restating it is cheaper than rebuilding it.
 *
 * Two weights and no more. `quiet` is for a link sitting inside a card that is
 * already about something else; the default is for the one place on a screen
 * where buying credits is the point.
 */
export default function BuyLink({
  gate = "general",
  need,
  variant = "solid",
  children,
}: {
  gate?: CreditGate;
  /** What they were short of, so the page can name the gap. */
  need?: number;
  variant?: "solid" | "quiet";
  children: React.ReactNode;
}) {
  const href = `/credits?gate=${gate}${need ? `&need=${need}` : ""}`;

  if (variant === "quiet") {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ember-lit underline-offset-4 transition-colors duration-300 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember"
      >
        {children}
        <ArrowRight weight="bold" aria-hidden className="size-3.5" />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-ember-lit active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      {children}
      <ArrowRight
        weight="bold"
        aria-hidden
        className="size-4 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1"
      />
    </Link>
  );
}
