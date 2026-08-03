/**
 * Keyword discovery from free search-suggestion endpoints.
 *
 * Design notes, because the endpoint choices here are load-bearing:
 *
 * - We ask Google with `client=chrome`, not `client=firefox`. The chrome
 *   client returns `google:suggestrelevance` (Google's own numeric relevance
 *   per suggestion) and `google:suggesttype` (QUERY vs NAVIGATION). That gives
 *   us a real demand signal and a real way to drop brand/site lookups, rather
 *   than inferring both from list position. It also returns ~15 suggestions
 *   instead of ~10.
 *
 * - Harvesting is two-level: seeds are expanded with question and modifier
 *   patterns, then the best phrases found are expanded again. The second pass
 *   is where the genuinely long-tail, low-competition phrases come from.
 *
 * - Suggestion engines drift. "why is deep work" returns "why is deep heat not
 *   working". Every harvested phrase is therefore checked against the seed's
 *   distinctive tokens before it is kept.
 *
 * No API key, no quota, no cost. DuckDuckGo is the fallback when Google
 * returns nothing (rate limiting, blocked egress); it carries no relevance
 * scores, so those phrases fall back to rank-based scoring.
 */

export type Suggestion = {
  phrase: string;
  rank: number;
  /** Google's own relevance score. Undefined for DuckDuckGo results. */
  relevance?: number;
  /** "QUERY" | "NAVIGATION" | undefined */
  type?: string;
};

export type Candidate = {
  phrase: string;
  /** Highest Google relevance seen for this phrase across all queries. */
  bestRelevance: number;
  /** Best (lowest) position reached in any suggestion list, 1-based. */
  bestRank: number;
  /** How many distinct queries surfaced it — breadth of demand. */
  hits: number;
  /** True once the phrase was found by expanding another discovered phrase. */
  longTail: boolean;
};

const TIMEOUT_MS = 4000;
const CONCURRENCY = 10;

/** Hard ceiling on HTTP requests per research run. */
const MAX_QUERIES = 140;

/** Question forms — these surface the informational intent a tip carousel serves. */
const QUESTION_PATTERNS = [
  (s: string) => `how to ${s}`,
  (s: string) => `how do you ${s}`,
  (s: string) => `why ${s}`,
  (s: string) => `what is ${s}`,
  (s: string) => `when to ${s}`,
  (s: string) => `should i ${s}`,
];

/** Suffix forms — these surface practical, listicle-shaped demand. */
const MODIFIER_PATTERNS = [
  (s: string) => s,
  (s: string) => `${s} tips`,
  (s: string) => `${s} mistakes`,
  (s: string) => `${s} for beginners`,
  (s: string) => `${s} checklist`,
  (s: string) => `${s} vs`,
];

/** Applied to already-discovered phrases in the second pass. */
const DEEP_PATTERNS = [
  (s: string) => `${s} `,
  (s: string) => `${s} how`,
  (s: string) => `${s} why`,
];

