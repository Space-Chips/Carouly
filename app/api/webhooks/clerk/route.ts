import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextRequest } from "next/server";

import { ensureStarterGrant } from "@/lib/credits/ledger";
import { STARTER_GRANT } from "@/lib/credits/prices";

/**
 * Clerk account webhook.
 *
 * One job now: put the welcome credits on a new account. It used to mirror
 * Clerk Billing into a `subscriptions` table so the cron could tell who was
 * paying — there are no subscriptions any more, so there is nothing to mirror
 * and the table is dropped in supabase_schema.sql.
 *
 * The grant lands here rather than on first sign-in because this fires once,
 * server-side, whatever route the person arrives through — and because an app
 * that hands out credits from a page render will hand them out twice the first
 * time somebody double-clicks. It is idempotent regardless: `ensureStarterGrant`
 * keys on the user id, and Clerk delivers events more than once as a matter of
 * routine.
 *
 * Set the endpoint up at Clerk Dashboard → Webhooks with `user.created`
 * subscribed, and put the signing secret in CLERK_WEBHOOK_SIGNING_SECRET.
 * Locally: `npx clerk@latest webhooks listen --forward-to
 * http://localhost:3000/api/webhooks/clerk`.
 */

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

  if (event.type !== "user.created") {
    // Subscribed to something else in the dashboard — acknowledge and move on,
    // otherwise Clerk retries an event we were never going to act on.
    return Response.json({ ignored: event.type });
  }

  const userId = (event.data as { id?: string })?.id;

  if (!userId) return Response.json({ ignored: "no user id" });

  try {
    const { balance, replayed } = await ensureStarterGrant(userId);

    return Response.json({ ok: true, balance, replayed });
  } catch (error) {
    // 500 so Clerk retries. A dropped grant is a new account that opens the
    // studio, types its address and is told it cannot afford to read a web page
    // — the worst first minute this product could give anybody.
    console.error(
      `[clerk-webhook] could not grant ${STARTER_GRANT} starter credits:`,
      error
    );
    return new Response("Grant failed", { status: 500 });
  }
}
