import { ImageResponse } from "next/og";

import SlideArt, {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  SlideArtProps,
} from "@/components/SlideArt";
import { loadFonts } from "@/lib/fonts";
import { getPreset } from "@/lib/presets";
import { createSupabaseAdminClient, uploadAsset } from "@/lib/supabase";
import { Brand, Carousel, Slide } from "@/types";

/** Rasterises one slide to PNG bytes. */
export const renderSlidePng = async (
  props: SlideArtProps
): Promise<Uint8Array> => {
  const image = new ImageResponse(<SlideArt {...props} />, {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    fonts: await loadFonts(),
  });

  return new Uint8Array(await image.arrayBuffer());
};

export const slideArtProps = (
  slide: Pick<Slide, "kind" | "heading" | "body" | "footnote" | "position">,
  carousel: Pick<Carousel, "preset" | "hook_image_url">,
  brand: Pick<Brand, "name" | "handle" | "logo_url">,
  total: number,
  backgroundUrl?: string | null,
  logoUrl?: string | null
): SlideArtProps => ({
  preset: getPreset(carousel.preset),
  kind: slide.kind,
  heading: slide.heading,
  body: slide.body,
  footnote: slide.footnote,
  index: slide.position,
  total,
  brandName: brand.name,
  handle: brand.handle,
  backgroundUrl: backgroundUrl ?? carousel.hook_image_url,
  logoUrl: logoUrl ?? brand.logo_url,
});

/**
 * Pulls a remote image down and inlines it as a data URI.
 *
 * satori fetches remote <img> sources itself, and a slow or failed fetch
 * throws out of the whole ImageResponse — losing the entire carousel because
 * one background or one logo was unavailable. Fetching it here means we can
 * time out, fall back to drawing without it, and still ship the carousel.
 */
export const inlineImage = async (
  url: string | null
): Promise<string | null> => {
  if (!url) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) throw new Error(`status ${response.status}`);

    const contentType = response.headers.get("content-type") ?? "image/png";
    const base64 = Buffer.from(await response.arrayBuffer()).toString("base64");

    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error("[render] image unavailable, rendering without it:", error);
    return null;
  }
};

/**
 * Renders every slide of a carousel, uploads the PNGs to public storage and
 * writes the URLs back. Publishing needs public URLs — Instagram, LinkedIn
 * and X all fetch the image server-side rather than accepting an upload from
 * the browser.
 */
export const renderCarouselAssets = async (carouselId: string) => {
  const supabase = createSupabaseAdminClient();

  const { data: carousel, error } = await supabase
    .from("carousels")
    .select("*, brands(*), slides(*)")
    .eq("id", carouselId)
    .single();

  if (error) throw new Error(error.message);

  const brand = carousel.brands as Brand;
  const slides = ([...(carousel.slides ?? [])] as Slide[]).sort(
    (a, b) => a.position - b.position
  );

  // Both fetched once rather than once per slide. The background is only used
  // by the hook slide; the logo is on the top rail of every one of them.
  const [background, logo] = await Promise.all([
    inlineImage(carousel.hook_image_url),
    inlineImage(brand.logo_url),
  ]);

  const urls: string[] = [];

  for (const slide of slides) {
    const bytes = await renderSlidePng(
      slideArtProps(slide, carousel, brand, slides.length, background, logo)
    );

    const url = await uploadAsset(
      `${brand.user_id}/${carouselId}/slide-${slide.position}.png`,
      bytes,
      "image/png"
    );

    const { error: updateError } = await supabase
      .from("slides")
      .update({ image_url: url })
      .eq("id", slide.id);

    if (updateError) throw new Error(updateError.message);

    urls.push(url);
  }

  await supabase
    .from("carousels")
    .update({ status: "ready", error: null })
    .eq("id", carouselId);

  return urls;
};
