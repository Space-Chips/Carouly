import {
  buildKeywordBank,
  generateSeedTopics,
  hookImagePrompt,
  writeCarousel,
} from "@/lib/generator";
import { entitlementForUser } from "@/lib/billing";
import { Candidate, expandSeeds } from "@/lib/keyword-sources";
import { fromCandidate, KeywordRow } from "@/lib/keywords";
import { generateImage } from "@/lib/openrouter";
import { renderCarouselAssets } from "@/lib/render";
import { publishCarousel } from "@/lib/social";
import { createSupabaseAdminClient, uploadAsset } from "@/lib/supabase";
import { Brand, Keyword } from "@/types";

/**
 * The end-to-end machine: keyword -> copy -> hook image -> rendered PNGs ->
 * (optionally) published. Everything here runs with the service-role client
 * because it is also driven by the cron, which has no user session.
 */

/** Local calendar date for a brand, e.g. "2026-07-31". */
export const localDate = (timezone: string, at = new Date()): string => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
};

/** Local hour 0-23 for a brand. */
export const localHour = (timezone: string, at = new Date()): number => {
  try {
    return Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        hour12: false,
      }).format(at)
    );
  } catch {
    return at.getUTCHours();
  }
};

/**
 * Returns the next keyword to write about, topping the bank up from the LLM
 * when it runs dry so autopilot never stalls on an empty queue.
 */
export const nextKeyword = async (brand: Brand): Promise<Keyword> => {
  const supabase = createSupabaseAdminClient();

  const pick = async (status: "approved" | "new") => {
    const { data } = await supabase
      .from("keywords")
      .select("*")
      .eq("brand_id", brand.id)
      .eq("status", status)
      .order("score", { ascending: false })
      .limit(1);

    return (data?.[0] as Keyword | undefined) ?? null;
  };

  // Keywords the user picked come first. Falling back to the highest-ranked
  // unreviewed keyword is what keeps autopilot running when the approved
  // queue empties — otherwise "posts every day without you" quietly stops.
  const approved = await pick("approved");
  if (approved) return approved;

  const unreviewed = await pick("new");
  if (unreviewed) return unreviewed;

  await refillKeywordBank(brand);

  const refreshed = (await pick("approved")) ?? (await pick("new"));

  if (!refreshed) {
    throw new Error(
      "No keywords available for this brand and the bank could not be refilled."
    );
  }

  return refreshed;
};

/** How many harvested phrases we keep per research run. */
export const HARVEST_LIMIT = 60;

/** Persists scored keywords, skipping any the brand already has. */
export const saveKeywords = async (
  brand: Brand,
  keywords: KeywordRow[]
) => {
  if (!keywords.length) return [];

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("keywords")
    .upsert(
      keywords.map((k) => ({
        ...k,
        brand_id: brand.id,
        user_id: brand.user_id,
      })),
      { onConflict: "brand_id,keyword", ignoreDuplicates: true }
    )
    .select();

  if (error) throw new Error(error.message);

  return data ?? [];
};

/**
 * Scores a set of real search phrases and stores them.
 *
 * No model call: demand and competition are both computed from the measured
 * suggestion data, so this is instant and deterministic. Rows land as "new"
 * for the user to review.
 */
export const scoreCandidates = async (brand: Brand, candidates: Candidate[]) =>
  saveKeywords(
    brand,
    candidates.slice(0, HARVEST_LIMIT).map(fromCandidate)
  );

/**
 * Full research run: seed topics from the model, real phrases from search
 * autocomplete, then one scoring pass.
 *
 * If autocomplete yields nothing (blocked egress, rate limiting) it falls
 * back to the model-only bank rather than failing — degraded, not broken.
 */
export const refillKeywordBank = async (brand: Brand, count = 25) => {
  const seeds = await generateSeedTopics(brand);

  const candidates = seeds.length
    ? await expandSeeds(seeds, {
        exclude: [brand.name, brand.handle ?? ""],
      })
    : [];

  if (candidates.length) {
    return scoreCandidates(brand, candidates);
  }

  console.warn(
    "[pipeline] autocomplete returned nothing — falling back to model-only keywords."
  );

  return saveKeywords(brand, await buildKeywordBank(brand, count));
};

