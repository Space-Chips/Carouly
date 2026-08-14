/**
 * Stage 4b — casting.
 *
 * Between choosing a format and running it there is one decision nobody was
 * being offered: who is on camera. The run made it silently, in the casting node
 * of whichever template won, and the first anybody saw of that person was a
 * finished video. So it is a step now — ranked the same way templates are, from
 * the same brand profile, so the shelf a person is shown is already narrowed to
 * people who could plausibly be their customer.
 *
 * Deterministic scoring first, one cheap model call after, exactly as in
 * `match.ts` and for the same reason: tag overlap is the real signal, and a
 * score you can put in a tooltip beats a slightly better score you cannot. The
 * model's contribution is the sentence — "she runs a shop like yours" — which is
 * a judgement about the brand rather than an ordering problem.
 */

import { json as llmJson, MODEL } from "@/lib/agent/llm";
import { ACTOR_PRESETS, presetNote, type ActorPreset } from "@/lib/actors/presets";
import { portraitFor } from "@/lib/actors/previews";
import type { ActorCandidate, ActorIdentity } from "@/lib/agent/events";
import type { BrandKit } from "@/lib/stages/brand";
import { similarity } from "@/lib/stages/match";

/**
 * Who they are is worth three times how they sound.
 *
 * The failure this weighting is written against: every brand's profile says
 * "confident, plain-spoken", because almost every brand's does, so tone alone
 * ranks the shelf identically for a warehouse supplier and a nail salon. The
 * audience tags are the ones that actually separate them.
 */
const WEIGHTS = { audience: 3, settings: 1.5, tone: 1.5, funnel_stage: 1 };

const lower = (values: (string | undefined)[]) =>
  values.filter(Boolean).map((value) => String(value).toLowerCase().trim());

/**
 * What this brand's customers are, as tags.
 *
 * Personas are prose — "Independent cafe owners who close the till at 4pm" —
 * and the preset shelf is tagged with nouns. `similarity` already does token
 * overlap, so the honest move is to hand it the persona names and needs whole
 * and let the overlap find "cafe" and "owner" itself, rather than pretending a
 * controlled vocabulary exists on the brand side. It does not.
 */
const audienceTags = (brand: BrandKit) => [
  ...lower((brand.target_personas ?? []).map((persona) => persona.name)),
  ...lower((brand.target_personas ?? []).map((persona) => persona.demographics)),
  ...lower((brand.template_matching_profile?.preferred_types ?? []).map(String)),
];

export const scoreActor = (brand: BrandKit, preset: ActorPreset) => {
  const profile = brand.template_matching_profile ?? {};

  const sides: [keyof typeof WEIGHTS, string[], string[]][] = [
    ["audience", audienceTags(brand), preset.match.audience],
    ["settings", lower(profile.settings ?? []), preset.match.settings],
    ["tone", [...lower(profile.tone ?? []), ...lower([brand.voice_tone])], preset.match.tone],
    ["funnel_stage", lower(profile.funnel_stage ?? []), preset.match.funnel_stage ?? []],
  ];

  let total = 0;
  const reasons: string[] = [];

  for (const [key, brandTags, presetTags] of sides) {
    if (!brandTags.length || !presetTags.length) continue;

    const hits: string[] = [];

    for (const brandTag of brandTags) {
      let best = 0;
      let bestTag = "";

      for (const presetTag of presetTags) {
        const score = similarity(brandTag, presetTag);
        if (score > best) {
          best = score;
          bestTag = presetTag;
        }
      }

      if (best > 0) {
        total += WEIGHTS[key] * best;
        hits.push(best === 1 ? bestTag : `${bestTag} ≈ ${brandTag.slice(0, 40)}`);
      }
    }

    if (hits.length) {
      reasons.push(`${key.replace(/_/g, " ")}: ${[...new Set(hits)].sort().join(", ")}`);
    }
  }

  return { score: Math.round(total * 100) / 100, reasons };
};

const fromPreset = (brand: BrandKit, preset: ActorPreset): ActorCandidate => ({
  id: preset.id,
  source: "preset",
  name: preset.name,
  persona: preset.persona,
  look: presetNote(preset),
  wardrobe: preset.wardrobe,
  voice: preset.voice,
  tags: preset.tags,
  portrait: portraitFor(preset.id),
  ...scoreActor(brand, preset),
});

/**
 * Somebody this account has already filmed with.
 *
 * They come first and they are not scored against anything. A person who has
 * appeared in a video for this brand outranks the best-matching stranger by
 * definition — the whole point of saving an actor is that next week's video has
 * the same face in it — and a ranking that could bury them under a preset would
 * make the library feel like a suggestion rather than a decision.
 */
