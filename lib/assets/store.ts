/**
 * Reading and writing the asset library.
 *
 * Everything here runs against a Supabase client the caller supplies, so RLS
 * does the ownership check: a query is scoped to the signed-in user by the
 * database, not by a `where user_id =` we have to remember to write. The
 * `user_id` passed on write is the same value RLS compares against — required
 * because the column is `not null`, and belt and braces besides.
 *
 * The row shape and the {@link Asset} shape differ only in casing and in the
 * timestamps being ISO strings on the wire; {@link rowToAsset} is the single
 * place that reconciles them, so nothing else ever sees a raw row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Asset, AssetKind, NewAsset } from "@/lib/assets/types";

type AssetRow = {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  kind: AssetKind;
  name: string;
  tags: string[] | null;
  preview_url: string | null;
  source_url: string | null;
  fingerprint: string;
  storage: Asset["storage"];
  parents: string[] | null;
  data: unknown;
};

const rowToAsset = (row: AssetRow): Asset =>
  ({
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    name: row.name,
    tags: row.tags ?? [],
    previewUrl: row.preview_url ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    fingerprint: row.fingerprint,
    storage: row.storage,
    parents: row.parents ?? [],
    data: row.data,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }) as Asset;

export const listAssets = async (
  supabase: SupabaseClient,
  kind?: AssetKind
): Promise<Asset[]> => {
  let query = supabase
    .from("assets")
    .select("*")
    .order("created_at", { ascending: false });

  if (kind) query = query.eq("kind", kind);

  const { data, error } = await query;
  if (error) throw new Error(`list assets: ${error.message}`);

  return (data as AssetRow[]).map(rowToAsset);
};

/**
 * One person's assets of a kind, most recent first.
 *
 * Explicitly scoped by `user_id`, unlike {@link listAssets}, because the caller
 * is the recorder — which holds a service-role client. RLS is not enforced for
 * that role, so the filter every other read gets for free has to be written
 * here. Getting this wrong would show one customer another customer's actors,
 * which is the worst bug this file could have.
 */
export const listAssetsOwnedBy = async (
  supabase: SupabaseClient,
  userId: string,
  kind: AssetKind,
  limit = 12
): Promise<Asset[]> => {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("user_id", userId)
    .eq("kind", kind)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`list ${kind}s: ${error.message}`);

  return (data as AssetRow[]).map(rowToAsset);
};

export const getAsset = async (
  supabase: SupabaseClient,
  id: string
): Promise<Asset | null> => {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`get asset: ${error.message}`);

  return data ? rowToAsset(data as AssetRow) : null;
};

/** Several by id, in one round trip, for resolving a reuse link. */
export const getAssets = async (
  supabase: SupabaseClient,
  ids: string[]
): Promise<Asset[]> => {
  if (!ids.length) return [];

  const { data, error } = await supabase.from("assets").select("*").in("id", ids);
  if (error) throw new Error(`get assets: ${error.message}`);

  return (data as AssetRow[]).map(rowToAsset);
};

/**
 * Have we already got this exact thing?
 *
 * Cheap enough to ask before doing expensive work on the answer — the point is
 * to skip re-downloading and re-uploading a logo we already hold a durable copy
 * of, on every single run against the same site.
 */
export const findByFingerprint = async (
  supabase: SupabaseClient,
  kind: AssetKind,
  fingerprint: string
): Promise<Asset | null> => {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("kind", kind)
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  if (error) throw new Error(`find asset: ${error.message}`);

  return data ? rowToAsset(data as AssetRow) : null;
};

/** Everything made from this asset — the other direction of lineage. */
export const descendantsOf = async (
  supabase: SupabaseClient,
  id: string
): Promise<Asset[]> => {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .contains("parents", [id])
    .order("created_at", { ascending: false });

  if (error) throw new Error(`descendants: ${error.message}`);

  return (data as AssetRow[]).map(rowToAsset);
};

/**
 * Record an asset, or update the one it already is.
 *
 * Upsert on `(user_id, kind, fingerprint)` rather than insert, because runs
 * record what they make automatically: without this, the second run against a
 * site writes a second kit and a second copy of every logo, and by the fourth
 * run the library is unusable. Seeing the same thing again is not a new asset,
 * it is the same asset seen again.
 *
 * `name` and `tags` are deliberately NOT overwritten on conflict — if you have
 * renamed or tagged something, a later run seeing it again must not undo that.
 * That is the whole difference between a record and a cache.
 */
export const recordAsset = async (
  supabase: SupabaseClient,
  userId: string,
  input: NewAsset
): Promise<{ asset: Asset; reused: boolean }> => {
  const existing = await supabase
    .from("assets")
    .select("*")
    .eq("kind", input.kind)
    .eq("fingerprint", input.fingerprint)
    .maybeSingle();

  if (existing.error) throw new Error(`record asset: ${existing.error.message}`);

  if (existing.data) {
    const row = existing.data as AssetRow;

    const { data, error } = await supabase
      .from("assets")
      .update({
        updated_at: new Date().toISOString(),
        preview_url: input.previewUrl ?? row.preview_url,
        source_url: input.sourceUrl ?? row.source_url,
        storage: input.storage ?? row.storage,
        // Union, so a second sighting adds lineage without dropping what the
        // first one knew.
        parents: [...new Set([...(row.parents ?? []), ...(input.parents ?? [])])],
        data: input.data,
      })
      .eq("id", row.id)
      .select("*")
      .single();

    if (error) throw new Error(`record asset: ${error.message}`);

    return { asset: rowToAsset(data as AssetRow), reused: true };
  }

  const { data, error } = await supabase
    .from("assets")
    .insert({
      user_id: userId,
      kind: input.kind,
      name: input.name,
      tags: input.tags ?? [],
      preview_url: input.previewUrl ?? null,
      source_url: input.sourceUrl ?? null,
      fingerprint: input.fingerprint,
      storage: input.storage ?? "remote",
      parents: input.parents ?? [],
      data: input.data,
    })
    .select("*")
    .single();

  if (error) throw new Error(`record asset: ${error.message}`);

  return { asset: rowToAsset(data as AssetRow), reused: false };
};

/**
 * Patch the human-editable envelope fields.
 *
 * `data` is deliberately not patchable here: an asset's payload is what a run
 * produced, and editing it by hand is a different operation from renaming or
 * retagging the thing.
 */
export const updateAsset = async (
  supabase: SupabaseClient,
  id: string,
  patch: { name?: string; tags?: string[] }
): Promise<Asset> => {
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.tags !== undefined) fields.tags = patch.tags;

  const { data, error } = await supabase
    .from("assets")
    .update(fields)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(`update asset: ${error.message}`);

  return rowToAsset(data as AssetRow);
};

export const deleteAsset = async (
  supabase: SupabaseClient,
  id: string
): Promise<void> => {
  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) throw new Error(`delete asset: ${error.message}`);
};
