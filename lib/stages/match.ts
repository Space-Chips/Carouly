/**
 * Stage 4 — template matching.
 *
 * Deterministic scoring, then one cheap model call to pair concepts to
 * templates and say why. Scoring beats a model at the ranking itself because the
 * signal really is literal tag overlap between the brand's match profile and
 * each template's `match` block — and a score you can explain in a tooltip is
 * worth more here than a slightly better score you cannot.
 */

import { json as llmJson, MODEL } from "@/lib/agent/llm";
import type { BrandKit } from "@/lib/stages/brand";
import { TEMPLATES } from "@/lib/templates";
import { previewFor } from "@/lib/templates/previews";
import type { TemplateCandidate } from "@/lib/agent/events";
import type { Workflow } from "@/lib/workflow/graph";

/**
 * Weights, in the order a director would actually argue them. The creative
 * format is the decision; the tone and the setting are how you'd break a tie.
 */
const WEIGHTS: Record<string, number> = {
  creative_format: 3,
  preferred_types: 2,
  tone: 1.5,
  funnel_stage: 1,
  settings: 1,
};

const tags = (value: unknown): string[] => {
  if (typeof value === "string") return [value.toLowerCase().trim()];
  if (Array.isArray(value)) return value.map((item) => String(item).toLowerCase().trim());
  return [];
};

const tokens = (tag: string) =>
  new Set(tag.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));

/**
 * 1.0 exact, up to 0.6 on token overlap, 0 otherwise.
 *
 * Models will not reproduce a controlled vocabulary exactly — they write "demo"
 * where a template says "product-demo". Exact set intersection throws those
 * away: on the reference brand it scored 5/1/1 across the library, where this
 * scores 15/13/10. A matcher that only fires on perfect strings looks broken.
 */
export const similarity = (a: string, b: string) => {
  if (a === b) return 1;

  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;

  const overlap = [...left].filter((token) => right.has(token)).length;
  if (!overlap) return 0;

  return 0.6 * (overlap / Math.min(left.size, right.size));
};

export const scoreTemplate = (
  profile: Record<string, unknown>,
  template: Workflow
) => {
  let total = 0;
  const reasons: string[] = [];

  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const brandTags = tags(profile[key]);
    const templateTags = tags(template.match[key]);
    if (!brandTags.length || !templateTags.length) continue;

    const hits: string[] = [];

    for (const brandTag of brandTags) {
      let best = 0;
      let bestTag = "";

      for (const templateTag of templateTags) {
        const score = similarity(brandTag, templateTag);
        if (score > best) {
          best = score;
          bestTag = templateTag;
        }
      }

      if (best > 0) {
        total += weight * best;
        hits.push(best === 1 ? brandTag : `${brandTag} ≈ ${bestTag}`);
      }
    }

    if (hits.length) reasons.push(`${key.replace(/_/g, " ")}: ${hits.sort().join(", ")}`);
  }

  return { score: Math.round(total * 100) / 100, reasons };
};

export const rank = (brand: BrandKit): TemplateCandidate[] => {
  const profile = brand.template_matching_profile ?? {};

  const scored = TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    aspect: template.aspect,
    durationRange: template.durationRange,
    // The example this template made of itself, if one has been rendered.
    preview: previewFor(template.id)?.preview,
    still: previewFor(template.id)?.still,
    previewSilent: previewFor(template.id)?.silent === true,
    ...scoreTemplate(profile, template),
  })).sort((a, b) => b.score - a.score);

  /**
   * A percentage against the best match, not against a theoretical maximum.
   *
   * The raw score has no ceiling — it is a weighted sum over however many tags a
   * brand's profile happens to carry — so "15.4" means nothing on a card and
   * cannot be compared between two brands. What a person actually wants to know
   * is the shape of the field: whether the third option is nearly as good as the
   * first, or a long way behind it. Relative fit says that; an absolute number
   * dressed as a percentage would be a fiction with a % sign on it.
   */
  const best = scored[0]?.score ?? 0;

  return scored.map((candidate) => ({
    ...candidate,
    fit: best > 0 ? Math.round((candidate.score / best) * 100) : undefined,
  }));
};

/** How many the agent recommends, out of however many the library holds. */
const RECOMMEND = 3;
/** How far down the ranking the model is allowed to reach when recommending. */
const POOL = 6;

