import { createHmac, timingSafeEqual } from "node:crypto";

import { grant } from "@/lib/credits/ledger";

/**
 * Stripe webhook. The only thing in this app that adds bought credits.
 *
 * Not the success redirect, deliberately. A redirect is a URL a person's browser
 * requests, which means anybody who can type it can request it too — granting
 * credits there is a shop that hands over the goods to whoever walks past the
 * till. This endpoint is the one Stripe signs.
 *
 * Set it up at Stripe Dashboard → Developers → Webhooks with
 * `checkout.session.completed` subscribed, and put the signing secret in
 * STRIPE_WEBHOOK_SECRET. Locally: `stripe listen --forward-to
 * localhost:3000/api/webhooks/stripe`.
 */

export const runtime = "nodejs";

/**
 * How far out of step a delivery may be before it is treated as a replay.
 *
 * Stripe's own recommendation. The signature alone proves the payload came from
 * Stripe; the timestamp is what stops a captured request from being replayed at
 * anybody's convenience a week later.
 */
const TOLERANCE_SECONDS = 300;

/**
 * Verify the `Stripe-Signature` header against the raw body.
 *
 * The raw body, not the parsed one — the signature covers the exact bytes, and
 * a round trip through `JSON.parse` and `JSON.stringify` reorders keys and
 * silently invalidates every signature. That is why this route reads
 * `request.text()` and parses afterwards.
 */
const verify = (payload: string, header: string | null, secret: string) => {
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key.trim(), rest.join("=")];
    })
  ) as { t?: string; v1?: string };

  if (!parts.t || !parts.v1) return false;

  const age = Math.abs(Date.now() / 1000 - Number(parts.t));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${parts.t}.${payload}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(parts.v1, "utf8");

  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false, and a thrown comparison is a 500 where a 400 belongs.
  return a.length === b.length && timingSafeEqual(a, b);
};

type Session = {
  id?: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  metadata?: { user_id?: string; pack_id?: string; credits?: string };
};

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!secret) {
    console.error("[stripe] STRIPE_WEBHOOK_SECRET is not set.");
    return new Response("Not configured", { status: 500 });
  }

  const payload = await request.text();

  if (!verify(payload, request.headers.get("stripe-signature"), secret)) {
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(payload) as {
    id: string;
    type: string;
    data: { object: Session };
  };

  if (event.type !== "checkout.session.completed") {
    return Response.json({ ignored: event.type });
  }

  const session = event.data.object;

  // A session can complete unpaid — an async method still clearing, or one that
  // failed after the page was left. Credits follow the money, not the redirect.
  if (session.payment_status !== "paid") {
    return Response.json({ ignored: "not paid", status: session.payment_status });
  }

  const userId = session.metadata?.user_id;
  const amount = Number(session.metadata?.credits ?? 0);

  if (!userId || !Number.isFinite(amount) || amount <= 0) {
    // Nothing to act on, and retrying will not fix a session with no metadata.
    console.error("[stripe] a paid session carried no credit metadata:", session.id);
    return Response.json({ ignored: "no credit metadata" });
  }

  try {
    const { balance, replayed } = await grant({
      userId,
      amount,
      kind: "purchase",
      detail: session.metadata?.pack_id
        ? `${session.metadata.pack_id} pack`
        : "Credit purchase",
      // The event id, not the session id. Stripe redelivers the same event on
      // any non-2xx, and this is what makes the fifth delivery of a successful
      // payment add nothing.
      key: `stripe:${event.id}`,
    });

    return Response.json({ ok: true, balance, replayed });
  } catch (error) {
    // 500 so Stripe retries. This is the one failure in the system where the
    // customer has already paid — it must never be swallowed with a 200.
    console.error("[stripe] paid but not credited:", error);
    return new Response("Grant failed", { status: 500 });
  }
}
