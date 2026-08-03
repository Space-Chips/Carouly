import { createSupabaseAdminClient } from "@/lib/supabase";
import { Brand, Carousel, Platform, Slide, SocialConnection } from "@/types";

import { ensureFreshCredentials } from "./oauth";
import { getAdapter } from "./registry";
import { PublishPayload } from "./types";

export type PublishOutcome = {
  platform: Platform;
  status: "published" | "failed" | "skipped";
  permalink?: string;
  error?: string;
};

/**
 * Publishes one carousel to every enabled connection on its brand.
 *
 * Each platform is independent: one failing token must not stop the others,
 * so every result — success or failure — is recorded in `posts` and the
 * carousel is only marked failed if nothing at all went out.
 */
export const publishCarousel = async (
  carouselId: string
): Promise<PublishOutcome[]> => {
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

  const imageUrls = slides
    .map((s) => s.image_url)
    .filter((url): url is string => Boolean(url));

  if (imageUrls.length !== slides.length) {
    throw new Error(
      "Carousel has unrendered slides. Render the assets before publishing."
    );
  }

  const payload: PublishPayload = {
    imageUrls,
    caption: (carousel as Carousel).caption ?? "",
    hashtags: (carousel as Carousel).hashtags ?? [],
  };

  const { data: connections } = await supabase
    .from("social_connections")
    .select("*")
    .eq("brand_id", brand.id)
    .eq("enabled", true);

  const targets = (connections ?? []) as SocialConnection[];

  await supabase
    .from("carousels")
    .update({ status: "publishing", error: null })
    .eq("id", carouselId);

  const outcomes: PublishOutcome[] = [];

  for (const connection of targets) {
    const adapter = getAdapter(connection.platform);

    if (!adapter) {
      outcomes.push({
        platform: connection.platform,
        status: "skipped",
        error: "No adapter for this platform.",
      });
      continue;
    }

    try {
      // Renews the token first if it is close to expiring, so a connection
      // made months ago still publishes without the user touching anything.
      const credentials = await ensureFreshCredentials(connection);

      const missing = adapter.fields
        .filter((field) => !credentials[field.key])
        .map((field) => field.label);

      if (missing.length) {
        throw new Error(`Missing credentials: ${missing.join(", ")}`);
      }

      const result = await adapter.publish(credentials, payload);

      await supabase.from("posts").insert({
        carousel_id: carouselId,
        brand_id: brand.id,
        user_id: brand.user_id,
        platform: connection.platform,
        status: "published",
        external_id: result.externalId ?? null,
        permalink: result.permalink ?? null,
        posted_at: new Date().toISOString(),
      });

      outcomes.push({
        platform: connection.platform,
        status: "published",
        permalink: result.permalink,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      await supabase.from("posts").insert({
        carousel_id: carouselId,
        brand_id: brand.id,
        user_id: brand.user_id,
        platform: connection.platform,
        status: "failed",
        error: message,
      });

      outcomes.push({
        platform: connection.platform,
        status: "failed",
        error: message,
      });
    }
  }

  const anyPublished = outcomes.some((o) => o.status === "published");

  await supabase
    .from("carousels")
    .update({
      status: anyPublished ? "published" : targets.length ? "failed" : "ready",
      published_at: anyPublished ? new Date().toISOString() : null,
      error: anyPublished
        ? null
        : outcomes.find((o) => o.error)?.error ??
          (targets.length ? null : "No social connections enabled."),
    })
    .eq("id", carouselId);

  return outcomes;
};

export * from "./oauth";
export * from "./registry";
export * from "./types";