/**
 * Rank the whole library, then recommend a few of them for this brand.
 *
 * The split is the point. Scoring is tag overlap and it is honest about being
 * that; recommending is the judgement on top — which of the six plausible
 * formats actually suits a company that sells scaffolding to contractors, and
 * which idea belongs on each one. Only the second part needs a model, and only
 * the second part can be wrong in an interesting way, so it is the only part
 * that gets a call.
 *
 * Everything the model touches is optional. A failed call, a hallucinated id, a
 * short list — each degrades to score order with the tag reasons as the
 * explanation, because a shortlist derived from real overlap is a defensible
 * answer and a failed run is not.
 */
export const matchTemplates = async (brand: BrandKit) => {
  const ranked = rank(brand);
  const concepts = brand.video_concepts ?? [];
  const pool = ranked.slice(0, POOL);

  /** Score order, marked up, for when there is nothing better to say. */
  const byScore = () =>
    pool.slice(0, RECOMMEND).map((template, index) => ({
      ...template,
      recommended: true,
      concept: template.concept ?? concepts[index % Math.max(concepts.length, 1)]?.title,
      why: template.why ?? template.reasons[0] ?? "closest match to the brand profile",
    }));

  if (!concepts.length || !pool.length) {
    return { ranked, shortlist: byScore(), all: ranked };
  }

  try {
    const picked = await llmJson<{
      picks: { template_id: string; concept_title: string; why: string }[];
    }>({
      system:
        "You are a creative director choosing which ad formats to put in front of a client. " +
        "You pick the few that fit this specific business and say why in the client's own terms. " +
        "Answer only with JSON.",
      prompt: `Brand: ${brand.brand_name} — ${(brand.brand_summary ?? "").slice(0, 600)}
Voice: ${brand.voice_tone}
Sells: ${JSON.stringify((brand.products ?? []).map((product) => product.name)).slice(0, 300)}
Customers: ${JSON.stringify(
        (brand.target_personas ?? []).map((persona) => persona.name)
      ).slice(0, 300)}

THEIR VIDEO IDEAS:
${JSON.stringify(
  concepts.map((concept) => ({
    title: concept.title,
    format: concept.format,
    hook: concept.hook,
  })),
  null,
  1
)}

FORMATS AVAILABLE (already filtered to the plausible ones, best tag match first):
${JSON.stringify(
  pool.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    seconds: template.durationRange,
  })),
  null,
  1
)}

Choose the ${RECOMMEND} formats you would actually shoot for this business, best first. For each:
- template_id: from the list above, never invented, never repeated
- concept_title: which of their ideas you would shoot in it
- why: at most 18 words, about THIS business — what it sells, who buys it, how it talks. Never describe the format back to them, and never use the word "perfect".`,
      schema: { picks: [{ template_id: "", concept_title: "", why: "" }] },
      model: MODEL.synth,
      maxTokens: 1200,
      attempts: 2,
    });

    const byId = new Map(pool.map((template) => [template.id, template]));
    const titles = new Set(concepts.map((concept) => concept.title));
    const shortlist: TemplateCandidate[] = [];

    for (const pick of picked.picks ?? []) {
      const template = byId.get(pick.template_id);
      // A hallucinated or duplicated id is dropped rather than substituted: the
      // fill below is honest about being score order, whereas quietly swapping
      // in a different format would attach the model's reasoning to a template
      // it never reasoned about.
      if (!template || shortlist.some((entry) => entry.id === template.id)) continue;

      shortlist.push({
        ...template,
        recommended: true,
        why: pick.why,
        concept: titles.has(pick.concept_title)
          ? pick.concept_title
          : concepts[shortlist.length % concepts.length].title,
      });

      if (shortlist.length === RECOMMEND) break;
    }

    // Short answers get topped up from the ranking rather than re-asked.
    for (const template of pool) {
      if (shortlist.length >= RECOMMEND) break;
      if (shortlist.some((entry) => entry.id === template.id)) continue;

      shortlist.push({
        ...template,
        recommended: true,
        concept: concepts[shortlist.length % concepts.length].title,
        why: template.reasons[0] ?? "closest match to the brand profile",
      });
    }

    return { ranked, shortlist, all: ranked };
  } catch {
    return { ranked, shortlist: byScore(), all: ranked };
  }
};
