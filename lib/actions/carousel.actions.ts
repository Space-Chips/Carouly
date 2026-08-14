"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { charge } from "@/lib/credits/ledger";
import { CAROUSEL_COST } from "@/lib/credits/prices";
import { createCarousel, runBrandDaily } from "@/lib/pipeline";
import { renderCarouselAssets } from "@/lib/render";
import { publishCarousel } from "@/lib/social";
import { describeDbError } from "@/lib/setup";
import { createSupabaseClient } from "@/lib/supabase";
import { Carousel, CarouselWithSlides, Post, Slide } from "@/types";

import { requireBrand } from "./brand.actions";

const requireUser = async () => {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
};

/**
 * Ownership gate for every action that hands a carousel id to the pipeline.
 * The pipeline runs as service-role, so this read (which does go through RLS)
 * is what proves the caller owns the row.
 */
const assertOwnsCarousel = async (carouselId: string) => {
  const userId = await requireUser();
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("carousels")
    .select("id")
    .eq("id", carouselId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Post not found.");
};

export const getCarousels = async (): Promise<Carousel[]> => {
  const userId = await requireUser();
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("carousels")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw describeDbError(error);

  return (data ?? []) as Carousel[];
};

export const getCarousel = async (
  carouselId: string
): Promise<(CarouselWithSlides & { posts: Post[] }) | null> => {
  const userId = await requireUser();
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("carousels")
    .select("*, slides(*), posts(*)")
    .eq("id", carouselId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    ...(data as CarouselWithSlides & { posts: Post[] }),
    slides: ([...(data.slides ?? [])] as Slide[]).sort(
      (a, b) => a.position - b.position
    ),
  };
};

/** Generates a single carousel on demand, optionally from a chosen keyword. */
export const generateCarouselNow = async (keywordId?: string) => {
  const userId = await requireUser();

  // Before the brand read, not after: generation costs a model call and an
  // image render, so somebody who cannot afford it should be turned away for
  // free rather than after two round trips.
  await charge({
    userId,
    amount: CAROUSEL_COST,
    gate: "carousel",
    operation: "carousel",
  });

  const brand = await requireBrand();
  const carouselId = await createCarousel(brand, { keywordId });

  revalidatePath("/dashboard");
  revalidatePath("/carousels");

  return { carouselId };
};

/**
 * Runs today's whole batch immediately, ignoring the schedule.
 *
 * The batch charges per carousel inside the pipeline as each one is written,
 * rather than for the whole run up front. A batch of five that runs dry after
 * three has produced three carousels and been paid for three, which is the only
 * arithmetic anybody would accept.
 */
export const runTodayNow = async () => {
  await requireUser();

  const brand = await requireBrand();
  const result = await runBrandDaily(brand, { force: true });

  revalidatePath("/dashboard");
  revalidatePath("/carousels");

  return result;
};

/**
 * Posting is free.
 *
 * It used to be the thing a plan bought, which made sense when a plan was the
 * product. Under credits the rule is simpler and easier to defend: you pay for
 * what costs us money to make, and handing a finished PNG to Instagram costs an
 * API call. Charging for it twice — once to write it, once to post it — is a
 * toll booth, not a price.
 */
export const publishNow = async (carouselId: string) => {
  await assertOwnsCarousel(carouselId);

  const outcomes = await publishCarousel(carouselId);

  revalidatePath("/carousels");
  revalidatePath(`/carousels/${carouselId}`);

  return outcomes;
};

/** Re-renders the PNGs, e.g. after editing slide copy. */
export const rerenderCarousel = async (carouselId: string) => {
  await assertOwnsCarousel(carouselId);
  await renderCarouselAssets(carouselId);

  revalidatePath(`/carousels/${carouselId}`);
};

export const updateSlide = async (
  slideId: string,
  values: { heading: string; body?: string; footnote?: string }
) => {
  const userId = await requireUser();
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("slides")
    .update({
      heading: values.heading.trim(),
      body: values.body?.trim() || null,
      footnote: values.footnote?.trim() || null,
    })
    .eq("id", slideId)
    .eq("user_id", userId)
    .select("carousel_id")
    .single();

  if (error) throw new Error(error.message);

  await renderCarouselAssets(data.carousel_id);

  revalidatePath(`/carousels/${data.carousel_id}`);
};

export const deleteCarousel = async (carouselId: string) => {
  const userId = await requireUser();
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from("carousels")
    .delete()
    .eq("id", carouselId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  revalidatePath("/carousels");
  revalidatePath("/dashboard");
};
