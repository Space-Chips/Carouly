"use server";

import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";

import { createCheckout } from "@/lib/credits/checkout";

/**
 * Open a checkout for a pack.
 *
 * Returns the URL instead of redirecting, so the client can keep its button in
 * a pending state until the browser actually leaves — a `redirect()` from a
 * server action unmounts the component mid-transition and the button snaps back
 * to "Buy" for the half second before navigation, which reads as a failure.
 */
export const startCheckout = async (packId: string): Promise<string> => {
  const { userId } = await auth();
  if (!userId) throw new Error("Sign in first.");

  /**
   * The origin, taken from the request rather than an environment variable.
   *
   * Preview deployments each have their own hostname, and a success URL
   * hard-coded to production would send somebody who bought credits on a
   * preview branch to a different deployment to look for them.
   */
  const heads = await headers();
  const host = heads.get("x-forwarded-host") ?? heads.get("host");
  const proto = heads.get("x-forwarded-proto") ?? "https";
  const origin = host
    ? `${proto}://${host}`
    : (process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
      "http://localhost:3000");

  return createCheckout({ packId, userId, origin });
};
