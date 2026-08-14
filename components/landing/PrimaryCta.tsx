"use client";

import { Show, SignUpButton } from "@clerk/nextjs";
import { ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";

/**
 * The page's only primary action, in one place so every instance is worded and
 * weighted identically. A visitor who scrolls past three of these should feel
 * like they passed the same door three times, not like they were offered three
 * different things.
 */
export default function PrimaryCta({
  size = "lg",
  className = "",
}: {
  size?: "lg" | "md";
  className?: string;
}) {
  const base =
    "group inline-flex items-center justify-center gap-2 rounded-full bg-ember font-semibold text-white outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-ember-lit active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 focus-visible:ring-offset-black";

  const scale =
    size === "lg" ? "px-6 py-3 text-base" : "px-3 py-2 text-sm";

  return (
    <>
      <Show when="signed-out">
        <SignUpButton>
          <button className={`${base} ${scale} ${className}`}>
            Automate now
            <ArrowRight
              weight="bold"
              aria-hidden
              className="size-4 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1"
            />
          </button>
        </SignUpButton>
      </Show>

      <Show when="signed-in">
        <Link href="/studio" className={`${base} ${scale} ${className}`}>
          Open the studio
          <ArrowRight
            weight="bold"
            aria-hidden
            className="size-4 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1"
          />
        </Link>
      </Show>
    </>
  );
}
