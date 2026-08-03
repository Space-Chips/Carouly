import { Candidate, demandSignal } from "@/lib/keyword-sources";
import { GeneratedKeyword } from "@/types";

/**
 * Keyword ranking — entirely algorithmic, no language model involved.
 *
 *   score = 0.55 * demand + 0.45 * opportunity        (opportunity = 100 - competition)
 *
 * Both inputs are derived from measured search-suggestion data, so the same
 * keyword always scores the same. Nothing here is a model's opinion: an
 * LLM-guessed "difficulty 0-100" is the same class of fabrication as an
 * LLM-guessed search volume, and neither belongs in a ranking presented as
 * data.
 *
 * The model's former job — deciding which keywords are worth writing about —
 * now belongs to the user, who picks from the ranked list. They know their
 * brand better than a triage prompt does.
 */

/** A keyword row ready to be stored, from either source. */
export type KeywordRow = {
  keyword: string;
  angle: string | null;
  intent: string | null;
  volume: number;
  demand: number;
  difficulty: number;
  relevance: number;
  source: "autocomplete" | "llm";
  score: number;
};

export const scoreKeyword = (k: {
  demand: number;
  competition: number;
}): number =>
  round(0.55 * clamp(k.demand) + 0.45 * (100 - clamp(k.competition)));

/** Commercial intent — these SERPs are fought over by vendors and affiliates. */
const COMMERCIAL = /\b(best|top|vs|versus|review|reviews|app|apps|tool|tools|software|price|pricing|buy|cheap|alternative|alternatives)\b/;

/** Informational phrasing — generally less contested than commercial terms. */
const QUESTION = /^(how|why|what|when|where|which|should|can|does|is|do)\b/;

/**
 * Estimated competition, 0-100. An *estimate*, and labelled as one everywhere
 * it is shown — a true difficulty metric needs live SERP data, which is only
 * available from paid APIs.
 *
 * It combines four measurable properties of the phrase:
 *
 *  - length: the strongest and best-established proxy. A two-word head term is
 *    contested; a seven-word question is not.
 *  - Google's own relevance: a strongly-established query is one many people
 *    already search, and therefore one many people already write for.
 *  - breadth: a phrase surfacing from every seed is a hub topic, not a niche.
 *  - shape: commercial modifiers raise it, question forms lower it.
 */
export const estimateCompetition = (candidate: Candidate): number => {
  const phrase = candidate.phrase;
  const words = phrase.split(/\s+/).length;

  // Head terms are hard, long tails are not. Measured range is 2-12 words.
  const byLength = clamp(95 - (words - 2) * 13);

  // Relevance is heavily skewed (median ~557, max ~1251), so only the genuinely
  // high scores should push competition up.
  const byRelevance = candidate.bestRelevance
    ? clamp01((candidate.bestRelevance - 600) / 650) * 18
    : 0;

  const byBreadth = (Math.min(candidate.hits, 5) / 5) * 10;

  const shape =
    (COMMERCIAL.test(phrase) ? 10 : 0) - (QUESTION.test(phrase) ? 8 : 0);

  return clamp(byLength * 0.72 + byRelevance + byBreadth + shape);
};

/** Builds a storable keyword row from a harvested candidate. */
export const fromCandidate = (candidate: Candidate): KeywordRow => {
  const demand = demandSignal(candidate);
  const competition = estimateCompetition(candidate);

  return {
    keyword: candidate.phrase.trim().toLowerCase().slice(0, 120),
    angle: null,
    intent: null,
    volume: 0,
    demand,
    difficulty: competition,
    relevance: 0,
    source: "autocomplete" as const,
    score: scoreKeyword({ demand, competition }),
  };
};

/** Turns a guessed monthly volume into a 0-100 demand signal. */
export const demandFromVolume = (volume: number): number =>
  Math.round(Math.min(100, (Math.log10(Math.max(volume, 1)) / 5) * 100));

/**
 * Only used by the model-only fallback path, for when the suggestion
 * endpoints are unreachable. Those rows are stored with source "llm" and
 * rendered as estimates in the UI.
 */
export const normaliseKeyword = (raw: GeneratedKeyword): KeywordRow => {
  const volume = Math.max(0, Math.round(Number(raw.volume) || 0));
  const competition = clamp(Number(raw.difficulty));
  const demand = demandFromVolume(volume);

  return {
    keyword: raw.keyword.trim().toLowerCase().slice(0, 120),
    angle: (raw.angle ?? "").trim().slice(0, 400) || null,
    intent: null,
    volume,
    demand,
    difficulty: competition,
    relevance: clamp(Number(raw.relevance)),
    source: "llm" as const,
    score: scoreKeyword({ demand, competition }),
  };
};

/** Human-readable band for the competition pill in the UI. */
export const competitionBand = (competition: number) => {
  if (competition < 35) return { label: "Low", tone: "easy" as const };
  if (competition < 60) return { label: "Medium", tone: "medium" as const };
  return { label: "High", tone: "hard" as const };
};

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n || 0)));
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round = (n: number) => Math.round(n * 10) / 10;
