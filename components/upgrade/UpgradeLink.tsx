import { ArrowRight, Lock } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { PaywallReason } from "@/lib/plans";

/**
 * The one door to the paywall.
 *
 * Every gate in the app routes through this, carrying the reason it fired, so
 * the paywall can open on the thing the user just reached for. Keeping it in a
 * single component is what stops five gates from growing five different
 * wordings and five different weights.
 */
export default function UpgradeLink({
  reason,
  children,
  variant = "solid",
  className = "",
}: {
  reason: PaywallReason;
  children: React.ReactNode;
  variant?: "solid" | "quiet";
  className?: string;
}) {
  const base =
    "group inline-flex items-center justify-center gap-2 rounded-full font-semibold outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 focus-visible:ring-offset-black";

  const skin =
    variant === "solid"
      ? "bg-ember px-6 py-3 text-base text-white hover:bg-ember-lit"
      : "border border-hair px-4 py-2 text-sm text-foreground hover:border-white/25";

  return (
    <Link
      href={`/upgrade?reason=${reason}`}
      className={`${base} ${skin} ${className}`}
    >
      {variant === "quiet" ? (
        <Lock weight="bold" aria-hidden className="size-3.5 text-dim" />
      ) : null}
      {children}
      <ArrowRight
        weight="bold"
        aria-hidden
        className="size-4 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1"
      />
    </Link>
  );
}