const fetchWithTimeout = async (url: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        // Suggestion endpoints return an empty body to an unidentified client.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        Accept: "application/json, text/javascript, */*",
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Google Suggest via the chrome client, which carries relevance scores.
 *
 * Response shape:
 *   [query, [phrases], [descriptions], [], {
 *     "google:suggestrelevance": [1150, 700, ...],
 *     "google:suggesttype": ["QUERY", "NAVIGATION", ...]
 *   }]
 */
const googleSuggest = async (query: string): Promise<Suggestion[]> => {
  try {
    const response = await fetchWithTimeout(
      `https://suggestqueries.google.com/complete/search?client=chrome&hl=en&q=${encodeURIComponent(query)}`
    );

    if (!response.ok) return [];

    const parsed = JSON.parse(await response.text());
    const phrases: string[] = Array.isArray(parsed?.[1]) ? parsed[1] : [];
    const meta = parsed?.[4] ?? {};
    const relevances: number[] = meta["google:suggestrelevance"] ?? [];
    const types: string[] = meta["google:suggesttype"] ?? [];

    return phrases.map((phrase, index) => ({
      phrase,
      rank: index,
      relevance: relevances[index],
      type: types[index],
    }));
  } catch {
    return [];
  }
};

/** DuckDuckGo fallback. No relevance data, so rank carries the signal. */
const duckSuggest = async (query: string): Promise<Suggestion[]> => {
  try {
    const response = await fetchWithTimeout(
      `https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`
    );

    if (!response.ok) return [];

    const parsed = JSON.parse(await response.text());
    const phrases: string[] = Array.isArray(parsed?.[1])
      ? parsed[1]
      : Array.isArray(parsed)
        ? parsed
            .map((item: unknown) =>
              typeof item === "string"
                ? item
                : ((item as { phrase?: string })?.phrase ?? "")
            )
            .filter(Boolean)
        : [];

    return phrases.map((phrase, index) => ({ phrase, rank: index }));
  } catch {
    return [];
  }
};

export const suggest = async (query: string): Promise<Suggestion[]> => {
  const google = await googleSuggest(query);
  return google.length ? google : duckSuggest(query);
};

/** Runs tasks with bounded concurrency so we don't open 140 sockets at once. */
const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);

  return results;
};

/** Words carrying a seed's meaning, used to detect topic drift. */
const distinctiveTokens = (seed: string) =>
  seed
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 3 && !STOPWORDS.has(token));

const STOPWORDS = new Set([
  "the", "and", "for", "with", "your", "you", "how", "why", "what", "when",
  "should", "does", "from", "that", "this", "into", "about", "best", "tips",
]);

/**
 * Keeps a suggestion only if it still belongs to the seed's topic. Without
 * this, question prefixes pull in unrelated queries that merely share a
 * prefix ("why is deep work" -> "why is deep heat not working").
 */
const onTopic = (phrase: string, tokens: string[]) =>
  tokens.length === 0 || tokens.some((token) => phrase.includes(token));

const isUsable = (phrase: string, exclude: string[]) => {
  if (phrase.length < 8 || phrase.length > 80) return false;
  if (phrase.split(/\s+/).length < 2) return false;
  // Navigational, transactional and media noise a tip carousel can't serve.
  if (
    /\b(login|sign in|download|coupon|price|near me|pdf|apk|reddit|youtube|amazon|torrent|free download|meme|lyrics|book|audiobook|summary|quotes)\b/.test(
      phrase
    )
  )
    return false;
  if (/\b(19|20)\d\d\b/.test(phrase)) return false;
  if (exclude.some((term) => term.length > 2 && phrase.includes(term)))
    return false;

  return true;
};

type HarvestOptions = {
  exclude?: string[];
  /** Second-pass expansion of the best first-pass phrases. */
  deep?: boolean;
};

/**
 * Expands seed topics into real search phrases.
 *
 * Pass 1: every seed under question + modifier patterns.
 * Pass 2: the strongest phrases from pass 1, expanded again for long tail.
 */
