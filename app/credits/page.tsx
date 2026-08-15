import type { Metadata } from "next";
import { ArrowDown } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import CostList from "@/components/credits/CostList";
import Packs from "@/components/credits/Packs";
import Tape from "@/components/credits/Tape";
import { checkoutReady, priceIdFor } from "@/lib/credits/checkout";
import { GATE_COPY, toGate } from "@/lib/credits/gates";
import { history, openAccount } from "@/lib/credits/ledger";
import {
  cutsFor,
  formatCredits,
  packById,
  PACKS,
  TYPICAL_RENDER,
} from "@/lib/credits/prices";

export const metadata: Metadata = {
  title: "Credits",
  // Signed-in surface behind a gate. Nothing here should ever rank.
  robots: { index: false, follow: false },
};

/**
 * The balance, what it buys, and where the last of it went.
 *
 * One page rather than the three this replaced. The old flow was a paywall, a
 * plan comparison and an exit offer — the machinery of persuading somebody into
 * a recurring commitment. Nothing here has to persuade anybody of anything: a
 * person arrives already wanting to render something, and the only questions
 * left are how much it costs and how much they have.
 *
 * So the packs are the page and everything else is a footnote to them. The
 * balance rides above the headline as a single pill rather than as the display
 * figure it used to be, because a number somebody already knows is context, not
 * news — the news is the three prices. Costs and history stay below, in reach
 * of anyone who wants to check the meter before feeding it.
 */
