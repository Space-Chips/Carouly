/**
 * The complete look of a carousel — palette, tone and hook-image style.
 * See lib/presets.ts.
 */
export type PresetId =
  | "grain"
  | "nocturne"
  | "bleach"
  | "atlas"
  | "signal"
  | "ember";

export type Platform =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "linkedin"
  | "x"
  | "manual";

export type Brand = {
  id: string;
  created_at: string;
  user_id: string;
  name: string;
  product_description: string;
  domain: string;
  audience: string | null;
  differentiator: string | null;
  website_url: string | null;
  bio_link_label: string | null;
  handle: string | null;
  /** Logo or profile picture. One field on purpose — the slide draws either. */
  logo_url: string | null;
  preset: PresetId;
  posts_per_day: number;
  post_hour: number;
  timezone: string;
  autopilot: boolean;
  auto_publish: boolean;
};

export type Keyword = {
  id: string;
  created_at: string;
  brand_id: string;
  user_id: string;
  keyword: string;
  angle: string | null;
  intent: string | null;
  /** Model-guessed monthly volume. Only meaningful on `source: "llm"` rows. */
  volume: number;
  /** 0-100 signal derived from real search autocomplete. Not volume. */
  demand: number;
  source: "llm" | "autocomplete";
  difficulty: number;
  relevance: number;
  score: number;
  /** new = awaiting review · approved = queued for autopilot */
  status: "new" | "approved" | "used" | "archived";
  used_at: string | null;
};

export type SlideKind = "hook" | "insight" | "cta";

export type Slide = {
  id: string;
  carousel_id: string;
  user_id: string;
  position: number;
  kind: SlideKind;
  heading: string;
  body: string | null;
  footnote: string | null;
  image_url: string | null;
};

export type CarouselStatus =
  | "draft"
  | "ready"
  | "publishing"
  | "published"
  | "failed";

export type Carousel = {
  id: string;
  created_at: string;
  brand_id: string;
  user_id: string;
  keyword_id: string | null;
  keyword_text: string | null;
  preset: PresetId;
  title: string;
  caption: string | null;
  hashtags: string[];
  hook_image_url: string | null;
  status: CarouselStatus;
  scheduled_for: string | null;
  published_at: string | null;
  error: string | null;
};

export type CarouselWithSlides = Carousel & { slides: Slide[] };

export type SocialConnection = {
  id: string;
  brand_id: string;
  user_id: string;
  platform: Platform;
  account_label: string | null;
  /** @handle as the platform reports it. Populated by OAuth connections. */
  account_handle: string | null;
  /** The platform's own id for the account (IG user id, TikTok open_id). */
  external_account_id: string | null;
  avatar_url: string | null;
  /** Scopes the user actually granted — publishing adapts to what is there. */
  scopes: string[];
  /** When the stored access token dies. Null for credentials that don't expire. */
  expires_at: string | null;
  /** Set when a refresh failed: the UI shows "Reconnect" instead of "Connected". */
  needs_reauth: boolean;
  enabled: boolean;
  credentials: string | null;
};

export type Post = {
  id: string;
  created_at: string;
  carousel_id: string;
  brand_id: string;
  user_id: string;
  platform: Platform;
  status: "pending" | "published" | "failed" | "skipped";
  external_id: string | null;
  permalink: string | null;
  error: string | null;
  posted_at: string | null;
};

/** What the LLM is asked to return for a single carousel. */
export type GeneratedCarousel = {
  title: string;
  caption: string;
  hashtags: string[];
  hook_image_prompt: string;
  slides: {
    kind: SlideKind;
    heading: string;
    body?: string;
    footnote?: string;
  }[];
};

/** What the LLM is asked to return for each keyword in the bank. */
export type GeneratedKeyword = {
  keyword: string;
  angle: string;
  intent: string;
  volume: number;
  difficulty: number;
  relevance: number;
};