/** Writes, renders and stores one carousel. Returns its id. */
export const createCarousel = async (
  brand: Brand,
  options: { keywordId?: string } = {}
): Promise<string> => {
  const supabase = createSupabaseAdminClient();

  let keyword: Keyword;

  if (options.keywordId) {
    const { data, error } = await supabase
      .from("keywords")
      .select("*")
      .eq("id", options.keywordId)
      .eq("brand_id", brand.id)
      .single();

    if (error) throw new Error(error.message);
    keyword = data as Keyword;
  } else {
    keyword = await nextKeyword(brand);
  }

  const generated = await writeCarousel(brand, keyword);

  const { data: carousel, error: insertError } = await supabase
    .from("carousels")
    .insert({
      brand_id: brand.id,
      user_id: brand.user_id,
      keyword_id: keyword.id,
      keyword_text: keyword.keyword,
      preset: brand.preset,
      title: generated.title,
      caption: generated.caption,
      hashtags: generated.hashtags,
      status: "draft",
    })
    .select()
    .single();

  if (insertError) throw new Error(insertError.message);

  // Hook image is an enhancement: a failure here downgrades the look, it does
  // not lose the carousel. It is recorded rather than swallowed, though — an
  // image model that is misconfigured would otherwise produce image-less
  // carousels indefinitely with nothing to point at.
  let hookImageError: string | null = null;

  if (generated.hook_image_prompt) {
    try {
      const image = await generateImage(
        hookImagePrompt(generated.hook_image_prompt, carousel.preset)
      );

      if (!image) throw new Error("model returned no image");

      const extension = image.contentType.includes("jpeg") ? "jpg" : "png";
      const url = await uploadAsset(
        `${brand.user_id}/${carousel.id}/hook.${extension}`,
        image.bytes,
        image.contentType
      );

      await supabase
        .from("carousels")
        .update({ hook_image_url: url })
        .eq("id", carousel.id);

      carousel.hook_image_url = url;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      console.error("[pipeline] hook image failed:", reason);

      // Written after rendering — renderCarouselAssets clears `error` on
      // success, so recording it here would be wiped moments later.
      hookImageError = `Hook image skipped — ${reason}`.slice(0, 500);
    }
  }

  const { error: slidesError } = await supabase.from("slides").insert(
    generated.slides.map((slide, index) => ({
      carousel_id: carousel.id,
      user_id: brand.user_id,
      position: index,
      kind: slide.kind,
      heading: slide.heading,
      body: slide.body ?? null,
      footnote: slide.footnote ?? null,
    }))
  );

  if (slidesError) throw new Error(slidesError.message);

  await renderCarouselAssets(carousel.id);

  if (hookImageError) {
    await supabase
      .from("carousels")
      .update({ error: hookImageError })
      .eq("id", carousel.id);
  }

  await supabase
    .from("keywords")
    .update({ status: "used", used_at: new Date().toISOString() })
    .eq("id", keyword.id);

  return carousel.id as string;
};

export type BrandRunResult = {
  brandId: string;
  created: string[];
  published: number;
  skipped?: string;
  errors: string[];
};

/**
 * One brand's daily batch. Idempotent per local day: the unique index on
 * (brand_id, run_date) means a cron that fires twice cannot double-post.
 */
export const runBrandDaily = async (
  brand: Brand,
  options: { force?: boolean; limit?: number } = {}
): Promise<BrandRunResult> => {
  const supabase = createSupabaseAdminClient();
  const runDate = localDate(brand.timezone);
  // The brand's own setting is the ceiling; `limit` lowers it. That is how a
  // free account can press "run today's batch" and get one carousel instead of
  // five, without its saved schedule being rewritten behind its back.
  const requested = Math.min(brand.posts_per_day, options.limit ?? Infinity);
  const result: BrandRunResult = {
    brandId: brand.id,
    created: [],
    published: 0,
    errors: [],
  };

  if (!options.force) {
    const { error: claimError } = await supabase.from("generation_runs").insert({
      brand_id: brand.id,
      user_id: brand.user_id,
      run_date: runDate,
      requested,
    });

    // 23505 = unique violation: today's batch already ran.
    if (claimError) {
      if (claimError.code === "23505") {
        return { ...result, skipped: "already ran today" };
      }
      throw new Error(claimError.message);
    }
  }

  for (let i = 0; i < requested; i++) {
    try {
      const carouselId = await createCarousel(brand);
      result.created.push(carouselId);

      if (brand.auto_publish) {
        const outcomes = await publishCarousel(carouselId);
        result.published += outcomes.filter(
          (o) => o.status === "published"
        ).length;
        result.errors.push(
          ...outcomes
            .filter((o) => o.status === "failed")
            .map((o) => `${o.platform}: ${o.error}`)
        );
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  await supabase
    .from("generation_runs")
    .update({
      created_count: result.created.length,
      status: result.errors.length ? "partial" : "ok",
      error: result.errors.join(" | ") || null,
    })
    .eq("brand_id", brand.id)
    .eq("run_date", runDate);

  return result;
};

/**
 * Cron entry point. Runs every brand whose local clock has reached its
 * posting hour today. Safe to call hourly.
 */
export const runDueBrands = async (): Promise<BrandRunResult[]> => {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .eq("autopilot", true);

  if (error) throw new Error(error.message);

  const results: BrandRunResult[] = [];

  for (const brand of (data ?? []) as Brand[]) {
    if (localHour(brand.timezone) < brand.post_hour) continue;

    // No session here, so this reads the webhook-maintained mirror rather than
    // a plan claim. A brand left on autopilot after a subscription lapsed is
    // skipped rather than silently generating: it is recorded as the skip
    // reason so the dashboard can say why nothing ran.
    const { tier } = await entitlementForUser(brand.user_id);

    if (!tier.limits.autopilot) {
      results.push({
        brandId: brand.id,
        created: [],
        published: 0,
        skipped: "no active subscription",
        errors: [],
      });
      continue;
    }

    try {
      results.push(await runBrandDaily(brand, { limit: tier.limits.postsPerDay }));
    } catch (err) {
      results.push({
        brandId: brand.id,
        created: [],
        published: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  return results;
};
