"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { generateSeedTopics } from "@/lib/generator";
import { expandSeeds } from "@/lib/keyword-sources";
import { HARVEST_LIMIT, refillKeywordBank, scoreCandidates } from "@/lib/pipeline";
import { describeDbError } from "@/lib/setup";
import { createSupabaseClient } from "@/lib/supabase";
import { Keyword } from "@/types";

import { requireBrand } from "./brand.actions";

const requireUser = async () => {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
};

export const getKeywords = async (): Promise<Keyword[]> => {
  const userId = await requireUser();
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("keywords")
    .select("*")
    .eq("user_id", userId)
    .order("score", { ascending: false });

  if (error) throw describeDbError(error);

  return (data ?? []) as Keyword[];
};

/**
 * Research runs in two stages, only the first of which touches a model.
 *
 * Stage 1 asks for seed topics (a few dozen tokens). Stage 2 harvests real
 * phrases from search autocomplete and scores them arithmetically — no model,
 * no waiting on generated text. Splitting them lets the UI report true
 * progress, and keeps the slow part clearly attributable.
 */

/** Stage 1 — seed topics for autocomplete. The only model call in research. */
export const researchSeeds = async (): Promise<{ seeds: string[] }> => {
  const brand = await requireBrand();

  return { seeds: await generateSeedTopics(brand) };
};

/**
 * Stage 2 — harvest real phrases, score them, store them. Parallel HTTP plus
 * arithmetic, so this is fast and deterministic.
 */
export const harvestKeywords = async (
  seeds: string[]
): Promise<{ added: number; found: number; usedFallback: boolean }> => {
  const brand = await requireBrand();

  const candidates = await expandSeeds(seeds.slice(0, 12), {
    exclude: [brand.name, brand.handle ?? ""],
  });

  if (!candidates.length) {
    // Suggestion endpoints unreachable — fall back to the model-only bank so
    // the run still produces something, flagged as estimates in the UI.
    const created = await refillKeywordBank(brand);

    revalidatePath("/keywords");
    revalidatePath("/dashboard");

    return { added: created.length, found: 0, usedFallback: true };
  }

  const saved = await scoreCandidates(brand, candidates);

  revalidatePath("/keywords");
  revalidatePath("/dashboard");

  return {
    added: saved.length,
    found: Math.min(candidates.length, HARVEST_LIMIT),
    usedFallback: false,
  };
};

/** One-shot research, for callers without a UI (onboarding, cron). */
export const generateKeywords = async (count = 25) => {
  const brand = await requireBrand();
  const created = await refillKeywordBank(brand, count);

  revalidatePath("/keywords");
  revalidatePath("/dashboard");

  return { added: created.length };
};

/**
 * Bulk review. Approving is what puts a keyword in autopilot's queue;
 * archiving takes it out of consideration without deleting the row, so the
 * next research run won't resurface it.
 */
export const setKeywordsStatus = async (
  keywordIds: string[],
  status: Keyword["status"]
) => {
  const userId = await requireUser();

  if (!keywordIds.length) return { updated: 0 };

  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("keywords")
    .update({ status })
    .in("id", keywordIds.slice(0, 200))
    .eq("user_id", userId)
    .select("id");

  if (error) throw describeDbError(error);

  revalidatePath("/keywords");
  revalidatePath("/dashboard");

  return { updated: data?.length ?? 0 };
};

export const setKeywordStatus = async (
  keywordId: string,
  status: Keyword["status"]
) => setKeywordsStatus([keywordId], status);
