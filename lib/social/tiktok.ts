import {
  Adapter,
  OAuthAccount,
  TikTokCredentials,
  composeCaption,
  postForm,
  readJson,
} from "./types";

const AUTHORIZE = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com/v2";

/**
 * `video.publish` posts straight to the profile; `video.upload` only drops a
 * draft into the user's TikTok inbox. Both are requested — an app that has
 * not passed TikTok's content-posting audit is granted only the second, and
 * `publish` below adapts to whichever came back rather than failing.
 */
const SCOPES = [
  "user.info.basic",
  "user.info.profile",
  "video.upload",
  "video.publish",
];

/** TikTok answers 200 with an error object, so status alone proves nothing. */
const readTikTok = async (response: Response, context: string) => {
  const data = await readJson(response, context);
  const error = data?.error;

  if (error && error.code && error.code !== "ok") {
    const detail = [error.code, error.message].filter(Boolean).join(": ");
    throw new Error(`${context} failed — ${detail}`);
  }

  return data;
};

const authed = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json; charset=UTF-8",
});

/**
 * `username` sits behind user.info.profile, and asking for a field the
 * granted scope does not cover fails the whole request — so the field list
 * follows what the user actually approved.
 */
const fetchProfile = async (accessToken: string, scope: string) => {
  const fields = ["open_id", "avatar_url", "display_name"];

  if (scope.includes("user.info.profile")) fields.push("username");

  const url = new URL(`${API}/user/info/`);
  url.searchParams.set("fields", fields.join(","));

  const data = await readTikTok(
    await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }),
    "TikTok profile"
  );

  return data?.data?.user ?? {};
};

const toAccount = async (token: {
  access_token: string;
  refresh_token: string;
  open_id: string;
  expires_in: number;
  scope?: string;
}): Promise<OAuthAccount<TikTokCredentials>> => {
  const scope = token.scope ?? "";
  const profile = await fetchProfile(token.access_token, scope);
  const scopes = scope.split(/[,\s]+/).filter(Boolean);

  return {
    credentials: {
      openId: token.open_id,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      scope: token.scope ?? "",
    },
    externalId: token.open_id,
    label: profile.display_name || profile.username || "TikTok",
    handle: profile.username,
    avatarUrl: profile.avatar_url,
    scopes,
    expiresAt: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : undefined,
  };
};

/**
 * Picks the most public setting the creator's own account allows.
 *
 * TikTok requires the creator_info query before every post and rejects a
 * privacy level it did not list — an app pending audit only ever gets
 * SELF_ONLY, so hardcoding PUBLIC_TO_EVERYONE would make every post fail.
 */
const pickPrivacyLevel = (options: string[]): string => {
  const preferred = [
    "PUBLIC_TO_EVERYONE",
    "MUTUAL_FOLLOW_FRIENDS",
    "FOLLOWER_OF_CREATOR",
    "SELF_ONLY",
  ];

  return preferred.find((level) => options.includes(level)) ?? options[0] ?? "SELF_ONLY";
};

/**
 * TikTok photo post (Content Posting API).
 *
 * TikTok pulls each image by URL — same reason the slide bucket is public.
 * The URL's domain must be verified in the TikTok developer portal, or the
 * init call is rejected with url_ownership_unverified.
 */
