import crypto from "crypto";

import { decryptJson, encryptJson } from "@/lib/secrets";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { Platform, SocialConnection } from "@/types";

import { getAdapter, listAdapters } from "./registry";
import { OAuthAccount, OAuthKeys, OAuthProvider } from "./types";

/**
 * Everything that is the same for every one-click connect: where the browser
 * comes back to, how the round trip is protected against CSRF, and how a
 * stored token is kept alive so a connection made once keeps working.
 *
 * Platform-specific detail lives on the adapter's `oauth` provider.
 */

/** How long an authorisation round trip may take before the state goes stale. */
const STATE_TTL_MS = 10 * 60 * 1000;

export const OAUTH_STATE_COOKIE = "sc_oauth_state";

/**
 * PKCE verifier for the trip in progress. It never reaches the platform — only
 * its SHA-256 hash does — so a code intercepted on the way back cannot be
 * exchanged by anyone but this browser.
 */
export const OAUTH_VERIFIER_COOKIE = "sc_oauth_verifier";

export const createPkce = () => {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");

  return { verifier, challenge };
};

export const getProvider = (platform: Platform): OAuthProvider | undefined =>
  getAdapter(platform)?.oauth;

/**
 * App credentials for a provider, or null when they are not configured.
 * Returning null rather than throwing lets Settings render a "needs setup"
 * card instead of a crashed page.
 */
export const providerKeys = <C>(provider: OAuthProvider<C>): OAuthKeys | null => {
  const clientId = process.env[provider.env.clientId]?.trim();
  const clientSecret = process.env[provider.env.clientSecret]?.trim();

  return clientId && clientSecret ? { clientId, clientSecret } : null;
};

export const isOAuthReady = (platform: Platform): boolean => {
  const provider = getProvider(platform);
  return Boolean(provider && providerKeys(provider));
};

/** Platforms that can be connected in one click, with their readiness. */
export const listOAuthPlatforms = () =>
  listAdapters()
    .filter((adapter) => adapter.oauth)
    .map((adapter) => ({
      platform: adapter.platform,
      ready: Boolean(providerKeys(adapter.oauth!)),
      summary: adapter.oauth!.summary,
      requirement: adapter.oauth!.requirement,
      setupUrl: adapter.oauth!.setupUrl,
      envVars: [adapter.oauth!.env.clientId, adapter.oauth!.env.clientSecret],
    }));

/**
 * The redirect URI must match what is registered with the platform character
 * for character, so it is derived from one configured value rather than from
 * whatever Host header the request happened to carry.
 */
export const redirectUriFor = (platform: Platform, requestUrl: string): string => {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  const origin = configured || new URL(requestUrl).origin;

  return `${origin}/api/connect/${platform}/callback`;
};

// ------------------------------------------------------------------ state ---

/**
 * The `state` parameter is signed rather than looked up, so no server-side
 * store is needed, and the nonce inside it is also written to an httpOnly
 * cookie: a signed value alone would be replayable by whoever obtained it.
 */
const stateKey = (): Buffer => {
  const raw = process.env.APP_ENCRYPTION_KEY;

  if (!raw) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32"
    );
  }

  return crypto.createHash("sha256").update(`oauth-state:${raw}`).digest();
};

type StatePayload = {
  /** platform */
  p: Platform;
  /** nonce, mirrored in the cookie */
  n: string;
  /** Clerk user id */
  u: string;
  /** issued at */
  t: number;
};

export const createState = (platform: Platform, userId: string) => {
  const nonce = crypto.randomBytes(16).toString("base64url");

  const payload: StatePayload = {
    p: platform,
    n: nonce,
    u: userId,
    t: Date.now(),
  };

  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", stateKey())
    .update(body)
    .digest("base64url");

  return { state: `${body}.${signature}`, nonce };
};

