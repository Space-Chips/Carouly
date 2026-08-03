import { completeJson } from "@/lib/openrouter";
import { getPreset } from "@/lib/presets";
import { normaliseKeyword } from "@/lib/keywords";

import { Brand, GeneratedCarousel, GeneratedKeyword, Keyword } from "@/types";

/**
 * All LLM prompting lives here. Two jobs:
 *   1. produce seed topics for search-suggestion research (a small, fast call)
 *   2. turn one keyword into a finished carousel
 *
 * Notably NOT a job: scoring keywords. Demand and competition are computed
 * from measured search data in lib/keywords.ts, and which keywords are worth
 * writing is the user's call. A model's guessed "difficulty 0-100" is the same
 * class of fabrication as a guessed search volume.
 */

const brandBrief = (brand: Brand) =>
  [
    `Brand: ${brand.name}`,
    `Product: ${brand.product_description}`,
    `Domain / niche: ${brand.domain}`,
    brand.audience ? `Audience: ${brand.audience}` : null,
    brand.differentiator ? `What makes it different: ${brand.differentiator}` : null,
    brand.handle ? `Social handle: ${brand.handle}` : null,
  ]
    .filter(Boolean)
    .join("\n");

// ------------------------------------------------------------- keywords ---

/**
 * One retry on transient model failures (truncated JSON, a 5xx from the
 * provider). Keyword research is a user-visible button, so a single flake
 * should not surface as an error.
 */
const withRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    console.warn("[generator] retrying after:", error);
    return fn();
  }
};

const SEED_SYSTEM = `You produce short seed topics for search-suggestion research.

A seed is a bare noun phrase a person would start typing into a search box — 2 to 4 words, no punctuation, no questions, no brand names. It must be broad enough that autocomplete has many completions for it.

Return ONLY: {"seeds":["...","..."]}`;

/**
 * Step 1 — a small, fast call. We only need the *vocabulary* of the domain;
 * the actual phrases come from autocomplete, which knows what people type far
 * better than a language model's recollection does.
 */
export const generateSeedTopics = async (
  brand: Brand,
  count = 8
): Promise<string[]> => {
  const data = await withRetry(() =>
    completeJson<{ seeds: string[] }>({
      system: SEED_SYSTEM,
      prompt: `${brandBrief(brand)}

Give ${count} seed topics inside "${brand.domain}" that this audience would search about. Cover different sub-areas of the domain rather than rephrasing one idea.`,
      maxTokens: 500,
    })
  );

  return (data.seeds ?? [])
    .map((seed) => seed.trim().toLowerCase())
    .filter((seed) => seed.length > 2)
    .slice(0, count);
};

const KEYWORD_SYSTEM = `You are an SEO and content strategist who builds keyword banks for social carousels.

You estimate three numbers per keyword and you are honest about them:
- volume: estimated monthly global search volume (integer). Long-tail phrases are usually 50-2000; head terms 10000+.
- difficulty: 0-100, how hard it is to stand out on this topic. Saturated, big-brand-dominated topics score high.
- relevance: 0-100, how naturally an audience searching this would care about the described product.

Return ONLY a JSON object of the form:
{"keywords":[{"keyword":"...","angle":"...","intent":"informational|commercial|transactional","volume":0,"difficulty":0,"relevance":0}]}

"angle" is one sentence describing the specific, concrete, useful insight a carousel on this keyword should teach. It must be genuinely useful on its own and must NOT be about the product.`;

/**
 * Fallback path: the model invents the phrases as well as the scores. Used
 * only when autocomplete returns nothing (blocked egress, rate limiting), so
 * research degrades instead of failing.
 */
export const buildKeywordBank = async (
  brand: Brand,
  count = 25
): Promise<ReturnType<typeof normaliseKeyword>[]> => {
  const prompt = `${brandBrief(brand)}

Produce ${count} keywords in the ${brand.domain} domain that this brand's audience would search for.

Rules:
- Favour specific, long-tail, low-to-medium difficulty topics over head terms.
- Every keyword must be a topic where a 3-slide carousel can deliver real value: a habit, a tactic, a mistake to avoid, a rule of thumb, a counter-intuitive insight.
- No keyword may be about the brand, the product, or a competitor.
- No duplicates or near-duplicates.`;

  const data = await completeJson<{ keywords: GeneratedKeyword[] }>({
    system: KEYWORD_SYSTEM,
    prompt,
    maxTokens: 6000,
  });

  const seen = new Set<string>();

  return (data.keywords ?? [])
    .filter((k) => k?.keyword?.trim())
    .map(normaliseKeyword)
    .filter((k) => {
      if (seen.has(k.keyword)) return false;
      seen.add(k.keyword);
      return true;
    });
};

// ------------------------------------------------------------- carousel ---

