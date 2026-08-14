"use client";

import { ArrowRight } from "@phosphor-icons/react";
import { useState, useTransition } from "react";

import { startCheckout } from "@/lib/actions/credit.actions";
import {
  cutsFor,
  FEATURED_PACK,
  formatCredits,
  perThousand,
  savingAgainstSmallest,
  type Pack,
} from "@/lib/credits/prices";

/**
 * The three packs.
 *
 * Three options keep the choice simple, while the middle pack gives people a
 * clear default. It is called out with an honest recommendation and a stronger
 * action, so the page has a decisive path without hiding the other prices.
 */
export default function Packs({
  packs,
  ready,
}: {
  packs: (Pack & { buyable: boolean })[];
  /** Stripe is configured at all. */
  ready: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const buy = (packId: string) => {
    setError(null);
    setBusy(packId);

    startTransition(async () => {
      try {
        const url = await startCheckout(packId);
        // A full navigation, not a router push: this leaves the app for
        // Stripe's own domain.
        window.location.href = url;
      } catch (problem) {
        setError(
          problem instanceof Error
            ? problem.message
            : "Checkout would not open. Try again in a moment."
        );
        setBusy(null);
      }
    });
  };

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        {packs.map((pack, index) => {
          const featured = pack.id === FEATURED_PACK;
          const saving = savingAgainstSmallest(pack);

          return (
            <div
              key={pack.id}
              className={`rise stagger-${index + 1} relative flex flex-col rounded-2xl border p-6 transition-transform duration-200 hover:-translate-y-0.5 ${
                featured
                  ? "border-ember/60 bg-[#fffaf6] shadow-[0_12px_35px_rgba(196,85,47,0.12)] sm:-translate-y-1"
                  : "border-rule bg-paper-lift"
              }`}
            >
              {featured ? (
                <span className="absolute -top-3 left-5 rounded-full bg-ember px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-white">
                  Most popular
                </span>
              ) : null}

              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-medium text-graphite">{pack.name}</h3>
                {saving > 0 ? (
                  <span className="rounded-full bg-ember/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ember">
                    {saving}% cheaper
                  </span>
                ) : null}
              </div>

              {/* The credits are the product and the price is the condition, so
                  the credits are set large and the dollars are a line under
                  them. Every other pricing page in the world does this the
                  other way round, and every other pricing page is selling the
                  money. */}
              <p className="mt-5 font-mono text-3xl tabular-nums tracking-tight text-graphite">
                {formatCredits(pack.credits)}
              </p>
              <p className="mt-1 text-sm text-mute">
                credits · ${pack.price} once
              </p>

              <p className="pretty mt-4 text-sm leading-relaxed text-mute">
                {pack.note}
              </p>

              <dl className="mt-5 space-y-1.5 border-t border-rule pt-4 font-mono text-[11px] uppercase tracking-[0.1em] text-mute">
                <div className="flex justify-between gap-3">
                  <dt>Cuts</dt>
                  <dd className="tabular-nums text-graphite">
                    ~{cutsFor(pack.credits)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Per 1,000</dt>
                  <dd className="tabular-nums text-graphite">
                    ${perThousand(pack)}
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                disabled={!pack.buyable || busy !== null}
                onClick={() => buy(pack.id)}
                className={`group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-200 ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite disabled:cursor-not-allowed disabled:opacity-45 ${
                  featured
                    ? "bg-ember text-white shadow-sm hover:bg-ember-lit active:scale-[0.98]"
                    : "border border-rule text-graphite hover:border-graphite/30 active:scale-[0.98]"
                }`}
              >
                {busy === pack.id ? (
                  <span className="breathe">Opening checkout…</span>
                ) : (
                  <>
                    Buy {pack.name}
                    <ArrowRight
                      weight="bold"
                      aria-hidden
                      className="size-3.5 transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5"
                    />
                  </>
                )}
              </button>

              {!pack.buyable ? (
                <p className="mt-2 text-center text-xs text-mute">
                  {ready
                    ? "No price configured for this pack yet."
                    : "Checkout is not set up on this deployment."}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? (
        <p
          role="alert"
          className="stream mt-4 rounded-xl border border-fail/30 bg-fail/[0.04] p-3 text-sm text-fail"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
