import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase";

/**
 * Clerk Billing webhook.
 *
 * Its only job is to keep `public.subscriptions` in step with Clerk so the
 * daily cron — which runs with no session token, and therefore cannot read a
 * plan claim — knows who is still paying. Every interactive request answers
 * that question from the session instead and never reads this table.
 *
 * Set the endpoint up at Clerk Dashboard → Webhooks with the `subscription.*`
 * events subscribed, and put the signing secret in CLERK_WEBHOOK_SIGNING_SECRET.
 * Locally: `npx clerk@latest webhooks listen --forward-to
 * http://localhost:3000/api/webhooks/clerk`.
 */

/** Statuses we mirror. Anything else is stored as-is and treated as unpaid. */
const KNOWN_STATUSES = ["active", "past_due", "ended", "upcoming"] as const;

type SubscriptionItem = {
  plan?: { slug?: string | null } | null;
  plan_period?: string | null;
  status?: string | null;
  period_end?: number | null;
  is_free_trial?: boolean | null;
};

type SubscriptionData = {
  id?: string;
  payer?: { user_id?: string | null; organization_id?: string | null } | null;
  items?: SubscriptionItem[] | null;
};

/**
 * Picks the item that decides what the user can do today.
 *
 * A Clerk subscription can hold several items at once — the plan someone is on
 * now plus the one starting at their next renewal, and the free default plan
 * alongside a paid one. The item that matters is the active paid one, so
 * `upcoming` and the slug-less default are both skipped. `past_due` counts:
 * Stripe is still retrying the card and the user has not left.
 */
const currentItem = (items: SubscriptionItem[]): SubscriptionItem | null => {
  const paid = items.filter((item) => Boolean(item?.plan?.slug));

  return (
    paid.find((item) => item.status === "active") ??
    paid.find((item) => item.status === "past_due") ??
    null
  );
};

/**
 * Clerk sends epoch milliseconds, but this is a beta payload and the cost of
 * being wrong is a renewal date rendered in 1970. Anything too small to be a
 * plausible millisecond timestamp is read as seconds instead.
 */
const toIso = (epoch: number | null | undefined): string | null => {
  if (!epoch) return null;

  const ms = epoch < 1e11 ? epoch * 1000 : epoch;
  const date = new Date(ms);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export async function POST(request: NextRequest) {
  let event;

  try {
    event = await verifyWebhook(request);
  } catch (error) {
    // A failure here is either a misconfigured signing secret or someone
    // POSTing at the endpoint. Neither should be retried by Clerk.
    console.error("[clerk-webhook] signature verification failed:", error);
    return new Response("Invalid signature", { status: 400 });
  }

  if (!event.type.startsWith("subscription.")) {
    // Subscribed to something else in the dashboard — acknowledge and move on,
    // otherwise Clerk retries an event we were never going to act on.
    return Response.json({ ignored: event.type });
  }

  const data = event.data as SubscriptionData;
  const userId = data.payer?.user_id;

  if (!userId) {
    // Organization subscriptions land here too. This app bills individuals, so
    // there is nothing to mirror — but it is a 200, not an error.
    return Response.json({ ignored: "no user payer" });
  }

  const item = currentItem(data.items ?? []);
  const status = item?.status;

  const { error } = await createSupabaseAdminClient()
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        clerk_id: data.id ?? null,
        // Null when nothing paid is live: the row stays behind as a record
        // that this user once subscribed, which is what a win-back offer keys
        // off later.
        plan_slug: item?.plan?.slug ?? null,
        plan_period:
          item?.plan_period === "month" || item?.plan_period === "annual"
            ? item.plan_period
            : null,
        status:
          status && (KNOWN_STATUSES as readonly string[]).includes(status)
            ? status
            : null,
        is_free_trial: Boolean(item?.is_free_trial),
        current_period_end: toIso(item?.period_end),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    // 500 so Clerk retries. Dropping this silently would leave a paying user
    // locked out of autopilot with nothing in the logs to explain it.
    console.error("[clerk-webhook] could not mirror subscription:", error.message);
    return new Response("Mirror write failed", { status: 500 });
  }

  return Response.json({ ok: true });
}