const carouselSystem = (brand: Brand) => {
  const preset = getPreset(brand.preset);

  return `You write short-form social carousels that teach something useful and convert at the end.

TONE: ${preset.tone}

STRUCTURE — exactly 4 slides, in this order:
1. kind "hook": a scroll-stopping headline (max 9 words). No body text needed; a short body line of at most 12 words is allowed.
2. kind "insight": the core idea. heading max 7 words, body max 40 words.
3. kind "insight": how to apply it, or the nuance most people miss. heading max 7 words, body max 40 words.
4. kind "cta": the conversion slide for ${brand.name}.

CTA SLIDE RULES (important):
- heading is the payoff line connecting the tip to the product, max 12 words.
- body: one sentence, max 25 words, describing what ${brand.name} does.
- footnote: MUST make the brand obvious and point at the bio link. Never say "link in the description" or "swipe up" — say something like "${brand.handle ?? brand.name} — ${brand.bio_link_label ?? "link in bio"}".
- Never use a URL on the slide itself.

VALUE RULES:
- Slides 1-3 must stand alone as genuinely useful content. Do not mention the product, the brand, or "our tool" anywhere in slides 1-3.
- Be concrete. Numbers, specifics and named tactics beat abstractions.
- No emoji anywhere. No hashtags inside slide text.

ALSO RETURN:
- "caption": the post caption, 2-4 sentences, ending with a soft mention that the link is in the bio.
- "hashtags": 5-8 lowercase hashtags without the # symbol.
- "hook_image_prompt": a vivid, literal description of a photographic scene for the first slide's background. Describe subject, setting and lighting only. No text, no words, no logos, no people's faces in focus. Do not describe visual style — style is applied automatically.

Return ONLY JSON:
{"title":"...","caption":"...","hashtags":["..."],"hook_image_prompt":"...","slides":[{"kind":"hook","heading":"...","body":"..."},{"kind":"insight","heading":"...","body":"..."},{"kind":"insight","heading":"...","body":"..."},{"kind":"cta","heading":"...","body":"...","footnote":"..."}]}`;
};

export const writeCarousel = async (
  brand: Brand,
  keyword: Pick<Keyword, "keyword" | "angle">
): Promise<GeneratedCarousel> => {
  // The angle is normally chosen here rather than at research time: it is
  // only needed for the one keyword being written, and deriving 60 of them up
  // front meant generating text that was thrown away or went stale.
  const prompt = `${brandBrief(brand)}

Keyword to build this carousel around: "${keyword.keyword}"
${
  keyword.angle
    ? `Angle to take: ${keyword.angle}`
    : `Decide the angle yourself: pick the single most concrete, useful insight someone searching this phrase would want, and build the carousel around it.`
}

Write the carousel.`;

  const generated = await completeJson<GeneratedCarousel>({
    system: carouselSystem(brand),
    prompt,
    maxTokens: 2500,
  });

  return sanitiseCarousel(generated, brand);
};

/**
 * The model is well-behaved most of the time, but a carousel that publishes
 * itself has no human in the loop — so the shape is enforced here rather than
 * trusted. A missing CTA slide is the failure that would actually cost money.
 */
const sanitiseCarousel = (
  generated: GeneratedCarousel,
  brand: Brand
): GeneratedCarousel => {
  const slides = (generated.slides ?? [])
    .filter((s) => s?.heading?.trim())
    .slice(0, 4)
    .map((s) => ({
      kind: s.kind,
      heading: s.heading.trim(),
      body: s.body?.trim() || undefined,
      footnote: s.footnote?.trim() || undefined,
    }));

  if (slides.length < 3) {
    throw new Error("Model returned fewer than 3 usable slides.");
  }

  const fallbackFootnote = `${brand.handle ?? brand.name} — ${
    brand.bio_link_label ?? "link in bio"
  }`;

  const last = slides[slides.length - 1];

  if (last.kind !== "cta") {
    slides.push({
      kind: "cta",
      heading: `Built into ${brand.name}`,
      body: brand.product_description.slice(0, 160),
      footnote: fallbackFootnote,
    });
  } else if (!last.footnote) {
    last.footnote = fallbackFootnote;
  }

  return {
    title: generated.title?.trim() || slides[0].heading,
    caption: generated.caption?.trim() || "",
    hashtags: (generated.hashtags ?? [])
      .map((h) => h.replace(/^#/, "").trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8),
    hook_image_prompt: generated.hook_image_prompt?.trim() || "",
    slides,
  };
};

/**
 * Combines the scene description with the preset's image style.
 *
 * The 4:5 framing is fixed rather than part of the preset: it has to match the
 * slide the image sits behind, so it is not a stylistic choice.
 */
export const hookImagePrompt = (scene: string, presetId: string): string => {
  const preset = getPreset(presetId);

  return [
    scene,
    preset.imageStyle,
    "no text, no letters, no logos, no watermarks",
    "vertical 4:5 composition, negative space in the lower half",
  ]
    .filter(Boolean)
    .join(", ");
};
