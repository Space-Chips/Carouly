import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { getBrand } from "@/lib/actions/brand.actions";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  buildAuthorizeUrl,
  createPkce,
  createState,
  getProvider,
  redirectUriFor,
} from "@/lib/social";
import { Platform } from "@/types";

/**
 * Step one of one-click connect: sign the user straight over to the platform.
 *
 * Everything the handshake needs is derived here — no form, no fields, no
 * copy-pasting. Failures redirect back to Settings with a readable message
 * rather than rendering an error page in the middle of a flow.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const settings = (request: NextRequest, params: Record<string, string>) => {
  const url = new URL("/settings", request.url);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return NextResponse.redirect(url);
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const platform = (await params).platform as Platform;
  const provider = getProvider(platform);

  if (!provider) {
    return settings(request, {
      connect_error: `${platform} cannot be connected in one click.`,
    });
  }

  // The callback writes a connection against the brand, so a missing brand
  // has to be caught before the user is sent to Instagram, not after.
  const brand = await getBrand();

  if (!brand) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  let authorizeUrl: string;
  const { state, nonce } = createState(platform, userId);
  const pkce = provider.pkce ? createPkce() : null;

  try {
    authorizeUrl = buildAuthorizeUrl(
      platform,
      redirectUriFor(platform, request.url),
      state,
      pkce?.challenge
    );
  } catch (error) {
    return settings(request, {
      connect_error: error instanceof Error ? error.message : String(error),
    });
  }

  const response = NextResponse.redirect(authorizeUrl);

  const cookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };

  // Pairs with the signed state: a stolen state parameter is useless without
  // the matching cookie. `lax` still arrives on the top-level redirect back.
  response.cookies.set(OAUTH_STATE_COOKIE, nonce, cookie);

  if (pkce) response.cookies.set(OAUTH_VERIFIER_COOKIE, pkce.verifier, cookie);

  return response;
}
