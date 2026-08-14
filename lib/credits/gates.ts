/**
 * What the app says when the balance will not cover the next thing.
 *
 * One gate, several doors. A credit system has exactly one refusal — there are
 * not enough credits — but the sentence that lands depends on what the person
 * was reaching for when it happened, so the operation picks the copy.
 *
 * Every line here is written for someone who has already seen the product work
 * on their own site. That is the whole shape of the free tier: the starter
 * grant covers reading, researching and the kit several times over and stops
 * short of a render, so by the time anybody reads one of these sentences they
 * are looking at their own brand on their own screen. None of this copy has to
 * argue that the thing works. It only has to name what is left.
 *
 * No Clerk import and no "use server", so the studio card, the buy page and the
 * server actions can all read it.
 */

import { credits, TYPICAL_RENDER } from "@/lib/credits/prices";

/** Which door the person walked through. Picks the headline. */
export type CreditGate =
  /**
   * They asked for a cut.
   *
   * The expensive one, and the only one anybody hits on purpose. Everything up
   * to it — the site read, the kit built, the ideas written, the formats ranked
   * — is a few credits and is already on their screen when this fires.
   */
  | "render"
  /** The run itself ran dry: mid-turn, with tools left to call. */
  | "run"
  /** A carousel from the older image pipeline. */
  | "carousel"
  /** Scheduled generation found an empty balance overnight. */
  | "autopilot"
  /** They came to the buy page by themselves. */
  | "general";

export type GateCopy = {
  /** Small line above the headline. Names the moment, never sells. */
  eyebrow: string;
  /** The promise, in the person's own terms. */
  headline: string;
  /** One or two sentences: what happens if they say yes. */
  body: string;
  /** Names the action rather than saying "Continue". */
  cta: string;
};

export const GATE_COPY: Record<CreditGate, GateCopy> = {
  render: {
    eyebrow: "Ready to shoot",
    headline: "The script and the shot list are yours. The cut is what costs.",
    body: `Everything above ran on a handful of credits. A finished cut is about ${credits(
      TYPICAL_RENDER
    )} — roughly ten a second, plus the casting — and it comes back with dialogue, captions and a cover frame.`,
    cta: "Buy credits",
  },
  run: {
    eyebrow: "Out of credits",
    headline: "The run stopped where your balance did.",
    body: "Nothing was lost. Everything it worked out is still on screen, and it picks up from there the moment there are credits to carry on with.",
    cta: "Top up",
  },
  carousel: {
    eyebrow: "Out of credits",
    headline: "The words are cheap. The pictures are the part that costs.",
    body: "A carousel is a fraction of what a cut costs, so the smallest pack is a lot of them.",
    cta: "Buy credits",
  },
  autopilot: {
    eyebrow: "Autopilot paused",
    headline: "It stopped rather than spending credits you had not bought.",
    body: "Nothing is off and nothing is lost — the schedule is still set. It starts again on the next run after a top-up.",
    cta: "Top up",
  },
  general: {
    eyebrow: "Credits",
    headline: "Buy once, spend it when you use it.",
    body: "No plan, no renewal, no seat count. Credits come off the balance as work happens, and what you do not spend stays yours.",
    cta: "Buy credits",
  },
};

/** Narrows an arbitrary query param to a gate. */
export const toGate = (value: string | undefined): CreditGate =>
  value && value in GATE_COPY ? (value as CreditGate) : "general";

/**
 * The shortfall, said plainly.
 *
 * Both numbers, always. "Not enough credits" makes a person go and look up
 * their balance to find out how far off they are, and the answer to that is
 * either "top up" or "top up" — so it may as well be on the card.
 */
export const shortfall = (need: number, have: number) =>
  `This needs ${credits(need)} and you have ${credits(have)}.`;