export const tiktok: Adapter<TikTokCredentials> = {
  platform: "tiktok",
  label: "TikTok",
  docsUrl:
    "https://developers.tiktok.com/doc/content-posting-api-get-started",

  // OAuth-only: TikTok access tokens live 24 hours, so a pasted token would
  // be dead before the first scheduled post.
  fields: [],

  oauth: {
    env: { clientId: "TIKTOK_CLIENT_KEY", clientSecret: "TIKTOK_CLIENT_SECRET" },
    setupUrl: "https://developers.tiktok.com/apps",
    summary: "Sign in to TikTok and allow posting photo carousels.",
    requirement:
      "Any TikTok account works. On mobile the TikTok app takes over the login, so there is no password to type.",
    pkce: true,
    // Access tokens last 24h; refresh once under an hour remains.
    refreshLeadMs: 60 * 60 * 1000,

    authorizeUrl: ({ keys, redirectUri, state, codeChallenge }) => {
      const url = new URL(AUTHORIZE);
      url.searchParams.set("client_key", keys.clientId);
      url.searchParams.set("scope", SCOPES.join(","));
      url.searchParams.set("response_type", "code");
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);

      // TikTok hands a signed-in browser (or the TikTok app, on mobile)
      // straight to the consent screen instead of a login form.
      url.searchParams.set("disable_auto_auth", "0");

      if (codeChallenge) {
        url.searchParams.set("code_challenge", codeChallenge);
        url.searchParams.set("code_challenge_method", "S256");
      }

      return url.toString();
    },

    async exchange({ keys, code, redirectUri, codeVerifier }) {
      const token = await postForm(
        `${API}/oauth/token/`,
        {
          client_key: keys.clientId,
          client_secret: keys.clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
        },
        "TikTok token exchange"
      );

      if (token?.error) {
        throw new Error(
          `TikTok token exchange failed — ${token.error}: ${
            token.error_description ?? ""
          }`
        );
      }

      if (!token?.access_token) {
        throw new Error("TikTok returned no access token.");
      }

      return toAccount(token);
    },

    async refresh({ keys, credentials }) {
      if (!credentials.refreshToken) return null;

      const token = await postForm(
        `${API}/oauth/token/`,
        {
          client_key: keys.clientId,
          client_secret: keys.clientSecret,
          grant_type: "refresh_token",
          refresh_token: credentials.refreshToken,
        },
        "TikTok token refresh"
      );

      if (token?.error || !token?.access_token) {
        throw new Error(
          `TikTok token refresh failed — ${token?.error ?? "no access token"}: ${
            token?.error_description ?? ""
          }`
        );
      }

      // A refresh response carries no open_id; keep the one we connected with.
      return toAccount({ ...token, open_id: credentials.openId });
    },
  },

  async publish(credentials, payload) {
    const { accessToken } = credentials;
    const images = payload.imageUrls.slice(0, 35); // TikTok photo maximum

    if (!images.length) {
      throw new Error("TikTok photo posts need at least one image.");
    }

    // Required before every post, and the only way to learn which privacy
    // levels this creator + this app are allowed to use.
    const creator = await readTikTok(
      await fetch(`${API}/post/publish/creator_info/query/`, {
        method: "POST",
        headers: authed(accessToken),
        cache: "no-store",
      }),
      "TikTok creator info"
    );

    const info = creator?.data ?? {};
    const caption = composeCaption(payload, 4000);

    // Un-audited apps get video.upload only, which can reach the inbox as a
    // draft but never the public profile.
    const canDirectPost = (credentials.scope ?? "").includes("video.publish");

    const body = {
      media_type: "PHOTO",
      post_mode: canDirectPost ? "DIRECT_POST" : "MEDIA_UPLOAD",
      post_info: {
        // The bold line above the caption. TikTok caps it at 90 characters,
        // so it takes the caption's opening line rather than a hard slice
        // through the middle of a sentence.
        title: payload.caption.split("\n")[0].slice(0, 90),
        description: caption,
        disable_comment: Boolean(info.comment_disabled),
        auto_add_music: true,
        ...(canDirectPost
          ? {
              privacy_level: pickPrivacyLevel(
                info.privacy_level_options ?? []
              ),
            }
          : {}),
      },
      source_info: {
        source: "PULL_FROM_URL",
        photo_cover_index: 0,
        photo_images: images,
      },
    };

    const init = await readTikTok(
      await fetch(`${API}/post/publish/content/init/`, {
        method: "POST",
        headers: authed(accessToken),
        body: JSON.stringify(body),
        cache: "no-store",
      }),
      "TikTok post init"
    );

    const publishId = init?.data?.publish_id;

    if (!publishId) throw new Error("TikTok returned no publish id.");

    return {
      externalId: publishId,
      permalink: canDirectPost
        ? await resolvePermalink(accessToken, publishId, info.creator_username)
        : undefined,
    };
  },
};

/**
 * TikTok processes the post asynchronously, so the public id only exists a
 * few seconds later. Best-effort: a missing permalink is cosmetic and must
 * never fail a post that TikTok already accepted.
 */
const resolvePermalink = async (
  accessToken: string,
  publishId: string,
  username?: string
): Promise<string | undefined> => {
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    try {
      const status = await readTikTok(
        await fetch(`${API}/post/publish/status/fetch/`, {
          method: "POST",
          headers: authed(accessToken),
          body: JSON.stringify({ publish_id: publishId }),
          cache: "no-store",
        }),
        "TikTok publish status"
      );

      const postId = status?.data?.publicaly_available_post_id?.[0];

      if (postId) {
        return username
          ? `https://www.tiktok.com/@${username}/photo/${postId}`
          : `https://www.tiktok.com/@/photo/${postId}`;
      }

      if (status?.data?.status === "FAILED") return undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
};
