import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Request-scoped client. Sends the Clerk session token, so every query runs
 * under RLS as the signed-in user.
 */
export const createSupabaseClient = (): SupabaseClient => {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
  }

  return createClient(supabaseUrl, supabaseKey, {
    async accessToken() {
      return (await auth()).getToken();
    },
  });
};

/**
 * Service-role client for background work (the daily cron, storage uploads).
 * Bypasses RLS, so every query it makes must filter by user_id / brand_id
 * explicitly. Never import this from a client component.
 */
export const createSupabaseAdminClient = (): SupabaseClient => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing Supabase service credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  assertServiceRoleKey(serviceKey);

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

/**
 * Guards against the easiest mistake in this whole setup: pasting the *anon*
 * key into SUPABASE_SERVICE_ROLE_KEY. Both sit side by side in the Supabase
 * dashboard, both are long JWTs, and the only visible difference is a role
 * claim. Without this check the mistake surfaces much later as
 * "new row violates row-level security policy" from inside the pipeline,
 * which points at the wrong thing entirely.
 */
const checkedKeys = new Set<string>();

const assertServiceRoleKey = (key: string) => {
  if (checkedKeys.has(key)) return;

  // New-format keys (sb_secret_… / sb_publishable_…) carry no readable claims.
  if (key.startsWith("sb_secret_")) {
    checkedKeys.add(key);
    return;
  }

  if (key.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY holds a publishable key. Background jobs need a secret key: Supabase → Project Settings → API Keys → Secret keys."
    );
  }

  const segments = key.split(".");

  if (segments.length === 3) {
    try {
      const claims = JSON.parse(
        Buffer.from(segments[1], "base64url").toString("utf8")
      );

      if (claims?.role && claims.role !== "service_role") {
        throw new Error(
          `SUPABASE_SERVICE_ROLE_KEY holds the "${claims.role}" key, not the service_role key. On the "Legacy anon, service_role API keys" tab the two sit side by side — copy the one labelled service_role (it is hidden behind a Reveal). Row-level security applies to any other key, so background writes will be rejected.`
        );
      }
    } catch (error) {
      // A malformed JWT is the API's problem to report, not ours — but a
      // thrown role mismatch above must not be swallowed here.
      if (error instanceof Error && error.message.startsWith("SUPABASE_")) {
        throw error;
      }
    }
  }

  checkedKeys.add(key);
};

export const ASSET_BUCKET = "carousel-assets";

/** Uploads bytes to the public asset bucket and returns the public URL. */
export const uploadAsset = async (
  path: string,
  bytes: Uint8Array | ArrayBuffer,
  contentType: string
): Promise<string> => {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });

  if (error) throw new Error(`Asset upload failed: ${error.message}`);

  const { data } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(path);

  return data.publicUrl;
};
