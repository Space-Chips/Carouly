import type { Metadata } from "next";
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
 * The balance stays visible for context, but the packs lead: somebody arriving
 * here from a blocked render already has buying intent. Costs and history remain
 * available below as reassurance, rather than making the person hunt for the
 * action they came to take.
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
  const settled = justBought
    ? account.balance >= justBought.credits
    : false;

  // What they were short of, when they got here from a refusal.
  const need = Number(rawNeed);
  const shortBy =
    Number.isFinite(need) && need > account.balance
      ? need - account.balance
      : 0;

  return (
    /* Paper, like the studio it is reached from. The receipt tape and the
       mono figures are set for a light ground — a statement is a printed thing,
       and every one anybody has ever checked was black on white. */
    <main
      data-surface="paper"
      className="min-h-screen max-w-none bg-paper px-0 pb-24 pt-0 text-graphite"
    >
      <div className="mx-auto w-full max-w-5xl px-5 pt-14">
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

      {/* The balance, at the size of the thing the page is about. */}
      <header className="rise">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ember">
          {copy.eyebrow}
        </p>

        <div className="mt-5 flex flex-wrap items-end gap-x-5 gap-y-2">
          <p className="font-mono text-6xl tabular-nums leading-none tracking-tighter text-graphite sm:text-7xl">
            {formatCredits(account.balance)}
          </p>
          <p className="pb-1 text-sm text-mute">
            credits ·{" "}
            {account.balance >= TYPICAL_RENDER
              ? `about ${cutsFor(account.balance)} cut${
                  cutsFor(account.balance) === 1 ? "" : "s"
                }`
              : "not enough for a cut yet"}
          </p>
        </div>

        {shortBy > 0 ? (
          <p className="pretty mt-4 max-w-2xl text-sm text-graphite">
            You are {formatCredits(shortBy)} short of the{" "}
            {formatCredits(need)} that render needs.
          </p>
        ) : (
          <p className="balance mt-4 max-w-2xl text-lg leading-snug text-graphite">
            {copy.headline}
          </p>
        )}

        <p className="pretty mt-3 max-w-2xl text-sm leading-relaxed text-mute">
          {copy.body}
        </p>
      </header>

      <section aria-labelledby="buy-credits-heading" className="rise stagger-1 mt-10 sm:mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ember">
              Keep creating
            </p>
            <h2 id="buy-credits-heading" className="mt-2 text-2xl font-medium tracking-tight text-graphite sm:text-3xl">
              Choose your credit pack
            </h2>
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mute">
            One-time payment · no expiry
          </p>
        </div>
        <p className="pretty mt-3 max-w-2xl text-sm leading-relaxed text-mute">
          Start with a few cuts or stock up for a full month of posts. You only
          pay for what you use.
        </p>
        <div className="mt-6">
          <Packs packs={packs} ready={checkoutReady()} />
        </div>
      </section>

      <section className="rise stagger-2 mt-16 sm:mt-20">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-mute">
          What things cost
        </h2>
        <div className="mt-5">
          <CostList />
        </div>
      </section>

      <section className="mt-14">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-mute">
          History
        </h2>
        <div className="mt-5">
          <Tape entries={entries} />
        </div>
      </section>
      </div>
    </main>
  );
}
