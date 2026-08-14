import "server-only";

import { packById, type Pack } from "@/lib/credits/prices";

/**
 * Buying a pack.
 *
 * Raw HTTP against Stripe rather than the SDK, for the same reason
 * lib/tools/fal.ts does it: two endpoints and a signature check do not justify
 * a dependency, and the surface stays visible — you can read exactly what is
 * sent and exactly what is trusted coming back.
 *
 * Nothing here decides what anybody owns. Stripe charges the card and the
 * webhook adds the credits; this only builds the session that sends somebody
 * there. That separation is the point: a checkout that granted credits on its
 * success redirect would hand them out to anyone who could guess the URL.
 */

const API = "https://api.stripe.com/v1";

export const stripeKey = () => process.env.STRIPE_SECRET_KEY?.trim();

/** Is checkout wired up at all? The buy page says so rather than 500-ing. */
export const checkoutReady = () => Boolean(stripeKey());

/**
 * The Stripe price for a pack, if one is configured.
 *
 * Prices live in the Stripe dashboard rather than in this repository, so the
 * amount a card is charged can never disagree with the amount displayed by
 * being edited in one place and not the other — the display price is what the
 * catalogue says, and if the two drift the fix is one field in one dashboard.
 */
export const priceIdFor = (pack: Pack) =>
  process.env[pack.priceEnv]?.trim() || undefined;

export const buyablePacks = (packs: Pack[]) =>
  packs.filter((pack) => Boolean(priceIdFor(pack)));

const form = (fields: Record<string, string>) =>
  new URLSearchParams(fields).toString();

/**
 * Create a Checkout Session and return where to send the person.
 *
 * `client_reference_id` and the metadata both carry the user id. The metadata is
 * what the webhook reads; `client_reference_id` is what makes a payment findable
 * in the Stripe dashboard when somebody writes in, which is worth the duplicate.
 */
export const createCheckout = async ({
  packId,
  userId,
  origin,
}: {
  packId: string;
  userId: string;
  origin: string;
}): Promise<string> => {
  const key = stripeKey();
  if (!key) throw new Error("Checkout is not configured.");

  const pack = packById(packId);
  if (!pack) throw new Error("No such pack.");

  const price = priceIdFor(pack);
  if (!price) {
    throw new Error(
      `The ${pack.name} pack has no Stripe price configured. Set ${pack.priceEnv}.`
    );
  }

  const response = await fetch(`${API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // Stripe replays a repeated key rather than charging twice, which covers
      // the double-click on the buy button.
      "Idempotency-Key": `checkout:${userId}:${packId}:${Math.floor(
        Date.now() / 60_000
      )}`,
    },
    body: form({
      mode: "payment",
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      client_reference_id: userId,
      "metadata[user_id]": userId,
      "metadata[pack_id]": pack.id,
      // The authority on how many credits to add. Read from here rather than
      // looked up by pack id at webhook time, so a pack whose size changes next
      // month still pays out what was actually bought today.
      "metadata[credits]": String(pack.credits),
      success_url: `${origin}/credits?bought=${pack.id}`,
      cancel_url: `${origin}/credits`,
    }),
  });

  const body = (await response.json()) as {
    url?: string;
    error?: { message?: string };
  };

  if (!response.ok || !body.url) {
    throw new Error(
      body.error?.message ?? `Stripe would not open a checkout (${response.status}).`
    );
  }

  return body.url;
};
