/**
 * The plan catalogue: what each tier is called, what it costs and what it lets
 * you do. Pure data and types, no imports.
 *
 * Split out from lib/billing.ts because both sides of the app need it. The
 * paywall, the locked toggles and the plan panel are client components, and
 * billing.ts reaches for `auth()` and the service-role Supabase client — both
 * server only. Importing one from the other would drag Clerk's server bundle
 * into the browser, which is a build error rather than a style opinion.
 *
 * Prices here are for display and for the moment before Clerk's live plan data
 * arrives. Clerk is what actually charges the card, and lib/paywall.ts prefers
 * its numbers wherever both are available.
 */

export type TierId = "free" | "autopilot" | "studio";

export type Limits = {
  /** Lifetime cap on carousels. Infinity on paid tiers. */
  carousels: number;
  /** Ceiling for `brands.posts_per_day`. 0 means scheduled runs are off. */
  postsPerDay: number;
  /** May turn on scheduled daily generation. */
  autopilot: boolean;
  /** May publish to a connected account, by hand or on a schedule. */
  autoPublish: boolean;
};

export type Tier = {
  id: TierId;
  /**
   * The plan's slug in the Clerk dashboard. `free` has no slug: a user with no
   * paid subscription is on it by definition, so nothing needs to be matched.
   */
  slug: string | null;
  name: string;
  /** One line, outcome first. Used as the plan's subtitle on the paywall. */
  tagline: string;
  /** Monthly price in whole dollars. */
  monthly: number;
  /**
   * The *total* charged once a year, in whole dollars.
   *
   * Note this is not what Clerk's dashboard asks for. That field is the annual
   * *monthly* fee — the effective per-month price when billed yearly, which
   * Clerk multiplies by twelve and rejects if it is not below the monthly
   * price. $24 there is the $288 here.
   */
  annual: number;
  limits: Limits;
  /**
   * What the user gets, written as outcomes rather than features. The research
   * on this is consistent: "365 posts a year, written while you sleep" moves
   * people, "scheduled generation" does not.
   */
  outcomes: string[];
};

/** How many carousels a free account may ever create. */
export const FREE_CAROUSEL_LIMIT = 3;

export const TIERS: Record<TierId, Tier> = {
  free: {
    id: "free",
    slug: null,
    name: "Free",
    tagline: "See what it writes about your niche.",
    monthly: 0,
    annual: 0,
    limits: {
      carousels: FREE_CAROUSEL_LIMIT,
      postsPerDay: 0,
      autopilot: false,
      autoPublish: false,
    },
    outcomes: [
      `${FREE_CAROUSEL_LIMIT} carousels, written and rendered`,
      "Full keyword research on your domain",
      "Download the slides and post them by hand",
    ],
  },
  autopilot: {
    id: "autopilot",
    slug: "autopilot",
    name: "Autopilot",
    tagline: "One carousel a day, posted without you.",
    monthly: 29,
    annual: 288,
    limits: {
      carousels: Infinity,
      postsPerDay: 1,
      autopilot: true,
      autoPublish: true,
    },
    outcomes: [
      "365 carousels a year, written while you sleep",
      "Published to every connected account, on your schedule",
      "Keyword research that refills itself",
      "Edit any slide before it goes out",
    ],
  },
  studio: {
    id: "studio",
    slug: "studio",
    name: "Studio",
    tagline: "Up to five a day, for a real posting cadence.",
    monthly: 79,
    annual: 780,
    limits: {
      carousels: Infinity,
      postsPerDay: 5,
      autopilot: true,
      autoPublish: true,
    },
    outcomes: [
      "Up to 5 carousels a day, 1,825 a year",
      "Everything in Autopilot",
      "Enough volume to test hooks against each other",
    ],
  },
};

/** The tier the paywall leads with. */
export const FEATURED_TIER: TierId = "autopilot";

/** Every paid plan slug, most generous first. */
export const PAID_SLUGS = ["studio", "autopilot"] as const;

/**
 * Picks the most generous tier among the plan slugs a user holds.
 *
 * Both the session path and the cron path funnel through here so they can
 * never disagree about what a slug means.
 */
export const tierFromSlugs = (slugs: readonly string[]): Tier => {
  for (const slug of PAID_SLUGS) {
    if (slugs.includes(slug)) return TIERS[slug];
  }

  return TIERS.free;
};

/** Which door the user walked into. Maps to the paywall's headline. */
export type PaywallReason =
  | "quota"
  | "autopilot"
  | "auto_publish"
  | "publish"
  | "posts_per_day"
  | "general";
