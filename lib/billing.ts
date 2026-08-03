import "server-only";

import { auth } from "@clerk/nextjs/server";

import { PAID_SLUGS, PaywallReason, Tier, TIERS, tierFromSlugs } from "@/lib/plans";
import { createSupabaseAdminClient } from "@/lib/supabase";

/**
 * Who is allowed to do what, resolved on the server.
 *
 * Clerk Billing owns the money: plans, prices and trials are configured in the
 * Clerk dashboard, Stripe processes the card, and the plan a user is on rides
 * in their session token. That means the interactive path never touches the
 * database to answer "can they do this" — `has({ plan })` is a claim read.
 *
 * The cron has no session, so it cannot use `has()`. For that path the Clerk
 * billing webhook mirrors each user's subscription into `public.subscriptions`
 * and the cron reads that. Both paths resolve through `tierFromSlugs` so they
 * can never disagree about what a slug means.
 *
 * The plan catalogue itself lives in lib/plans.ts, which client components can
 * import. This file is server only and marked as such: pulling `auth()` into a
 * browser bundle is a build error, and the explicit import says why.
 */

export type { Limits, PaywallReason, Tier, TierId } from "@/lib/plans";
export { FREE_CAROUSEL_LIMIT, TIERS, tierFromSlugs } from "@/lib/plans";

export type Entitlement = {
  tier: Tier;
  isPaid: boolean;
};

/**
 * The signed-in user's tier, read from the session token.
 *
 * `has({ plan })` is true during a free trial as well as a paid subscription,
 * which is exactly the gate we want: a trialling user has full access. Whether
 * they are *in* a trial is a presentation question — the settings panel asks
 * Clerk directly for that.
 */
export const getEntitlement = async (): Promise<Entitlement> => {
  const { userId, has } = await auth();

  if (!userId) return { tier: TIERS.free, isPaid: false };

  const held = PAID_SLUGS.filter((slug) => has({ plan: slug }));
  const tier = tierFromSlugs(held);

  return { tier, isPaid: tier.id !== "free" };
};

// ---------------------------------------------------------------- mirror ---

/**
 * The webhook-maintained copy of a user's subscription.
 *
 * This exists for one reason: background jobs have no session token to read a
 * plan from. It is a cache of Clerk's state, never the source of truth for an
 * interactive request.
 */
export type SubscriptionRecord = {
  user_id: string;
  plan_slug: string | null;
  plan_period: "month" | "annual" | null;
  status: "active" | "past_due" | "ended" | "upcoming" | null;
  is_free_trial: boolean;
  current_period_end: string | null;
  updated_at: string;
};

/** Reads the mirrored row for a user. Null when they have never subscribed. */
export const getSubscription = async (
  userId: string
): Promise<SubscriptionRecord | null> => {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  // A missing mirror must not take the cron down: an unreadable row is treated
  // the same as no subscription, which fails closed rather than giving away
  // paid generation.
  if (error) {
    console.error("[billing] could not read subscription mirror:", error.message);
    return null;
  }

  return (data as SubscriptionRecord | null) ?? null;
};

/**
 * Session-less entitlement, for the cron.
 *
 * `upcoming` is deliberately not entitling — it is the row Clerk writes for a
 * plan change that starts at the next renewal, so honouring it would hand out
 * the new tier early. `past_due` still entitles: Stripe retries a failed card
 * for days, and cutting someone off mid-dunning is how you lose a customer who
 * was only ever going to update their card.
 */
export const entitlementForUser = async (
  userId: string
): Promise<Entitlement> => {
  const record = await getSubscription(userId);

  if (!record?.plan_slug) return { tier: TIERS.free, isPaid: false };
  if (record.status !== "active" && record.status !== "past_due") {
    return { tier: TIERS.free, isPaid: false };
  }

  const tier = tierFromSlugs([record.plan_slug]);

  return { tier, isPaid: tier.id !== "free" };
};

// ----------------------------------------------------------------- quota ---

export type Quota = {
  tier: Tier;
  used: number;
  /** Infinity on paid tiers. */
  limit: number;
  remaining: number;
  exhausted: boolean;
};

/**
 * How much of the free allowance is gone.
 *
 * Counted from the carousels table rather than a counter column so it stays
 * correct when rows are deleted — someone who deletes a draft gets that
 * attempt back, which is the reading a user would expect.
 */
export const getQuota = async (userId: string): Promise<Quota> => {
  const { tier } = await getEntitlement();

  if (tier.limits.carousels === Infinity) {
    return {
      tier,
      used: 0,
      limit: Infinity,
      remaining: Infinity,
      exhausted: false,
    };
  }

  const supabase = createSupabaseAdminClient();

  const { count, error } = await supabase
    .from("carousels")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  const used = count ?? 0;
  const limit = tier.limits.carousels;

  return {
    tier,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    exhausted: used >= limit,
  };
};

/**
 * Thrown when an action needs a plan the caller does not have.
 *
 * Carries the reason so the UI can open the *right* paywall — a paywall naming
 * the thing the user just reached for converts better than a generic one.
 */
export class UpgradeRequiredError extends Error {
  readonly reason: PaywallReason;

  constructor(reason: PaywallReason, message: string) {
    super(message);
    this.name = "UpgradeRequiredError";
    this.reason = reason;
  }
}

export const isUpgradeRequired = (error: unknown): error is UpgradeRequiredError =>
  error instanceof UpgradeRequiredError ||
  (error instanceof Error && error.name === "UpgradeRequiredError");

/** Guard for the generate actions. Throws when the free allowance is spent. */
export const assertCanGenerate = async (userId: string): Promise<void> => {
  const quota = await getQuota(userId);

  if (!quota.exhausted) return;

  throw new UpgradeRequiredError(
    "quota",
    `You have used all ${quota.limit} free carousels. Start a free trial to keep writing.`
  );
};