export const expandSeeds = async (
  seeds: string[],
  options: HarvestOptions = {}
): Promise<Candidate[]> => {
  const exclude = (options.exclude ?? [])
    .filter(Boolean)
    .map((term) => term.toLowerCase());

  const cleanSeeds = seeds
    .map((seed) => seed.toLowerCase().trim())
    .filter(Boolean);

  if (!cleanSeeds.length) return [];

  const found = new Map<string, Candidate>();
  const seen = new Set<string>();
  let budget = MAX_QUERIES;

  const harvest = async (
    queries: { query: string; tokens: string[] }[],
    longTail: boolean
  ) => {
    const fresh = queries
      .filter(({ query }) => !seen.has(query))
      .slice(0, Math.max(0, budget));

    fresh.forEach(({ query }) => seen.add(query));
    budget -= fresh.length;

    if (!fresh.length) return;

    const lists = await mapWithConcurrency(fresh, CONCURRENCY, ({ query }) =>
      suggest(query)
    );

    lists.forEach((list, index) => {
      const { query, tokens } = fresh[index];
      let rank = 0;

      list.forEach((suggestion) => {
        const phrase = suggestion.phrase.toLowerCase().trim();

        // The engine echoes the typed query back first; counting it would
        // rank our own constructed strings above real ones.
        if (phrase === query.trim()) return;
        // Site and brand lookups, per Google's own classification.
        if (suggestion.type === "NAVIGATION") return;
        if (!onTopic(phrase, tokens)) return;
        if (!isUsable(phrase, exclude)) return;

        rank += 1;

        const existing = found.get(phrase);

        if (existing) {
          existing.hits += 1;
          existing.bestRank = Math.min(existing.bestRank, rank);
          existing.bestRelevance = Math.max(
            existing.bestRelevance,
            suggestion.relevance ?? 0
          );
        } else {
          found.set(phrase, {
            phrase,
            bestRank: rank,
            bestRelevance: suggestion.relevance ?? 0,
            hits: 1,
            longTail,
          });
        }
      });
    });
  };

  // Pass 1 — seeds under every pattern.
  await harvest(
    cleanSeeds.flatMap((seed) => {
      const tokens = distinctiveTokens(seed);
      return [...QUESTION_PATTERNS, ...MODIFIER_PATTERNS].map((build) => ({
        query: build(seed),
        tokens,
      }));
    }),
    false
  );

  // Pass 2 — dig into the strongest finds for long-tail phrases.
  if (options.deep !== false && budget > 0) {
    const strongest = [...found.values()]
      .sort((a, b) => demandSignal(b) - demandSignal(a))
      .slice(0, 8);

    await harvest(
      strongest.flatMap((candidate) => {
        const tokens = distinctiveTokens(candidate.phrase);
        return DEEP_PATTERNS.map((build) => ({
          query: build(candidate.phrase),
          tokens,
        }));
      }),
      true
    );
  }

  return diversify(
    [...found.values()].sort((a, b) => demandSignal(b) - demandSignal(a))
  );
};

/**
 * Caps how many phrases sharing an opening can occupy the ranking.
 *
 * Autocomplete returns tight variant clusters ("morning routine checklist for
 * kids", "… for kids printable", "… for kids before school"). Only the top
 * slice is ever sent for scoring, so without this a single cluster crowds out
 * every other topic. Input must already be sorted, so the strongest member of
 * each cluster survives.
 */
const diversify = (candidates: Candidate[], perStem = 2): Candidate[] => {
  const counts = new Map<string, number>();

  return candidates.filter((candidate) => {
    const stem = candidate.phrase.split(/\s+/).slice(0, 3).join(" ");
    const used = counts.get(stem) ?? 0;

    if (used >= perStem) return false;

    counts.set(stem, used + 1);
    return true;
  });
};

/**
 * 0-100 demand signal. Not search volume, and never presented as such.
 *
 * Measured behaviour of Google's relevance scores (not assumed): a strongly
 * matched suggestion scores 950-1250, while the tail of a list sits around
 * 550-700. The band is therefore mapped across 500-1250 rather than the much
 * narrower range the tail alone suggests.
 *
 * Phrases that only DuckDuckGo returned carry no relevance score, so their
 * strength is inferred from rank and then discounted — an unverified signal
 * must not outrank a measured one, which it otherwise did.
 */
export const demandSignal = (candidate: Candidate): number => {
  const breadth = Math.min(candidate.hits, 5) / 5;

  const strength = candidate.bestRelevance
    ? clamp01((candidate.bestRelevance - 500) / 750)
    : clamp01(1 - (candidate.bestRank - 1) / 10) * 0.55;

  // Long-tail phrases are less contested, which is worth a small nudge.
  const bonus = candidate.longTail ? 4 : 0;

  return Math.round(Math.min(100, strength * 75 + breadth * 25 + bonus));
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
