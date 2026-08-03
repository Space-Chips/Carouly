import { PaywallReason, TIERS } from "@/lib/plans";

/**
 * What the paywall says, keyed by the door the user walked through.
 *
 * A paywall that names the thing someone just reached for converts better than
 * a generic one — the user is already holding the intent, and restating it is
 * cheaper than rebuilding it. So every gate throws an UpgradeRequiredError
 * carrying its reason, and the reason picks the headline here.
 *
 * Kept free of "use server" and of any Clerk import so both the server page and
 * the client paywall can read it.
 */

export type PaywallCopy = {
  /** Small line above the headline. Sets context, never sells. */
  eyebrow: string;
  /** The promise, in the user's own terms. Outcome first. */
  headline: string;
  /** One or two sentences: what happens if they say yes. */
  body: string;
  /** Names the action rather than saying "Continue". */
  cta: string;
};

export const PAYWALL_COPY: Record<PaywallReason, PaywallCopy> = {
  quota: {
    eyebrow: "Free carousels used",
    headline: "Your first three are written. The next 362 are the point.",
    body: `You have seen what it writes about your domain. ${TIERS.autopilot.name} keeps it going every day without you opening the app.`,
    cta: "Start my free trial",
  },
  autopilot: {
    eyebrow: "Autopilot",
    headline: "Tonight's carousel, written while you sleep.",
    body: "Turn it on and the queue runs itself: it picks tomorrow's keyword, writes the slides, renders the PNGs and has them waiting at your posting hour.",
    cta: "Turn on autopilot",
  },
  auto_publish: {
    eyebrow: "Auto publish",
    headline: "Straight to your accounts, no approval step.",
    body: "Everything is still yours to edit. Auto publish just stops you having to be there at 9am for it to go out.",
    cta: "Start my free trial",
  },
  publish: {
    eyebrow: "Publishing",
    headline: "One click, every connected account.",
    body: "Your slides are yours to download on any plan. Posting them for you is what a plan buys.",
    cta: "Start my free trial",
  },
  posts_per_day: {
    eyebrow: "Volume",
    headline: "More than one a day.",
    body: `Studio writes up to ${TIERS.studio.limits.postsPerDay} carousels a day, which is enough to run two hooks against each other and keep the winner.`,
    cta: "Move to Studio",
  },
  general: {
    eyebrow: "Your plan",
    headline: "Everything you set up, running on its own.",
    body: "The brand, the domain and the keyword bank are already in place. A plan is what turns them into a post every day.",
    cta: "Start my free trial",
  },
};

/** Narrows an arbitrary query param to a reason. */
export const toReason = (value: string | undefined): PaywallReason =>
  value && value in PAYWALL_COPY ? (value as PaywallReason) : "general";

/**
 * Annual pricing, expressed the three ways people check it.
 *
 * All of it is arithmetic on the plan's own two prices — no comparison to what
 * anything else costs, because that would be a claim about the world that this
 * file cannot stand behind.
 */
export const annualMath = (monthly: number, annual: number) => {
  const saved = monthly * 12 - annual;

  return {
    saved,
    /** Whole months of the monthly price that the annual price covers. */
    monthsFree: Math.round(saved / monthly),
    percentOff: Math.round((saved / (monthly * 12)) * 100),
    /** Rounded to the cent, the way it will be read aloud. */
    perDay: (annual / 365).toFixed(2),
    /** Annual price divided by a year of daily carousels. */
    perCarousel: (annual / 365).toFixed(2),
  };
};
