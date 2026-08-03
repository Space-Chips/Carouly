"use client";

import { ArrowRight, MagnifyingGlass } from "@phosphor-icons/react";

/**
 * The step before the price.
 *
 * Nothing here sells the software. It reads back what the app already found in
 * the user's own domain, because at this exact moment — setup finished, bank
 * populated — the product has just done real work and the user has not seen it
 * yet. Stating the outcome before naming a number is the single biggest
 * structural difference between paywalls that convert and paywalls that do not.
 *
 * Every number on this screen is arithmetic on their real data. There is no
 * estimated time saved and no invented comparison, because a claim they can
 * check and disbelieve costs more than it earns.
 */
export default function ValueStep({
  brandName,
  domain,
  keywordCount,
  topKeywords,
  perDay,
  onContinue,
}: {
  brandName: string | null;
  domain: string | null;
  keywordCount: number;
  topKeywords: string[];
  perDay: number;
  onContinue: () => void;
}) {
  const yearly = perDay * 365;
  const name = brandName ?? "Your brand";

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="rise">
        <p className="text-xs uppercase tracking-[0.25em] text-dim">
          Setup complete
        </p>
        <h1 className="balance mt-4 max-w-[680px] text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {keywordCount > 0 ? (
            <>
              {keywordCount} things your audience is
              <br />
              already searching for.
            </>
          ) : (
            <>
              {name} is set up.
              <br />
              Here is what happens next.
            </>
          )}
        </h1>
        <p className="pretty mt-4 max-w-[680px] text-base text-muted-foreground">
          {keywordCount > 0 ? (
            <>
              Pulled from real search suggestions in{" "}
              <span className="text-foreground">{domain ?? "your domain"}</span>
              , then ranked by how much demand each one has against how hard it
              is to rank for.
            </>
          ) : (
            <>
              Research runs against real search suggestions in{" "}
              <span className="text-foreground">{domain ?? "your domain"}</span>{" "}
              and ranks what it finds by demand against difficulty.
            </>
          )}
        </p>
      </div>

      {topKeywords.length ? (
        <div className="rise stagger-1 mt-10 rounded-2xl border border-hair bg-raise p-6">
          <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-dim">
            <MagnifyingGlass weight="bold" aria-hidden className="size-3.5" />
            First three in the queue
          </p>
          <ul className="mt-4 grid gap-2">
            {topKeywords.map((keyword, index) => (
              <li
                key={keyword}
                className="flex items-center gap-3 rounded-xl border border-hair bg-raise-2 p-4"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ember/15 text-xs font-medium tabular-nums text-ember-lit">
                  {index + 1}
                </span>
                <span className="min-w-0 truncate text-sm">{keyword}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* The outcome, stated as the arithmetic it is. */}
      <div className="rise stagger-2 mt-6 rounded-2xl border border-hair bg-raise p-6">
        <p className="balance text-xl font-semibold leading-snug">
          At {perDay} a day, that is {yearly.toLocaleString()} carousels in a
          year.
        </p>
        <p className="pretty mt-3 text-sm text-muted-foreground">
          Written, illustrated, rendered and posted on your schedule. You keep
          the edit button on every slide and never have to open the app for one
          to go out.
        </p>
      </div>

      <div className="rise stagger-3 mt-8">
        <button
          type="button"
          onClick={onContinue}
          className="group flex w-full items-center justify-center gap-2 rounded-full bg-ember px-6 py-3 text-base font-semibold text-white outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-ember-lit active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          See my plan
          <ArrowRight
            weight="bold"
            aria-hidden
            className="size-4 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1"
          />
        </button>
        <p className="mt-3 text-center text-xs text-dim">
          Nothing is charged on the next screen.
        </p>
      </div>
    </div>
  );
}
