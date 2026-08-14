import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import type { Account } from "@/lib/credits/ledger";
import { cutsFor, formatCredits, TYPICAL_RENDER } from "@/lib/credits/prices";

/**
 * Credits, in Settings.
 *
 * A server component with no live subscription to watch, which is most of what
 * changed here: the panel this replaced had to ask Clerk about renewal dates and
 * trial states on the client, because a subscription is a thing that keeps
 * happening to you. A balance is not. It is a number that only moves when you
 * spend or buy, so it can be read once on the server and drawn.
 *
 * Nothing to cancel, so nothing to bury. The only action is buying more.
 */
export default function CreditPanel({ account }: { account: Account }) {
  const cuts = cutsFor(account.balance);
  const low = account.balance < TYPICAL_RENDER;

  return (
    <div className="rounded-xl border border-white/10 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-3xl tabular-nums tracking-tight">
            {formatCredits(account.balance)}
          </p>
          <p className="pretty mt-1 text-sm text-muted-foreground">
            credits ·{" "}
            {cuts > 0
              ? `about ${cuts} cut${cuts === 1 ? "" : "s"} left`
              : "not enough for a cut"}
          </p>
        </div>

        <Link
          href="/credits"
          className={`group inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
            low
              ? "bg-ember text-white hover:bg-ember-lit"
              : "border border-hair hover:border-white/25"
          }`}
        >
          {low ? "Buy credits" : "Top up"}
          <ArrowRight
            weight="bold"
            aria-hidden
            className="size-4 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1"
          />
        </Link>
      </div>

      {/* Two lifetime figures rather than a chart. They answer the only two
          questions anybody asks of their own account — how much have I put in,
          how much have I used — and a sparkline of a balance that moves four
          times a week would be decoration pretending to be data. */}
      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Added, all time</dt>
          <dd className="mt-0.5 font-mono tabular-nums">
            {formatCredits(account.grantedTotal)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Spent, all time</dt>
          <dd className="mt-0.5 font-mono tabular-nums">
            {formatCredits(account.spentTotal)}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-muted-foreground">
        Credits do not expire and there is no subscription.{" "}
        <Link
          href="/credits"
          className="underline underline-offset-4 transition-colors hover:text-foreground"
        >
          See what everything costs
        </Link>
        .
      </p>
    </div>
  );
}
