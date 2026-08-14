"use server";

/**
 * What a person can do to their library.
 *
 * Note what is *not* here: saving. Runs record what they make themselves, on the
 * server, at the moment they make it (see `lib/assets/recorder.ts`), so there is
 * no "save this" action for a client to call and no way for the library to
 * disagree with what the runs actually produced.
 *
 * What is left is curation — the part that needs a human. Renaming the actor to
 * "Maya, the cafe one" so she is findable next month, tagging the cuts that
 * performed, throwing away the ones that did not. Those are judgements, and they
 * are the only things asked of anyone here.
 */

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import {
  deleteAsset,
  getAssets,
  listAssets,
  updateAsset,
} from "@/lib/assets/store";
import type { Asset, AssetKind } from "@/lib/assets/types";
import { createSupabaseClient } from "@/lib/supabase";

const requireUser = async () => {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
};

export const listAssetsAction = async (kind?: AssetKind): Promise<Asset[]> => {
  await requireUser();
  return listAssets(createSupabaseClient(), kind);
};

export const renameAssetAction = async (
  id: string,
  name: string
): Promise<Asset> => {
  await requireUser();

  const trimmed = name.trim();
  if (!trimmed) throw new Error("A name is required.");

  const asset = await updateAsset(createSupabaseClient(), id, { name: trimmed });
  revalidatePath("/studio/library");
  return asset;
};

export const setTagsAction = async (id: string, tags: string[]): Promise<Asset> => {
  await requireUser();

  const clean = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
  const asset = await updateAsset(createSupabaseClient(), id, { tags: clean });
  revalidatePath("/studio/library");
  return asset;
};

export const deleteAssetAction = async (id: string): Promise<void> => {
  await requireUser();
  await deleteAsset(createSupabaseClient(), id);
  revalidatePath("/studio/library");
};

/** Read several by id, for resolving a `?use=` link into a run. */
export const resolveAssetsAction = async (ids: string[]): Promise<Asset[]> => {
  await requireUser();
  return getAssets(createSupabaseClient(), ids);
};
