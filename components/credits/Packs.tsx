"use client";

import { ArrowRight, Check } from "@phosphor-icons/react";
import { useState, useTransition } from "react";

import { startCheckout } from "@/lib/actions/credit.actions";
import {
  bestRate,
  cutsFor,
  DEFAULT_SECONDS,
  FEATURED_PACK,
  formatCredits,
  perThousand,
  savingAgainstSmallest,
  type Pack,
} from "@/lib/credits/prices";

/**
 * The three packs, as the thing the page is for.
 *
 * One card is dark and the other two are paper. That is the whole hierarchy,
 * and it is doing the work a badge alone cannot: the eye lands on the middle
 * pack before it has read a word, which is the honest place for it to land —
 * Sample is a trial and Scale is a commitment, and the person reading this
 * arrived because a render stopped, not because they were shopping.
 *
 * Every line inside a card is computed from the pack rather than written next
 * to it. Cuts, the rate per thousand and the gap to the smallest pack all fall
 * out of `credits` and `price`, so the only way to make this page lie is to
 * change a number in the catalogue and have the card quietly follow.
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

  const smallest = packs[0];

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3 sm:gap-5">
        {packs.map((pack, index) => {
          const featured = pack.id === FEATURED_PACK;
          const cheapest = pack.price / pack.credits === bestRate;
          const saving = savingAgainstSmallest(pack);
          const cuts = cutsFor(pack.credits);
          const opening = busy === pack.id;

          const lines = [
            `About ${cuts} cut${cuts === 1 ? "" : "s"} at ${DEFAULT_SECONDS} seconds`,
            `$${perThousand(pack)} per 1,000 credits${
              saving > 0 ? ` · ${saving}% under ${smallest.name}` : ""
            }`,
            pack.note,
          ];

          return (
            /* The lift on the featured card is a margin rather than a
               transform, so it does not have to be undone and re-applied every
               time the card is hovered — two rules fighting over one transform
               is how a card ends up snapping back down under the cursor. */
            <div
              key={pack.id}
              className={`rise stagger-${index + 1} flex ${
                featured ? "sm:-my-5" : ""
              }`}
            >
              <article
                className={`group/card relative flex h-full w-full flex-col rounded-[1.25rem] border p-6 transition-[transform,box-shadow] duration-200 ease-[var(--ease-out)] motion-safe:hover:-translate-y-1 sm:p-7 ${
                  featured
                    ? "border-graphite bg-graphite text-bone shadow-[0_24px_60px_-30px_rgba(12,10,9,0.65)] hover:shadow-[0_30px_70px_-28px_rgba(12,10,9,0.7)]"
                    : "border-rule bg-paper-lift text-graphite hover:border-graphite/20 hover:shadow-[0_18px_40px_-30px_rgba(12,10,9,0.4)]"
                }`}
              >
                <header className="flex items-start justify-between gap-3">
                  <h3
                    className={`text-sm font-medium ${
                      featured ? "text-bone" : "text-graphite"
                    }`}
                  >
                    {pack.name}
                  </h3>

                  {/* Two ranks, and only where one is true. "Recommended" is a
                      claim we are making; "best rate" is arithmetic. Labelling
                      all three cards would rank nothing. */}
                  {featured ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ember-lit">
                      Recommended
                    </span>
                  ) : cheapest ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
                      Best rate
                    </span>
                  ) : null}
                </header>

                {/* The credits are the product and the price is the condition,
                    so the credits are set in the poster face and the dollars
                    are a line under them. Every other pricing page in the world
                    does this the other way round, and every other pricing page
                    is selling the money. */}
                <p
                  className={`poster mt-6 text-[3.25rem] tabular-nums sm:text-6xl ${
                    featured ? "text-bone" : "text-graphite"
                  }`}
                >
                  {formatCredits(pack.credits)}
                </p>

                <p
                  className={`mt-2 text-sm ${featured ? "text-dim" : "text-mute"}`}
                >
                  credits ·{" "}
                  <span
                    className={`font-mono tabular-nums ${
                      featured ? "text-bone" : "text-graphite"
                    }`}
                  >
                    ${pack.price}
                  </span>{" "}
                  once
                </p>

                <ul className={`mt-6 space-y-2.5 border-t pt-5 text-sm ${
                  featured ? "border-white/10" : "border-rule"
                }`}>
                  {lines.map((line) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <Check
                        weight="bold"
                        aria-hidden
                        className={`mt-0.5 size-3.5 shrink-0 ${
                          featured ? "text-ember-lit" : "text-ember"
                        }`}
                      />
                      <span
                        className={`pretty leading-snug ${
                          featured ? "text-bone/85" : "text-mute"
                        }`}
                      >
                        {line}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Pushed to the foot of the card rather than sitting a fixed
                    gap under the last bullet, so the three actions line up on
                    one row however many lines the notes above them run to. */}
                <div className="mt-auto pt-8">
                  <button
                    type="button"
                    disabled={!pack.buyable || busy !== null}
                    onClick={() => buy(pack.id)}
                    className={`group/cta inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium transition-colors duration-200 ease-[var(--ease-out)] motion-safe:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${
                      featured
                        ? "bg-ember text-white hover:bg-ember-lit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-lit"
                        : "border border-graphite/25 text-graphite hover:border-graphite/50 hover:bg-paper-sunk/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite"
                    }`}
                  >
                    {opening ? (
                      <span className="breathe">Opening checkout…</span>
                    ) : (
                      <>
                        Buy {pack.name}
                        <ArrowRight
                          weight="bold"
                          aria-hidden
                          className="size-3.5 transition-transform duration-200 ease-[var(--ease-out)] motion-safe:group-hover/cta:translate-x-0.5"
                        />
                      </>
                    )}
                  </button>

                  {!pack.buyable ? (
                    <p
                      className={`mt-3 text-center text-xs ${
                        featured ? "text-dim" : "text-mute"
                      }`}
                    >
                      {ready
                        ? "No price configured for this pack yet."
                        : "Checkout is not set up on this deployment."}
                    </p>
                  ) : null}
                </div>
              </article>
            </div>
          );
        })}
      </div>

      {error ? (
        <p
          role="alert"
          className="stream mx-auto mt-6 max-w-xl rounded-xl border border-fail/30 bg-fail/[0.04] p-3 text-center text-sm text-fail"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
