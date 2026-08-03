import {
  Adapter,
  InstagramCredentials,
  OAuthAccount,
  composeCaption,
  postForm,
  readJson,
} from "./types";

/** Where tokens pasted by hand (from a Facebook app) are used. */
const FACEBOOK_GRAPH = "https://graph.facebook.com/v21.0";

/** Where Instagram Login tokens are used — no Facebook Page involved. */
const INSTAGRAM_GRAPH = "https://graph.instagram.com/v23.0";

/**
 * The authorisation screen Instagram shows when it is reached from inside its
 * own onboarding wrapper. The plain `/oauth/authorize` path is the same screen
 * without the wrapper, kept behind an escape hatch below.
 */
const AUTHORIZE = "https://www.instagram.com/oauth/authorize/third_party/";
const AUTHORIZE_PLAIN = "https://www.instagram.com/oauth/authorize";

/**
 * Instagram's own "switch to a professional account" flow. Sending the user
 * here first is what removes the single biggest reason connecting fails:
 * `instagram_business_*` scopes are only grantable by a Business or Creator
 * account, and a personal account otherwise hits a dead-end error screen with
 * no explanation and no way forward.
 *
 * Instagram runs the conversion (a few taps, free) and then forwards to
 * `redirect_uri` — the real authorize URL — so a personal account and a
 * business account both end at the same consent screen.
 */
const CONVERT = "https://www.instagram.com/accounts/convert_to_professional_account/";

const TOKEN = "https://api.instagram.com/oauth/access_token";

/** The name shown on Instagram's screens. Defaults to something honest. */
const displayName = () =>
  process.env.INSTAGRAM_APP_DISPLAY_NAME?.trim() ||
  process.env.NEXT_PUBLIC_APP_NAME?.trim() ||
  "Carousel Studio";

/**
 * "Instagram API with Instagram Login" — the flow that makes connecting one
 * click. The older path (Facebook Login → pick a Page → pick the linked IG
 * account) needs a Facebook Page and three extra screens; this one asks the
 * user for their Instagram login and nothing else.
 *
 * Requires an Instagram *Business* or *Creator* account, which is a free
 * toggle inside the Instagram app.
 */
const SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
];

/**
 * Short-lived tokens live one hour, which would make every connection break
 * before the first scheduled post. Trading up to a long-lived token (60 days)
 * is part of connecting, not an afterthought.
 */
