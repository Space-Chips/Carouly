import { Platform } from "@/types";

export type PublishPayload = {
  /** Public URLs of the rendered slides, in order. */
  imageUrls: string[];
  caption: string;
  hashtags: string[];
};

export type PublishResult = {
  externalId?: string;
  permalink?: string;
};

/** A rendered vertical video ready for a short-form post. */
export type VideoPublishPayload = {
  videoUrl: string;
  caption: string;
  hashtags: string[];
};

/**
 * Everything a finished OAuth handshake produces. `credentials` is the only
 * part that gets encrypted; the rest is display metadata and refresh
 * bookkeeping stored in plain columns so the UI can render a connection
 * without ever decrypting a token.
 */
export type OAuthAccount<C = Record<string, string>> = {
  credentials: C;
  /** The platform's own account id (IG user id, TikTok open_id). */
  externalId: string;
  /** Display name, e.g. "Acme Coffee". */
  label: string;
  /** @username, without the @. */
  handle?: string;
  avatarUrl?: string;
  /** What the user actually granted — may be less than what we asked for. */
  scopes: string[];
  /** ISO timestamp the access token dies. Omitted if it doesn't. */
  expiresAt?: string;
};

export type OAuthKeys = { clientId: string; clientSecret: string };

/**
 * A one-click connect flow. The provider owns every platform-specific detail
 * of the handshake; `lib/social/oauth.ts` owns the parts that are the same
 * everywhere (signed state, redirect URI, storage, refresh scheduling).
 */
export type OAuthProvider<C = Record<string, string>> = {
  /** Env var names holding the app credentials, reported verbatim when unset. */
  env: { clientId: string; clientSecret: string };
  /** Where a developer goes to create the app and get those two values. */
  setupUrl: string;
  /** One line explaining what the user is about to authorise. */
  summary: string;
  /**
   * What the user has to have before the button can work at all, in their
   * words — shown on the card so the requirement is known before the trip to
   * the platform, not after it fails.
   */
  requirement?: string;
  /**
   * Whether the handshake carries a PKCE challenge. X requires it; TikTok
   * accepts it and it costs nothing, so both use it.
   */
  pkce?: boolean;
  authorizeUrl: (args: {
    keys: OAuthKeys;
    redirectUri: string;
    state: string;
    /** S256 challenge, present only when `pkce` is set. */
    codeChallenge?: string;
  }) => string;
  exchange: (args: {
    keys: OAuthKeys;
    code: string;
    redirectUri: string;
    /** The verifier matching the challenge sent to `authorizeUrl`. */
    codeVerifier?: string;
  }) => Promise<OAuthAccount<C>>;
  /**
   * Trades the stored credentials for fresh ones. Called before the token
   * would expire; returning null means "nothing to do".
   */
  refresh?: (args: {
    keys: OAuthKeys;
    credentials: C;
  }) => Promise<OAuthAccount<C> | null>;
  /**
   * How long before expiry to refresh. Short-lived tokens (TikTok: 24h) need
   * a tight window, long-lived ones (Instagram: 60d) a generous one.
   */
  refreshLeadMs: number;
};

export type Adapter<C = Record<string, string>> = {
  platform: Platform;
  label: string;
  /**
   * Credential fields for the paste-a-token fallback. Empty when a platform
   * is OAuth-only — `oauth` is the path users should ever see.
   */
  fields: { key: keyof C & string; label: string; hint?: string; secret?: boolean }[];
  docsUrl?: string;
  /** Present when the platform can be connected in one click. */
  oauth?: OAuthProvider<C>;
  publish: (credentials: C, payload: PublishPayload) => Promise<PublishResult>;
  /** Present for platforms that support posting a rendered video. */
  publishVideo?: (
    credentials: C,
    payload: VideoPublishPayload
  ) => Promise<PublishResult>;
};

export type InstagramCredentials = {
  igUserId: string;
  accessToken: string;
  /**
   * Which Graph host serves this account. OAuth connections use Instagram
   * Login (graph.instagram.com); tokens pasted by hand come from a Facebook
   * app and go through graph.facebook.com, which is the default so rows
   * written before OAuth existed keep working.
   */
  apiBase?: string;
};

export type TikTokCredentials = {
  openId: string;
  accessToken: string;
  refreshToken: string;
  /** Space-separated granted scopes, as TikTok returns them. */
  scope?: string;
};

export type FacebookCredentials = {
  pageId: string;
  accessToken: string;
};

export type LinkedInCredentials = {
  accessToken: string;
  authorUrn: string;
};

export type XCredentials = {
  accessToken: string;
  /** Present on OAuth connections; `offline.access` is what makes it exist. */
  refreshToken?: string;
  scope?: string;
};

/** Caption + hashtags, formatted the way each network expects. */
export const composeCaption = (
  payload: Pick<PublishPayload, "caption" | "hashtags">,
  maxLength?: number
) => {
  const tags = payload.hashtags.map((t) => `#${t}`).join(" ");
  const full = [payload.caption, tags].filter(Boolean).join("\n\n");

  if (!maxLength || full.length <= maxLength) return full;

  // Trim the caption body first, never mid-hashtag.
  const room = Math.max(0, maxLength - tags.length - 2);
  return [payload.caption.slice(0, room).trimEnd(), tags]
    .filter(Boolean)
    .join("\n\n");
};

/** Fetches a rendered slide so it can be uploaded as bytes. */
export const fetchImage = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not fetch slide image (${response.status}): ${url}`);
  }

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "image/png",
  };
};

export const readJson = async (response: Response, context: string) => {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${context} failed (${response.status}): ${text.slice(0, 400)}`);
  }

  return text ? JSON.parse(text) : {};
};

/** OAuth token endpoints all speak form-encoded POST, never JSON. */
export const postForm = async (
  url: string,
  body: Record<string, string>,
  context: string
) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });

  return readJson(response, context);
};