export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ gate?: string; need?: string; bought?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { gate: rawGate, need: rawNeed, bought } = await searchParams;
  const gate = toGate(rawGate);
  const copy = GATE_COPY[gate];

  const [account, entries] = await Promise.all([
    openAccount(userId),
    history(userId, 30),
  ]);

  const packs = PACKS.map((pack) => ({
    ...pack,
    buyable: Boolean(priceIdFor(pack)),
  }));

  /**
   * Back from a successful checkout.
   *
   * The credits are added by the webhook, not by this page, so there is a
   * second or two where somebody who has just paid is looking at their old
   * balance. Saying so is better than either lying about the number or leaving
   * them to refresh and wonder — and it is the honest description of what is
   * actually happening.
   */
  const justBought = bought ? packById(bought) : undefined;
  const settled = justBought ? account.balance >= justBought.credits : false;

  // What they were short of, when they got here from a refusal.
  const need = Number(rawNeed);
  const shortBy =
    Number.isFinite(need) && need > account.balance ? need - account.balance : 0;

  const cuts = cutsFor(account.balance);

  return (
    /* Paper, like the studio it is reached from. The receipt tape and the mono
       figures are set for a light ground — a statement is a printed thing, and
       every one anybody has ever checked was black on white. */
    <main
      data-surface="paper"
      className="min-h-screen max-w-none bg-paper px-0 pb-28 pt-0 text-graphite"
    >
      {/* The hero is set in Anton and the file is 100KB, so it is fetched
          alongside the document rather than after the first paint discovers it
          — a headline that reflows from Geist to a condensed poster face half a
          second in is the most visible layout shift the app has. */}
      <link
        rel="preload"
        as="font"
        type="font/ttf"
        href="/fonts/Anton-Regular.ttf"
        crossOrigin="anonymous"
      />

      <div className="mx-auto w-full max-w-5xl px-5 pt-12 sm:pt-16">
        {justBought ? (
          <div className="rise mb-10 rounded-2xl border border-ok/30 bg-ok/[0.05] p-5">
            <p className="text-sm font-medium text-graphite">
              {settled
                ? `${formatCredits(justBought.credits)} credits added.`
                : "Payment taken. The credits land in a moment."}
            </p>
            <p className="pretty mt-1 text-sm text-mute">
              {settled
                ? "They do not expire, and nothing renews."
                : "Stripe confirms the payment to us separately from sending you back here, so the balance below may take a few seconds to catch up. Refreshing is safe."}
            </p>
          </div>
        ) : null}

        <header className="text-center">
          {/* The balance, as one line at the top of the page.
              Ember when they are short of something specific, because that is
              the only state where the number is a problem rather than a fact. */}
          <p
            className={`rise inline-flex items-center gap-2.5 rounded-full px-4 py-2 font-mono text-[12px] ${
              shortBy > 0 ? "bg-ember text-white" : "bg-graphite text-bone"
            }`}
          >
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-current opacity-70"
            />
            {shortBy > 0 ? (
              <>
                <span className="tabular-nums">
                  {formatCredits(shortBy)} credits
                </span>
                <span className="opacity-70">short of that render</span>
              </>
            ) : (
              <>
                <span className="tabular-nums">
                  {formatCredits(account.balance)} credits
                </span>
                <span className="opacity-60" aria-hidden>
                  ·
                </span>
                <span className="opacity-70">
                  {account.balance >= TYPICAL_RENDER
                    ? `about ${cuts} cut${cuts === 1 ? "" : "s"} left`
                    : "not enough for a cut"}
                </span>
              </>
            )}
          </p>

          <h1 className="rise stagger-1 poster mt-7 text-[clamp(2.75rem,10vw,5.25rem)] text-graphite">
            {copy.cta}
          </h1>

          <p className="rise stagger-2 balance mx-auto mt-5 max-w-2xl text-lg leading-snug text-graphite sm:text-xl">
            {copy.headline}
          </p>

          <p className="rise stagger-3 pretty mx-auto mt-4 max-w-xl text-sm leading-relaxed text-mute">
            {copy.body}
          </p>
        </header>
      </div>

      {/* The packs, standing on the word the pricing turns on. */}
      <section
        aria-labelledby="packs-heading"
        className="relative isolate mt-6 overflow-hidden px-5 sm:mt-10"
      >
        <h2 id="packs-heading" className="sr-only">
          Credit packs
        </h2>

        <span
          aria-hidden
          className="ghost-word pointer-events-none absolute left-1/2 top-0 -z-10 -translate-x-1/2 whitespace-nowrap text-[clamp(6rem,26vw,22rem)]"
        >
          prepaid
        </span>

        <div className="mx-auto w-full max-w-5xl pt-24 sm:pt-40">
          <Packs packs={packs} ready={checkoutReady()} />

          <p className="pretty mx-auto mt-9 max-w-lg text-center text-xs leading-relaxed text-mute sm:mt-12">
            Cards are handled by Stripe and never touch our servers. Credits
            land on the balance the moment the payment confirms, do not expire,
            and nothing renews afterwards.
          </p>

          <div className="mt-7 flex justify-center">
            <a
              href="#costs"
              className="group inline-flex items-center gap-2 rounded-full border border-rule bg-paper-lift px-5 py-2.5 text-sm text-graphite transition-colors duration-200 ease-[var(--ease-out)] hover:border-graphite/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite"
            >
              See what everything costs
              <ArrowDown
                weight="bold"
                aria-hidden
                className="size-3.5 text-mute transition-transform duration-200 ease-[var(--ease-out)] motion-safe:group-hover:translate-y-0.5"
              />
            </a>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-5xl px-5">
        {/* Headings on the same centre line as the packs above them; the
            figures underneath stay left, because a price list is read down a
            column and a centred one cannot be. */}
        <section
          id="costs"
          className="mt-20 scroll-mt-20 border-t border-rule pt-14 sm:mt-24"
        >
          <div className="text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ember">
              The meter
            </p>
            <h2 className="mt-2 text-2xl font-medium tracking-tight text-graphite sm:text-3xl">
              What things cost
            </h2>
            <p className="pretty mx-auto mt-3 max-w-xl text-sm leading-relaxed text-mute">
              Every charge is one of these. Thinking and reading are single
              digits; the cut is the only line that scales, and it scales with
              the length you asked for.
            </p>
          </div>
          <div className="mt-8">
            <CostList />
          </div>
        </section>

        <section className="mt-20">
          <div className="text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-mute">
              History
            </p>
            <h2 className="mt-2 text-2xl font-medium tracking-tight text-graphite sm:text-3xl">
              Where it went
            </h2>
          </div>
          <div className="mt-8">
            <Tape entries={entries} />
          </div>
        </section>
      </div>
    </main>
  );
}