const fromSaved = (
  saved: { id: string; name: string; actor: ActorIdentity }
): ActorCandidate => ({
  id: saved.id,
  source: "library",
  name: saved.name,
  persona: saved.actor.persona ?? "Cast before",
  look: saved.actor.look,
  wardrobe: saved.actor.wardrobe,
  voice: saved.actor.voice,
  tags: ["your library", "same face"],
  portrait: saved.actor.masterFrameUrl,
  masterFrameUrl: saved.actor.masterFrameUrl,
  assetId: saved.actor.assetId ?? saved.id,
  // Not a score, and deliberately not a large one either: their place is
  // decided by position, not by competing. `Infinity` would have been the
  // expressive choice and it does not survive `JSON.stringify` — the event
  // would arrive at the client with `score: null`.
  score: 0,
  reasons: ["already cast for this account"],
  why: "You have filmed with them before — same face, no re-casting.",
});

export const rankActors = (brand: BrandKit): ActorCandidate[] =>
  ACTOR_PRESETS.map((preset) => fromPreset(brand, preset)).sort(
    (a, b) => b.score - a.score
  );

/** How many go on the shelf, before saved actors are added to the front. */
const SHELF = 4;
/** How far down the ranking the model may reach when picking them. */
const POOL = 8;

/**
 * The shelf to show, and the reason each person is on it.
 *
 * Saved actors first and unranked — somebody this account has already filmed
 * outranks the best-matching stranger by definition. Then the model picks from
 * the top of the scored presets, which is the part scoring alone got wrong:
 * persona strings are prose, so token overlap will happily rank a salon owner
 * above a cafe owner for a coffee roaster because "consumer" appeared in one
 * tag list and not the other. Scoring is good enough to narrow twelve to eight;
 * choosing between those eight is a judgement about the audience.
 *
 * Capped, because a picker you scroll is a catalogue and this is a decision
 * somebody makes in about four seconds. Everything else comes back as `all`, so
 * "show me the rest" is a disclosure rather than another turn.
 */
export const castingOptions = async (
  brand: BrandKit,
  saved: { id: string; name: string; actor: ActorIdentity }[] = []
) => {
  const library = saved.slice(0, 2).map(fromSaved);
  const ranked = rankActors(brand);
  const pool = ranked.slice(0, POOL);
  const room = Math.max(2, SHELF - library.length);

  /** Score order, for when there is nothing better to go on. */
  const byScore = () => [...library, ...pool.slice(0, room)];

  if (!pool.length) return { shortlist: library, all: [...library, ...ranked] };

  let shortlist = byScore();

  try {
    const picked = await llmJson<{
      picks: { id: string; why: string }[];
    }>({
      system:
        "You are a casting director choosing who to put in front of a client, from a shelf of " +
        "written actors. You cast to the customer, not to the brand's own staff, and you never " +
        "flatter. Answer only with JSON.",
      prompt: `Brand: ${brand.brand_name} — ${(brand.brand_summary ?? "").slice(0, 500)}
Voice: ${brand.voice_tone}
Customers: ${JSON.stringify(
        (brand.target_personas ?? []).map((persona) => ({
          name: persona.name,
          needs: persona.needs,
        }))
      ).slice(0, 800)}

THE SHELF:
${JSON.stringify(
  pool.map((candidate) => ({
    id: candidate.id,
    persona: candidate.persona,
    voice: candidate.voice,
    look: candidate.look.slice(0, 180),
  })),
  null,
  1
)}

Pick the ${room} you would actually put on camera for this brand, best first. For each:
- id: from the shelf above, never invented, never repeated
- why: at most 14 words on who they are to THIS brand's customers. Concrete about the audience, never about the acting.`,
      schema: { picks: [{ id: "", why: "" }] },
      model: MODEL.synth,
      maxTokens: 800,
      attempts: 2,
    });

    const byId = new Map(pool.map((candidate) => [candidate.id, candidate]));
    const chosen: ActorCandidate[] = [];

    for (const pick of picked.picks ?? []) {
      const candidate = byId.get(pick.id);
      if (!candidate || chosen.some((entry) => entry.id === candidate.id)) continue;

      chosen.push({ ...candidate, why: pick.why });
      if (chosen.length === room) break;
    }

    // A short or empty answer is topped up from the ranking rather than re-asked.
    for (const candidate of pool) {
      if (chosen.length >= room) break;
      if (chosen.some((entry) => entry.id === candidate.id)) continue;
      chosen.push(candidate);
    }

    shortlist = [...library, ...chosen];
  } catch {
    // Score order and the tag reasons stand on their own.
  }

  // Anything the model skipped still needs a line, and the scoring already knows
  // one: the tags that matched are the reason, stated less fluently.
  for (const candidate of shortlist) {
    if (!candidate.why) {
      candidate.why = candidate.reasons[0] ?? `${candidate.persona}, cast to type.`;
    }
  }

  return { shortlist, all: [...library, ...ranked] };
};
