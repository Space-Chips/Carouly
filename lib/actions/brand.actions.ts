"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { isPresetId } from "@/lib/presets";
import { describeDbError } from "@/lib/setup";
import { createSupabaseClient, uploadAsset } from "@/lib/supabase";
import { Brand } from "@/types";

const requireUser = async () => {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
};

export const getBrand = async (): Promise<Brand | null> => {
  const userId = await requireUser();
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw describeDbError(error);

  return (data as Brand | null) ?? null;
};

/** Throws rather than returning null — for pages that cannot render without a brand. */
export const requireBrand = async (): Promise<Brand> => {
  const brand = await getBrand();
  if (!brand) throw new Error("No brand configured yet.");
  return brand;
};

/**
 * What the slide renderer can actually draw. satori reads the image header to
 * size it, and there is no image-conversion dependency here to fall back on,
 * so an unsupported file has to be refused at the door rather than discovered
 * as a failed render three slides into a carousel.
 *
 * WebP is deliberately absent: satori throws on it ("u2 is not iterable"),
 * which is exactly the late failure this list exists to prevent.
 */
const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export type BrandFormValues = {
  name: string;
  product_description: string;
  domain: string;
  audience?: string;
  differentiator?: string;
  website_url?: string;
  handle?: string;
  bio_link_label?: string;
  /**
   * Only written when the caller passes it. Omitted means "leave whatever is
   * stored alone" — this upserts the whole row, and the brand form has no
   * business clearing a logo it never sent.
   */
  logo_url?: string | null;
  posts_per_day?: number;
  post_hour?: number;
  timezone?: string;
  autopilot?: boolean;
  auto_publish?: boolean;
};

export const saveBrand = async (values: BrandFormValues): Promise<Brand> => {
  const userId = await requireUser();
  const supabase = createSupabaseClient();

  if (!values.name?.trim() || !values.product_description?.trim() || !values.domain?.trim()) {
    throw new Error("Brand name, product description and domain are required.");
  }

  const payload = {
    user_id: userId,
    name: values.name.trim(),
    product_description: values.product_description.trim(),
    domain: values.domain.trim(),
    audience: values.audience?.trim() || null,
    differentiator: values.differentiator?.trim() || null,
    website_url: values.website_url?.trim() || null,
    handle: values.handle?.trim() || null,
    bio_link_label: values.bio_link_label?.trim() || "link in bio",
    ...(values.logo_url !== undefined
      ? { logo_url: values.logo_url?.trim() || null }
      : {}),
    // `preset` is deliberately absent: this upserts the whole row, so listing
    // it here would reset the chosen look on every unrelated brand edit. New
    // rows pick it up from the column default. See `updatePreset`.
    posts_per_day: clamp(values.posts_per_day ?? 1, 1, 5),
    post_hour: clamp(values.post_hour ?? 9, 0, 23),
    timezone: values.timezone?.trim() || "UTC",
    // Neither switch is gated any more. Under credits there is nothing to gate
    // them with: autopilot spends credits when it writes something, and it stops
    // when there are none, which is a better guarantee than a tier flag ever was
    // — a lapsed plan left the schedule on and silently produced nothing.
    autopilot: values.autopilot ?? false,
    auto_publish: values.auto_publish ?? false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("brands")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();

  if (error) throw describeDbError(error);

  revalidatePath("/dashboard");
  revalidatePath("/settings");

  return data as Brand;
};

/**
 * Stores a logo or a profile picture — the product does not distinguish
 * between them, and neither does the slide that draws it.
 *
 * Runs on selection rather than on submit so onboarding can show the file
 * back immediately, and so the brand row does not have to exist yet: the
 * returned URL is carried into `saveBrand` on the first run, and written
 * straight to the row on every later one.
 *
 * The stored name carries a timestamp because the URL is public and cached —
 * upserting a fixed path leaves the old picture on screen after a change.
 */
export const uploadBrandLogo = async (formData: FormData): Promise<string> => {
  const userId = await requireUser();

  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("No image was selected.");
  }

  const extension = LOGO_TYPES[file.type];

  if (!extension) {
    throw new Error("Use a PNG or JPEG image.");
  }

  if (file.size > LOGO_MAX_BYTES) {
    throw new Error("That image is over 2 MB. Use a smaller one.");
  }

  const url = await uploadAsset(
    `${userId}/brand/logo-${Date.now()}.${extension}`,
    await file.arrayBuffer(),
    file.type
  );

  const supabase = createSupabaseClient();

  // No-op until onboarding creates the row, which is why the caller also
  // carries the URL into `saveBrand`.
  const { error } = await supabase
    .from("brands")
    .update({ logo_url: url, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) throw describeDbError(error);

  revalidatePath("/settings");
  revalidatePath("/dashboard");

  return url;
};

/**
 * Deliberately not part of `saveBrand`: that upserts the whole row, so folding
 * the preset in would reset it every time someone edited an unrelated brand
 * field. An unknown id is rejected rather than defaulted — silently storing
 * something else would look like the click did not register.
 */
export const updatePreset = async (preset: string): Promise<void> => {
  const userId = await requireUser();
  const supabase = createSupabaseClient();

  if (!isPresetId(preset)) throw new Error(`Unknown preset "${preset}".`);

  const { error } = await supabase
    .from("brands")
    .update({ preset, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) throw describeDbError(error);

  revalidatePath("/settings");
};

export const updateSchedule = async (values: {
  posts_per_day: number;
  post_hour: number;
  timezone: string;
  autopilot: boolean;
  auto_publish: boolean;
}) => {
  const userId = await requireUser();
  const supabase = createSupabaseClient();

  /**
   * Nothing here is refused any more.
   *
   * Every switch on this form used to be a plan gate, and each one had to be
   * enforced twice — hidden in the UI and rejected here, because the form posts
   * a plain object and anybody can post their own. A meter needs neither: the
   * schedule is free to set, and what it does costs credits when it runs. The
   * cap on volume is the column's own constraint rather than a tier's.
   */
  const perDay = clamp(values.posts_per_day, 1, 5);

  const { error } = await supabase
    .from("brands")
    .update({
      posts_per_day: perDay,
      post_hour: clamp(values.post_hour, 0, 23),
      timezone: values.timezone || "UTC",
      autopilot: values.autopilot,
      auto_publish: values.auto_publish,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/settings");
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(Number(n) || min)));
