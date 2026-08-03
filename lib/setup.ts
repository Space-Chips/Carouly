import { PostgrestError } from "@supabase/supabase-js";

/**
 * Turns the two setup mistakes that actually happen into instructions instead
 * of stack traces: the schema was never applied, or Clerk was never connected
 * to Supabase as a third-party auth provider (so RLS rejects every read).
 */
export const describeDbError = (error: PostgrestError): Error => {
  // PGRST205: table missing from PostgREST's schema cache.
  if (error.code === "PGRST205" || /schema cache/i.test(error.message)) {
    return new Error(
      "Database not initialised. Open the Supabase SQL editor and run supabase_schema.sql from the project root, then reload."
    );
  }

  // 42501: RLS refused the row — almost always the Clerk integration missing.
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return new Error(
      "Supabase rejected the request under row-level security. Connect Clerk as a third-party auth provider in Supabase → Authentication → Sign In / Providers."
    );
  }

  return new Error(error.message);
};

/** Fails fast with the name of the variable that is missing. */
export const requireEnv = (name: string, hint?: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is not set in .env.local.${hint ? ` ${hint}` : ""}`
    );
  }

  return value;
};
