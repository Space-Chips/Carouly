import {
  Adapter,
  OAuthAccount,
  XCredentials,
  composeCaption,
  fetchImage,
  readJson,
} from "./types";

const API = "https://api.x.com/2";
const AUTHORIZE = "https://x.com/i/oauth2/authorize";
const TOKEN = `${API}/oauth2/token`;

/**
 * `offline.access` is the one that matters for a scheduler: without it X
 * returns no refresh token and the connection dies two hours later.
 */
const SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "media.write",
  "offline.access",
];

/**
 * X's token endpoint authenticates confidential clients with HTTP Basic, and
 * rejects client_secret in the body. Public (PKCE-only) apps have no secret at
 * all, so the header is only sent when there is one.
 */
const tokenRequest = async (
  keys: { clientId: string; clientSecret: string },
  body: Record<string, string>,
  context: string
) => {
  const basic = Buffer.from(`${keys.clientId}:${keys.clientSecret}`).toString(
    "base64"
  );

  const response = await fetch(TOKEN, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({ client_id: keys.clientId, ...body }).toString(),
    cache: "no-store",
  });

  return readJson(response, context);
};

const fetchProfile = async (accessToken: string) => {
  const url = new URL(`${API}/users/me`);
  url.searchParams.set("user.fields", "profile_image_url,username,name");

  const data = await readJson(
    await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }),
    "X profile"
  );

  return data?.data ?? {};
};

const toAccount = async (token: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}): Promise<OAuthAccount<XCredentials>> => {
  const profile = await fetchProfile(token.access_token);

  if (!profile.id) throw new Error("X did not return an account for this login.");

  return {
    credentials: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      scope: token.scope,
    },
    externalId: String(profile.id),
    label: profile.name || profile.username || "X",
    handle: profile.username,
    // `_normal` is the 48px crop X hands out by default.
    avatarUrl: profile.profile_image_url?.replace("_normal", "_400x400"),
    scopes: (token.scope ?? "").split(/[\s,]+/).filter(Boolean),
    expiresAt: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : undefined,
  };
};

/**
 * X (Twitter) post with up to 4 images.
 *
 * Uses the v2 media upload endpoint, so a plain OAuth 2.0 user access token
 * with tweet.write + media.write is enough (no OAuth 1.0a signing).
 * X caps a post at 4 images, so a 4-slide carousel fits exactly.
 */
export const x: Adapter<XCredentials> = {
  platform: "x",
  label: "X (Twitter)",
  docsUrl: "https://docs.x.com/x-api/media/quickstart/media-upload-chunked",

  // Paste-a-token fallback, only offered while X_CLIENT_ID / X_CLIENT_SECRET
  // are unset. Hand-made tokens expire in two hours and cannot be refreshed.
  fields: [
    {
      key: "accessToken",
      label: "OAuth 2.0 user access token",
      hint: "Scopes: tweet.write, users.read, media.write, offline.access",
      secret: true,
    },
  ],

  oauth: {
    env: { clientId: "X_CLIENT_ID", clientSecret: "X_CLIENT_SECRET" },
    setupUrl: "https://developer.x.com/en/portal/dashboard",
    summary: "Sign in to X and allow posting — nothing to copy or paste.",
    requirement:
      "Any X account works. Posting images needs a paid X API tier on the app side, not on the account.",
    // X mandates PKCE on every OAuth 2.0 authorize request.
    pkce: true,
    // Access tokens last two hours; refresh with fifteen minutes to spare.
    refreshLeadMs: 15 * 60 * 1000,

    authorizeUrl: ({ keys, redirectUri, state, codeChallenge }) => {
      const url = new URL(AUTHORIZE);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", keys.clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", SCOPES.join(" "));
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", codeChallenge ?? "challenge");
      url.searchParams.set("code_challenge_method", codeChallenge ? "S256" : "plain");
      return url.toString();
    },

    async exchange({ keys, code, redirectUri, codeVerifier }) {
      const token = await tokenRequest(
        keys,
        {
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier ?? "challenge",
        },
        "X token exchange"
      );

      if (!token?.access_token) throw new Error("X returned no access token.");

      return toAccount(token);
    },

    /**
     * X rotates the refresh token on every use, so the new one has to be
     * stored or the next renewal fails.
     */
    async refresh({ keys, credentials }) {
      if (!credentials.refreshToken) return null;

      const token = await tokenRequest(
        keys,
        {
          grant_type: "refresh_token",
          refresh_token: credentials.refreshToken,
        },
        "X token refresh"
      );

      if (!token?.access_token) throw new Error("X token refresh returned no token.");

      return toAccount({
        ...token,
        refresh_token: token.refresh_token ?? credentials.refreshToken,
      });
    },
  },

  async publish(credentials, payload) {
    const { accessToken } = credentials;
    const images = payload.imageUrls.slice(0, 4);
    const mediaIds: string[] = [];

    for (const imageUrl of images) {
      const { bytes, contentType } = await fetchImage(imageUrl);

      const form = new FormData();
      form.append("media", new Blob([new Uint8Array(bytes)], { type: contentType }));
      form.append("media_category", "tweet_image");

      const response = await fetch(`${API}/media/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });

      const data = await readJson(response, "X media upload");
      const mediaId = data?.data?.id ?? data?.id ?? data?.media_id_string;

      if (!mediaId) throw new Error("X media upload returned no media id.");

      mediaIds.push(String(mediaId));
    }

    const response = await fetch(`${API}/tweets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: composeCaption(payload, 280),
        media: { media_ids: mediaIds },
      }),
    });

    const tweet = await readJson(response, "X post");
    const id = tweet?.data?.id;

    return {
      externalId: id,
      permalink: id ? `https://x.com/i/web/status/${id}` : undefined,
    };
  },
};