const exchangeForLongLived = async (
  clientSecret: string,
  shortLivedToken: string
) => {
  const url = new URL(`https://graph.instagram.com/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("access_token", shortLivedToken);

  const data = await readJson(
    await fetch(url, { cache: "no-store" }),
    "Instagram long-lived token exchange"
  );

  return {
    accessToken: data.access_token as string,
    expiresIn: Number(data.expires_in) || 0,
  };
};

const fetchProfile = async (accessToken: string) => {
  const url = new URL(`${INSTAGRAM_GRAPH}/me`);
  // Only fields that are actually used: Graph rejects the whole request over
  // one unrecognised field name, which would fail the connect.
  url.searchParams.set("fields", "user_id,username,name,profile_picture_url");
  url.searchParams.set("access_token", accessToken);

  return readJson(await fetch(url, { cache: "no-store" }), "Instagram profile");
};

const toAccount = async (
  accessToken: string,
  expiresIn: number,
  scopes: string[]
): Promise<OAuthAccount<InstagramCredentials>> => {
  const profile = await fetchProfile(accessToken);

  // `user_id` on /me is the id publishing endpoints expect; `id` is the
  // app-scoped one and is rejected by /media.
  const igUserId = String(profile.user_id ?? profile.id ?? "");

  if (!igUserId) {
    throw new Error("Instagram did not return an account id for this login.");
  }

  return {
    credentials: { igUserId, accessToken, apiBase: INSTAGRAM_GRAPH },
    externalId: igUserId,
    label: profile.name || profile.username || "Instagram",
    handle: profile.username,
    avatarUrl: profile.profile_picture_url,
    scopes,
    expiresAt: expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : undefined,
  };
};

/**
 * Instagram carousel publishing (Graph API).
 *
 * Three steps: a container per image, one carousel container, then publish.
 * Instagram fetches each image_url itself — which is why slide PNGs live in a
 * public bucket.
 */
export const instagram: Adapter<InstagramCredentials> = {
  platform: "instagram",
  label: "Instagram",
  docsUrl:
    "https://developers.facebook.com/docs/instagram-platform/content-publishing",

  // Paste-a-token fallback, kept for the Facebook-app path and for anyone who
  // has not registered an Instagram app yet. The UI only offers it when
  // INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET are missing.
  fields: [
    {
      key: "igUserId",
      label: "Instagram Business account ID",
      hint: "Numeric ID from the Graph API, not your @handle",
    },
    { key: "accessToken", label: "Long-lived access token", secret: true },
  ],

  oauth: {
    env: { clientId: "INSTAGRAM_APP_ID", clientSecret: "INSTAGRAM_APP_SECRET" },
    setupUrl: "https://developers.facebook.com/apps",
    summary: "Sign in to Instagram and allow posting — nothing to copy or paste.",
    requirement:
      "A personal account is fine: Instagram offers the free switch to a Creator account during the flow.",
    // Long-lived tokens last 60 days; refresh with a week to spare.
    refreshLeadMs: 7 * 24 * 60 * 60 * 1000,

    /**
     * Two nested URLs: Instagram's professional-account onboarding on the
     * outside, the consent screen it forwards to on the inside.
     *
     * `enable_fb_login=0` is what keeps this to one screen — with it on,
     * Instagram routes through Facebook Login, which asks the user to pick a
     * Page and a linked account. `force_reauth=0` lets an already-signed-in
     * browser skip the password.
     */
    authorizeUrl: ({ keys, redirectUri, state }) => {
      const skipConversion = process.env.INSTAGRAM_SKIP_PRO_CONVERSION === "1";

      const consent = new URL(skipConversion ? AUTHORIZE_PLAIN : AUTHORIZE);
      consent.searchParams.set("client_id", keys.clientId);
      consent.searchParams.set("redirect_uri", redirectUri);
      consent.searchParams.set("response_type", "code");
      consent.searchParams.set("scope", SCOPES.join(","));
      consent.searchParams.set("state", state);
      consent.searchParams.set("enable_fb_login", "0");
      consent.searchParams.set("force_reauth", "0");

      if (skipConversion) return consent.toString();

      // Built by hand rather than with URLSearchParams: that encodes spaces
      // as "+", and Instagram prints the display name verbatim, plus signs
      // and all. `show_business_login_info_screen` adds the screen explaining,
      // in Instagram's own words, what a professional account is and that it
      // stays free.
      return (
        `${CONVERT}?app_display_name=${encodeURIComponent(displayName())}` +
        `&redirect_uri=${encodeURIComponent(consent.toString())}` +
        `&show_business_login_info_screen=1`
      );
    },

    async exchange({ keys, code, redirectUri }) {
      const short = await postForm(
        TOKEN,
        {
          client_id: keys.clientId,
          client_secret: keys.clientSecret,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
        },
        "Instagram token exchange"
      );

      // Older API versions wrap the result in a single-element `data` array.
      const result = Array.isArray(short?.data) ? short.data[0] : short;
      const shortLived = result?.access_token as string | undefined;

      if (!shortLived) {
        throw new Error("Instagram returned no access token.");
      }

      const granted: string[] = Array.isArray(result?.permissions)
        ? result.permissions
        : String(result?.permissions ?? "")
            .split(",")
            .filter(Boolean);

      const { accessToken, expiresIn } = await exchangeForLongLived(
        keys.clientSecret,
        shortLived
      );

      return toAccount(accessToken, expiresIn, granted.length ? granted : SCOPES);
    },

    /**
     * Instagram has no refresh token: the live token is exchanged for a new
     * 60-day one. It only works while the current token is still valid, which
     * is why refreshing runs a week early rather than on expiry.
     */
    async refresh({ credentials }) {
      if (!credentials.apiBase?.includes("graph.instagram.com")) {
        // A hand-pasted Facebook-app token — nothing here can refresh it.
        return null;
      }

      const url = new URL("https://graph.instagram.com/refresh_access_token");
      url.searchParams.set("grant_type", "ig_refresh_token");
      url.searchParams.set("access_token", credentials.accessToken);

      const data = await readJson(
        await fetch(url, { cache: "no-store" }),
        "Instagram token refresh"
      );

      if (!data?.access_token) return null;

      return toAccount(data.access_token, Number(data.expires_in) || 0, SCOPES);
    },
  },

  async publish(credentials, payload) {
    const { igUserId, accessToken } = credentials;
    const base = credentials.apiBase?.trim() || FACEBOOK_GRAPH;
    const images = payload.imageUrls.slice(0, 10); // IG carousel maximum

    if (images.length < 2) {
      throw new Error("Instagram carousels need at least 2 images.");
    }

    const childIds: string[] = [];

    for (const imageUrl of images) {
      const response = await fetch(`${base}/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          is_carousel_item: true,
          access_token: accessToken,
        }),
      });

      const data = await readJson(response, "Instagram item container");
      childIds.push(data.id);
    }

    const containerResponse = await fetch(`${base}/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "CAROUSEL",
        children: childIds.join(","),
        caption: composeCaption(payload, 2200),
        access_token: accessToken,
      }),
    });

    const container = await readJson(
      containerResponse,
      "Instagram carousel container"
    );

    const publishResponse = await fetch(`${base}/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: container.id,
        access_token: accessToken,
      }),
    });

    const published = await readJson(publishResponse, "Instagram publish");

    let permalink: string | undefined;

    try {
      const meta = await fetch(
        `${base}/${published.id}?fields=permalink&access_token=${encodeURIComponent(
          accessToken
        )}`
      );
      permalink = (await meta.json())?.permalink;
    } catch {
      // Permalink is cosmetic — never fail a successful post over it.
    }

    return { externalId: published.id, permalink };
  },
};
