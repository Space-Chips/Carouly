/**
 * What things cost, and what you can buy.
 *
 * Pure data and arithmetic, no imports — both sides of the app need it. The
 * meter in the nav, the cost line on a template card and the buy page are all
 * client components; the ledger that actually moves the numbers is server only.
 * Keeping the price list here is what lets a card say "240 credits" without
 * dragging the service-role Supabase client into the browser.
 *
 * There are no plans any more. Carouly is prepaid: you buy credits, you spend
 * them, and nothing renews behind your back. That decision is the reason this
 * file replaced lib/plans.ts rather than sitting beside it — a tier catalogue
 * and a price list are two answers to the same question, and shipping both is
 * how an app ends up gating the same action twice with different rules.
 */

/**
 * Everything that costs money to run, priced in credits.
 *
 * The unit is chosen so the number a person sees is the number they can reason
 * about: reading a site is single digits, a finished cut is a few hundred. Sub-
 * credit pricing would be more precise and completely unreadable — nobody can
 * hold "0.024 credits" in their head, and the whole point of a credit is to be
 * held in a head.
 *
 * These are the *thinking* costs. Video is priced separately, by the second,
 * because it is the only operation whose cost genuinely scales with what you
 * asked for. See `renderCost`.
 */
export const COSTS = {
  /** One model call with no tool behind it — a question, a correction, a nudge. */
  chat_turn: 1,
  read_site: 2,
  research_site: 4,
  /** The most expensive thing that is not a render: a long synthesis call. */
  build_brand_kit: 8,
  suggest_templates: 2,
  compose_template: 6,
  /**
   * One generated portrait, for somebody casting a person who is not on the
   * shelf. An image rather than a thought, so it costs more than the ranking
   * that produced the shelf — and a fraction of the cut it leads to, which is
   * the ratio that makes seeing the face first worth doing at all.
   */
  cast_actor: 6,
} as const;

export type Operation = keyof typeof COSTS | "make_video" | "carousel";

/**
 * A carousel from the older image pipeline: copy, then a hook image.
 *
 * Cheaper than a cut by an order of magnitude, which is the honest ratio — one
 * still image against twenty seconds of generated footage.
 */
export const CAROUSEL_COST = 12;

/** Credits per second of finished video. */
export const PER_SECOND = 10;

/**
 * Charged once per cut regardless of length: casting, the master frame, and
 * assembling the thing at the end.
 *
 * Split out from the per-second rate rather than folded into it because it is
 * genuinely fixed — a six-second cut and a twenty-four-second cut cast exactly
 * one actor — and because a rate that has to absorb it stops being explainable.
 */
export const RENDER_BASE = 40;

/**
 * What a cut will cost, from the length the template says it produces.
 *
 * Deliberately quoted from `durationRange` rather than measured from the graph.
 * A template's node list looks precise but is not: `foreach` fans out over an
 * array a model writes at runtime, so the node count is unknown until the thing
 * is half rendered — and a quote that can only be given after you have paid is
 * not a quote. Seconds of finished video is the number that actually drives the
 * bill, and it is known before anything runs.
 *
 * The top of the range, not the middle. A person who is quoted 240 and charged
 * 240 has been told the truth; one quoted 200 and charged 240 has been
 * surprised by a bill, and there is no version of that which reads as fair.
 */
export const renderCost = (template?: { durationRange?: [number, number] }) => {
  const seconds = template?.durationRange?.[1] ?? DEFAULT_SECONDS;
  return RENDER_BASE + Math.ceil(seconds) * PER_SECOND;
};

/** Used when a cut is quoted before anyone has chosen a format. */
export const DEFAULT_SECONDS = 20;

/** The quote for an unspecified cut: what the buy page prices packs against. */
export const TYPICAL_RENDER = RENDER_BASE + DEFAULT_SECONDS * PER_SECOND;

/**
 * What a new account is given.
 *
 * Sized against one number: it must not reach `TYPICAL_RENDER`. A first run —
 * read, research, kit, formats — is 16 credits, so this is three of those with
 * room to argue with the agent in between, and still less than a quarter of a
 * cut. That gap is deliberate and load-bearing. The free account is meant to
 * get all the way to the moment of wanting the video, and to arrive there
 * having proved the product works on their own site rather than on a demo.
 */
