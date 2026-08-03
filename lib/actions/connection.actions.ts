"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { encryptJson } from "@/lib/secrets";
import { getAdapter, isOAuthReady } from "@/lib/social";
import { OAuthAccount } from "@/lib/social/types";
import { describeDbError } from "@/lib/setup";
import { createSupabaseClient } from "@/lib/supabase";
import { Platform, SocialConnection } from "@/types";

import { requireBrand } from "./brand.actions";

const requireUser = async () => {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
};

/** What Settings needs to draw a connection. Never includes the token. */
export type ConnectionView = Omit<SocialConnection, "credentials"> & {
  configured: boolean;
  /** Token is dead or a refresh failed — the card asks to reconnect. */
  expired: boolean;
};

const CONNECTION_COLUMNS =
  "id, brand_id, user_id, platform, account_label, account_handle, external_account_id, avatar_url, scopes, expires_at, needs_reauth, enabled, credentials";

/**
 * Connections are returned without their credentials — the encrypted blob
 * never leaves the server, the UI only ever needs to know a platform is
 * configured and whose account it points at.
 */
export const getConnections = async (): Promise<ConnectionView[]> => {
  const userId = await requireUser();
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("social_connections")
    .select(CONNECTION_COLUMNS)
    .eq("user_id", userId);

  if (error) throw describeDbError(error);

  return ((data ?? []) as SocialConnection[]).map(({ credentials, ...rest }) => ({
    ...rest,
    scopes: rest.scopes ?? [],
    configured: Boolean(credentials),
    expired:
      Boolean(rest.needs_reauth) ||
      Boolean(rest.expires_at && Date.parse(rest.expires_at) <= Date.now()),
  }));
};

/**
 * Stores the result of a finished OAuth handshake.
 *
 * Called by the connect callback route, not by the browser: everything here
 * comes from the platform's own token endpoint, so there is nothing for the
 * user to type and nothing to validate beyond "did we get an account".
 */
export const saveOAuthConnection = async (
  platform: Platform,
  account: OAuthAccount
): Promise<void> => {
  const userId = await requireUser();
  const brand = await requireBrand();
  const supabase = createSupabaseClient();

  const adapter = getAdapter(platform);
  if (!adapter?.oauth) throw new Error(`${platform} has no one-click connect.`);

  const { error } = await supabase.from("social_connections").upsert(
    {
      brand_id: brand.id,
      user_id: userId,
      platform,
      account_label: account.label || adapter.label,
      account_handle: account.handle ?? null,
      external_account_id: account.externalId,
      avatar_url: account.avatarUrl ?? null,
      scopes: account.scopes,
      expires_at: account.expiresAt ?? null,
      needs_reauth: false,
      enabled: true,
      credentials: encryptJson(account.credentials),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "brand_id,platform" }
  );

  if (error) throw describeDbError(error);

  revalidatePath("/settings");
  revalidatePath("/dashboard");
};

/**
 * Paste-a-token fallback, for platforms with no OAuth provider configured.
 * Refuses to run when one-click is available: two ways to connect the same
 * account is how mismatched credentials get stored.
 */
export const saveConnection = async (
  platform: Platform,
  credentials: Record<string, string>,
  accountLabel?: string
) => {
  const userId = await requireUser();
  const brand = await requireBrand();
  const supabase = createSupabaseClient();

  const adapter = getAdapter(platform);
  if (!adapter) throw new Error(`Unsupported platform: ${platform}`);

  if (adapter.oauth && isOAuthReady(platform)) {
    throw new Error(`Connect ${adapter.label} with the Connect button instead.`);
  }

  // OAuth-only platforms have no fields to paste, so this path could only
  // ever store an enabled connection with no credentials behind it.
  if (adapter.oauth && !adapter.fields.length) {
    throw new Error(
      `${adapter.label} can only be connected through its own sign-in. Set ${adapter.oauth.env.clientId} and ${adapter.oauth.env.clientSecret} first.`
    );
  }

  const missing = adapter.fields
    .filter((field) => !credentials[field.key]?.trim())
    .map((field) => field.label);

  if (missing.length) {
    throw new Error(`Missing: ${missing.join(", ")}`);
  }

  const trimmed = Object.fromEntries(
    Object.entries(credentials).map(([key, value]) => [key, value.trim()])
  );

  const { error } = await supabase.from("social_connections").upsert(
    {
      brand_id: brand.id,
      user_id: userId,
      platform,
      account_label: accountLabel?.trim() || adapter.label,
      enabled: true,
      needs_reauth: false,
      credentials: adapter.fields.length ? encryptJson(trimmed) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "brand_id,platform" }
  );

  if (error) throw new Error(error.message);

  revalidatePath("/settings");
};

export const setConnectionEnabled = async (
  connectionId: string,
  enabled: boolean
) => {
  const userId = await requireUser();
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from("social_connections")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  revalidatePath("/settings");
};

export const deleteConnection = async (connectionId: string) => {
  const userId = await requireUser();
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from("social_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  revalidatePath("/settings");
};
