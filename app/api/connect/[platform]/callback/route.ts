import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { saveOAuthConnection } from "@/lib/actions/connection.actions";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  exchangeCode,
  getProvider,
  redirectUriFor,
  verifyState,
} from "@/lib/social";
import { Platform } from "@/types";

/**
 * Step two of one-click connect: turn the authorisation code into a stored,
 * long-lived connection and drop the user back in Settings.
 *
 * The user never sees this page — every branch redirects, carrying either the
 * connected handle or a message explaining what went wrong.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Platform OAuth errors are written for whoever built the app, not for the
 * person who just pressed a button. The handful that users actually hit get
 * translated into the next thing to do; anything else is passed through so a
 * real problem is never hidden behind a friendly guess.
 */
const explain = (platform: Platform, error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);

  if (platform === "instagram") {
    if (/business|professional|creator|not.*eligible/i.test(raw)) {
      return "Instagram only allows posting from a Business or Creator account. Open Instagram → Settings → Account type, switch to Creator (it is free and reversible), then connect again.";
    }
    if (/redirect|uri/i.test(raw)) {
      return `Instagram rejected the redirect URL. Add ${
        process.env.NEXT_PUBLIC_APP_URL ?? "your app URL"
      }/api/connect/instagram/callback to the app's valid OAuth redirect URIs.`;
    }
  }

  if (platform === "tiktok" && /scope|unauthorized_client/i.test(raw)) {
    return "TikTok did not grant posting access. The app needs the Content Posting API product enabled in the TikTok developer portal.";
  }

  if (platform === "x" && /403|forbidden|access|tier/i.test(raw)) {
    return "X accepted the login but refused the API call. Posting images requires a paid X API tier on the developer app.";
  }

  return raw || `${platform} refused the connection.`;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const platform = (await params).platform as Platform;

  const back = (result: Record<string, string>) => {
    const url = new URL("/settings", request.url);
    Object.entries(result).forEach(([key, value]) =>
      url.searchParams.set(key, value)
    );

    const response = NextResponse.redirect(url);
    response.cookies.delete(OAUTH_STATE_COOKIE);
    response.cookies.delete(OAUTH_VERIFIER_COOKIE);
    return response;
  };

  const { userId } = await auth();

  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (!getProvider(platform)) {
    return back({ connect_error: `Unknown platform "${platform}".` });
  }

  const query = request.nextUrl.searchParams;

  // The user pressed Cancel, or the platform refused the request.
  if (query.get("error")) {
    const description =
      query.get("error_description") ??
      query.get("error_message") ??
      query.get("error_reason") ??
      query.get("error");

    // Cancelling is a decision, not a failure — say so plainly.
    if (/denied|cancel/i.test(description ?? "")) {
      return back({ connect_error: `Connection cancelled — nothing was changed.` });
    }

    return back({ connect_error: explain(platform, new Error(description ?? "")) });
  }

  const check = verifyState(
    query.get("state"),
    platform,
    request.cookies.get(OAUTH_STATE_COOKIE)?.value,
    userId
  );

  if (!check.ok) return back({ connect_error: check.reason });

  const code = query.get("code");

  if (!code) return back({ connect_error: `${platform} returned no authorisation code.` });

  try {
    const account = await exchangeCode(
      platform,
      // Instagram appends "#_" to the code, which its own token endpoint
      // rejects; TikTok's codes are already decoded by searchParams.
      code.replace(/#_$/, ""),
      redirectUriFor(platform, request.url),
      request.cookies.get(OAUTH_VERIFIER_COOKIE)?.value
    );

    await saveOAuthConnection(platform, account);

    return back({ connected: account.handle ? `@${account.handle}` : account.label });
  } catch (error) {
    console.error(`[connect/${platform}]`, error);

    return back({ connect_error: explain(platform, error) });
  }
}