export const STARTER_GRANT = 50;

// ----------------------------------------------------------------- packs ---

export type Pack = {
  id: string;
  name: string;
  /** What it adds to the balance. */
  credits: number;
  /** Whole dollars, charged once. */
  price: number;
  /**
   * One line on what the pack is for.
   *
   * Deliberately free of arithmetic. The card computes the cut count and the
   * rate per thousand from the numbers above, so a note that also counted cuts
   * would be a second, hand-maintained copy of the same claim — and the two
   * only ever agree until somebody edits a price.
   */
  note: string;
  /**
   * The Stripe price id, read from the environment so the same build works
   * against test and live keys. Absent means the pack cannot be bought yet,
   * which the buy page says out loud rather than failing at checkout.
   */
  priceEnv: string;
};

/**
 * Three packs, and no more.
 *
 * A fourth would have to be either a worse deal than one of these — which is a
 * trap — or a better one, which makes the three above it look like the trap.
 * The ladder only has to answer "trying this", "using this" and "running on
 * this", because those are the only three states anyone is actually in.
 */
export const PACKS: Pack[] = [
  {
    id: "sample",
    name: "Sample",
    credits: 600,
    price: 19,
    note: "Enough to take a couple of formats all the way out.",
    priceEnv: "STRIPE_PRICE_SAMPLE",
  },
  {
    id: "studio",
    name: "Studio",
    credits: 2_000,
    price: 49,
    note: "A month of posting, if you post weekly.",
    priceEnv: "STRIPE_PRICE_STUDIO",
  },
  {
    id: "scale",
    name: "Scale",
    credits: 7_000,
    price: 149,
    note: "Enough to run formats against each other and keep the winner.",
    priceEnv: "STRIPE_PRICE_SCALE",
  },
];

/** The pack the buy page leads with. Not the cheapest and not the biggest. */
export const FEATURED_PACK = "studio";

export const packById = (id: string) => PACKS.find((pack) => pack.id === id);

/**
 * How many cuts a number of credits buys, at the typical length.
 *
 * Rounded down, always. "Around 8 cuts" that turns out to be 7 is the kind of
 * small lie a product only gets to tell once.
 */
export const cutsFor = (credits: number) => Math.floor(credits / TYPICAL_RENDER);

/**
 * Dollars per thousand credits, for the ladder on the buy page.
 *
 * The comparison is between our own packs and nothing else, which is the only
 * comparison this file can stand behind.
 */
export const perThousand = (pack: Pack) =>
  ((pack.price / pack.credits) * 1000).toFixed(2);

/** The best rate on offer, so a pack can be marked against it honestly. */
export const bestRate = Math.min(
  ...PACKS.map((pack) => pack.price / pack.credits)
);

/** How much cheaper this pack is than the smallest one, as a whole percent. */
export const savingAgainstSmallest = (pack: Pack) => {
  const smallest = PACKS[0];
  const rate = pack.price / pack.credits;
  const base = smallest.price / smallest.credits;

  return Math.round((1 - rate / base) * 100);
};

// --------------------------------------------------------------- display ---

/**
 * A balance, grouped.
 *
 * Four figures and up get a separator because 7000 and 700 are one glance
 * apart otherwise, and the difference between them is twenty-eight videos.
 */
export const formatCredits = (credits: number) => credits.toLocaleString("en-US");

/** "1 credit" / "240 credits". */
export const credits = (amount: number) =>
  `${formatCredits(amount)} credit${amount === 1 ? "" : "s"}`;

/**
 * What a person is charged for, in words, for the ledger and the cost table.
 *
 * Written as the thing that happened rather than the tool that did it — nobody
 * spent credits on a `build_brand_kit`, they spent them working out what their
 * brand sounds like.
 */
export const OPERATION_LABEL: Record<Operation, string> = {
  chat_turn: "Thinking",
  read_site: "Reading the site",
  research_site: "Looking around the site",
  build_brand_kit: "Building the brand kit",
  suggest_templates: "Ranking the formats",
  compose_template: "Writing a new format",
  cast_actor: "Casting an actor",
  make_video: "Rendering a cut",
  carousel: "Writing a carousel",
};