export const verifyState = (
  state: string | null,
  platform: Platform,
  nonceFromCookie: string | undefined,
  userId: string
): { ok: true } | { ok: false; reason: string } => {
  if (!state) return { ok: false, reason: "Missing state." };

  const [body, signature] = state.split(".");
  if (!body || !signature) return { ok: false, reason: "Malformed state." };

  const expected = crypto
    .createHmac("sha256", stateKey())
    .update(body)
    .digest("base64url");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "State signature did not verify." };
  }

  let payload: StatePayload;

  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "Unreadable state." };
  }

  if (payload.p !== platform) return { ok: false, reason: "State platform mismatch." };
  if (payload.u !== userId) return { ok: false, reason: "State belongs to another session." };
  if (Date.now() - payload.t > STATE_TTL_MS) {
    return { ok: false, reason: "The connect link expired. Try again." };
  }
  if (!nonceFromCookie || nonceFromCookie !== payload.n) {
    return { ok: false, reason: "State could not be matched to this browser." };
  }

  return { ok: true };
};

// ------------------------------------------------------------- handshake ---

export const buildAuthorizeUrl = (
  platform: Platform,
  redirectUri: string,
  state: string,
  codeChallenge?: string
): string => {
  const { provider, keys } = requireProvider(platform);
  return provider.authorizeUrl({ keys, redirectUri, state, codeChallenge });
};

export const exchangeCode = (
  platform: Platform,
  code: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<OAuthAccount> => {
  const { provider, keys } = requireProvider(platform);
  return provider.exchange({ keys, code, redirectUri, codeVerifier });
};

const requireProvider = (platform: Platform) => {
  const provider = getProvider(platform);

  if (!provider) {
    throw new Error(`${platform} cannot be connected with one click.`);
  }

  const keys = providerKeys(provider);

  if (!keys) {
    throw new Error(
      `${provider.env.clientId} and ${provider.env.clientSecret} are not set, so ${platform} cannot be connected. Create an app at ${provider.setupUrl}.`
    );
  }

  return { provider, keys };
};

// --------------------------------------------------------------- refresh ---

/**
 * Returns credentials that are usable *now*, refreshing them first if the
 * access token is close to expiry.
 *
 * This is what keeps one-click connections one-click: TikTok tokens live 24
 * hours and Instagram's 60 days, so without this every connection would
 * silently rot and the user would be asked to reconnect. Runs on the admin
 * client because its main caller is the cron, which has no session.
 */
export const ensureFreshCredentials = async (
  connection: SocialConnection
): Promise<Record<string, string>> => {
  const credentials =
    decryptJson<Record<string, string>>(connection.credentials) ?? {};

  const provider = getProvider(connection.platform);
  const keys = provider ? providerKeys(provider) : null;

  if (!provider?.refresh || !keys) return credentials;

  const expiresAt = connection.expires_at
    ? Date.parse(connection.expires_at)
    : NaN;

  if (Number.isNaN(expiresAt)) return credentials;
  if (expiresAt - Date.now() > provider.refreshLeadMs) return credentials;

  const supabase = createSupabaseAdminClient();

  try {
    const account = await provider.refresh({ keys, credentials });

    if (!account) return credentials;

    await supabase
      .from("social_connections")
      .update({
        credentials: encryptJson(account.credentials),
        expires_at: account.expiresAt ?? null,
        scopes: account.scopes,
        needs_reauth: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    return account.credentials;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Only give up once the token is actually dead: a transient failure
    // inside the lead window must not lock a working connection out.
    if (expiresAt > Date.now()) {
      console.warn(`[oauth] ${connection.platform} refresh failed early:`, message);
      return credentials;
    }

    await supabase
      .from("social_connections")
      .update({ needs_reauth: true, updated_at: new Date().toISOString() })
      .eq("id", connection.id);

    throw new Error(
      `${connection.platform} access expired and could not be renewed — reconnect it in Settings. (${message})`
    );
  }
};

/**
 * Refreshes every connection that is near expiry, ahead of the posting run.
 * Failures are swallowed: publishing reports them per platform, and one dead
 * token must not stop the cron.
 */
export const refreshExpiringConnections = async (): Promise<number> => {
  const supabase = createSupabaseAdminClient();

  const horizon = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("social_connections")
    .select("*")
    .eq("enabled", true)
    .not("expires_at", "is", null)
    .lte("expires_at", horizon);

  const connections = (data ?? []) as SocialConnection[];
  let refreshed = 0;

  for (const connection of connections) {
    try {
      await ensureFreshCredentials(connection);
      refreshed += 1;
    } catch (error) {
      console.warn(
        `[oauth] could not refresh ${connection.platform}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return refreshed;
};
