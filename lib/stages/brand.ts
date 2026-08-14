/**
 * Stage 2 — the brand kit. Three passes, because asking one call for the whole
 * 400-line object reliably fails.
 *
 *   2a research  — an agent with web tools explores past the landing page
 *   2b synthesis — structured generation of the kit from capture plus research
 *   2c grounding — every evidence quote is checked against the real captured
 *                  text, and unsupported ones are deleted rather than flagged
 *
 * 2c is the quality gate and the reason any of this can be shown to a customer.
 * A model asked for verbatim quotes will paraphrase, and a paraphrase in a brand
 * kit is an invented claim about someone's business. Deleting is the only
 * treatment that cannot be ignored downstream.
 */

import { runAgent, type ToolCallReport } from "@/lib/agent/loop";
import { json as llmJson, MODEL, ModelError } from "@/lib/agent/llm";
import { fetchPage, htmlToText, type Capture } from "@/lib/stages/capture";

export type BrandKit = {
  slug: string;
  sourceUrl: string;
  brand_name: string;
  brand_summary: string;
  voice_tone: string;
  value_props: string[];
  facts: {
    title: string;
    meta_description: string;
    tagline: string;
    copy_snippets: string[];
    palette: string[];
    palette_source: string;
  };
  products: {
    id: string;
    name: string;
    product_kind: string;
    category: string;
    description: string;
    selling_points: string[];
    evidence: { quote: string; source_url: string }[];
  }[];
  target_personas: { name: string; demographics: string; needs: string; where_they_are: string }[];
  video_concepts: {
    title: string;
    hook: string;
    format: string;
    beats: string[];
    cta: string;
  }[];
  template_matching_profile: Record<string, string[]>;
  assets: Capture["assets"];
  evidence_check: { kept: number; dropped: number };
};

const RESEARCH_SYSTEM = `You are a brand researcher. A landing page has already been captured for you.
Your job is only to fill the gaps that page cannot answer.

Method:
- Use page_text on likely sub-pages: /pricing, /about, /faq, /features, /blog.
- Prefer links that were actually found on the page over paths you guessed.
- Do NOT invent anything. If you cannot find pricing or social links, say so.

Stop after at most 5 tool calls, then reply with ONLY a JSON object:
{"pages_checked": [...], "extra_copy": ["verbatim sentences worth quoting"],
 "pricing": "what you actually found, or null", "social_links": [...],
 "category": "...", "gaps": ["what remains unknown"]}`;

const BRAND_SYSTEM = `You are a brand strategist producing a machine-readable brand kit for a short-form video generator.

Hard rules:
- Ground every claim in the supplied captured text. Never invent features, prices or customers.
- evidence[].quote MUST be copied verbatim from the captured text. If you cannot find a real
  supporting sentence for a selling point, omit that evidence entry rather than paraphrasing it.
- voice_tone describes how this brand actually writes, judged from its own sentences.
- video_concepts must be shootable as 9:16 vertical video in under 25 seconds each.`;

/**
 * The controlled vocabulary is pinned in the prompt because the tags are matched
 * literally in stage 4. Free-text tags score zero against a template's `match`
 * block, which looks like a broken matcher rather than a loose prompt.
 */
const BRAND_SCHEMA = {
  brand_name: "string",
  brand_summary: "3-4 sentences on what it is and who it is for",
  voice_tone: "how this brand writes, in one line",
  value_props: ["3-6 strings"],
  facts: {
    tagline: "",
    copy_snippets: ["5-8 verbatim lines from the site"],
  },
  products: [
    {
      id: "kebab-case",
      name: "",
      product_kind: "app|physical|service",
      category: "",
      description: "2-4 sentences",
      selling_points: ["4-6"],
      evidence: [{ quote: "verbatim from the captured text" }],
    },
  ],
  target_personas: [
    { name: "", demographics: "", needs: "", where_they_are: "" },
  ],
  video_concepts: [
    {
      title: "",
      hook: "spoken first line, at most 14 words",
      format: "UGC|talking-head|demo",
      beats: ["3-4 shot beats"],
      cta: "",
    },
  ],
  template_matching_profile: {
    preferred_types: ["ONLY: UGC | Demo | Animation | TVC | Testimonial"],
    creative_format: [
      "ONLY: talking-head | ugc-testimonial | product-demo | screen-recording | voiceover-montage",
    ],
    funnel_stage: ["ONLY: awareness | consideration | conversion | retention"],
    tone: [
      "ONLY: confident | plain-spoken | contrarian | dry-wit | warm | urgent | empathetic | premium",
    ],
    settings: [
      "ONLY: home-office | small-shop | desk | outdoor | studio | screen | app-ui | phone-camera-selfie",
    ],
    industries: ["lowercase-hyphenated free text"],
    audiences: ["lowercase-hyphenated free text"],
    pain_points: ["lowercase-hyphenated free text"],
  },
};

/**
 * What the model actually hands back, as opposed to what we asked for.
 *
 * Deliberately every field optional. The synthesis prompt states the shape and
 * `llm.json` retries on missing top-level keys, but nothing downstream should be
 * written as though the object arrived complete — the repair for a missing field
 * is a default, not a crash.
 */
type RawKit = Partial<Omit<BrandKit, "facts" | "products">> & {
  facts?: Partial<BrandKit["facts"]>;
  products?: BrandKit["products"];
};

/** The only part of the kit evidence grounding needs to see. */
type Groundable = {
  products?: { evidence?: { quote?: string; source_url?: string }[] }[];
};

/* ------------------------------------------------------------- 2a research --- */

/**
 * A path's leading locale segment, if it has one — `/fr/pricing` → `fr`.
 *
 * Matches `fr` and `en-gb` but not `docs` or `api`, so a two-letter directory
 * that is genuinely a section rather than a language is only ever mistaken for
 * one if it is also two letters long, which is rare and costs a single candidate
 * page when it happens.
 */
const localeOf = (pathname: string) => {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  return /^[a-z]{2}(-[a-z]{2})?$/i.test(first) ? first.toLowerCase() : null;
};

/**
 * Drop translated copies of the site before offering the list to the agent.
 *
 * A big site links every locale from its footer, and the agent picks by name —
 * so researching stripe.com reliably read `/fr/pricing` and `/fr/about`, and the
 * kit for an English brand was then written partly off French pages. Nothing
 * errors; the copy just quietly comes back in the wrong voice, and evidence
 * quotes gathered there fail grounding against the English capture and get
 * deleted, so the run also loses the proof it went looking for.
 *
 * Only links whose locale *disagrees* with the captured page's are removed, so a
 * site served entirely under `/fr/` keeps all of its own pages. This narrows what
 * is suggested, not what is reachable — `page_text` still accepts any path on the
 * origin, so an agent with a real reason to read a translation still can.
 */
const sameLocale = (links: Capture["links"], from: string) => {
  const here = localeOf(new URL(from).pathname);

  const kept = links.filter((link) => {
    try {
      const locale = localeOf(new URL(link.href, from).pathname);
      return locale === null || locale === here;
    } catch {
      return true;
    }
  });

  // Never hand back an empty list: a site whose every link carries a locale we
  // failed to read is better researched from a noisy list than from none.
  return kept.length ? kept : links;
};

export const research = async (
  capture: Capture,
  onToolCall: (report: ToolCallReport) => void
) => {
  const origin = new URL(capture.finalUrl).origin;

  const tools = [
    {
      name: "page_text",
      description:
        "Fetch a page on this site and return its readable text. Use for sub-pages like /pricing.",
      parameters: {
        type: "object" as const,
        properties: {
          url: { type: "string", description: "Absolute URL, or a path like /pricing" },
        },
        required: ["url"],
      },
      run: async (args: Record<string, string>) => {
        const target = new URL(args.url, origin);

        // The agent is reading the customer's own site on their behalf. Letting a
        // model-chosen URL off that origin would turn this tool into an open
        // proxy pointed at whatever a page told it to fetch.
        if (target.origin !== origin) {
          return `refused: ${target.origin} is not part of ${origin}`;
        }

        const page = await fetchPage(target.href);
        if (page.status >= 400) return `HTTP ${page.status} — nothing here`;

        return htmlToText(page.body).slice(0, 8000);
      },
    },
  ];

  const goal = `Site: ${capture.url}
Title: ${capture.title}

Links found on the landing page:
${
  sameLocale(capture.links, capture.finalUrl)
    .map((link) => `- ${link.label} → ${link.href}`)
    .join("\n") || "(none)"
}

Already captured from the landing page:
${capture.markdown.slice(0, 5000)}

Find what is missing, then return the JSON object.`;

  try {
    return await runAgent({
      system: RESEARCH_SYSTEM,
      goal,
      tools,
      model: MODEL.agent,
      maxSteps: 6,
      onToolCall,
    });
  } catch (error) {
    // Research is enrichment. Losing it costs detail, not the run.
    return { gaps: [`research did not complete: ${String(error).slice(0, 160)}`] };
  }
};

/* ------------------------------------------------------------ 2b synthesis --- */

/**
 * What a caller can be told while the kit is being written.
 *
 * Deliberately the same shape the studio's `tool.step` event wants, so the tool
 * can forward one straight to the other without a translation layer in between.
 */
export type KitStep = {
  label: string;
  detail: string;
  ms?: number;
  ok?: boolean;
};

export const synthesise = async (
  capture: Capture,
  notes: Record<string, unknown>,
  onStep?: (step: KitStep) => void
) => {
  const corpus = [
    capture.markdown,
    ...Object.entries(capture.meta).map(([key, value]) => `${key}: ${value}`),
  ].join("\n");

  // Named rather than left to inference. The kit is written from the captured
  // copy, so it has to come back in the language that copy is in — and the model
  // will otherwise sometimes answer an English schema in the page's language and
  // sometimes translate the page into the schema's, from one run to the next.
  const lang = capture.meta["html:lang"];

  const prompt = `SOURCE URL: ${capture.url}
PAGE TITLE: ${capture.title}
PALETTE (from ${capture.palette.source}): ${capture.palette.colors.join(", ")}
${
  lang
    ? `PAGE LANGUAGE: ${lang} — write every human-readable string in this ` +
      `language, because it is the language this brand sells in and the language ` +
      `the finished video will be watched in. Keys stay in English.`
    : ""
}
META: ${JSON.stringify(capture.meta).slice(0, 1200)}

── CAPTURED PAGE TEXT — the only source of truth for quotes ──
${corpus.slice(0, 20000)}

── ADDITIONAL RESEARCH ──
${JSON.stringify(notes).slice(0, 4000)}

── DOWNLOADED IMAGERY — infer each one's subject from its filename and the copy
   above. If a filename tells you nothing, ignore it rather than guessing. ──
${capture.assets.map((asset) => asset.file).join("\n")}

Produce the brand kit JSON. Produce at least 3 target_personas, 5 video_concepts,
4 selling_points per product, and 6 copy_snippets.`;

  return llmJson<RawKit>({
    system: BRAND_SYSTEM,
    prompt,
    schema: BRAND_SCHEMA,
    model: MODEL.synth,
    /**
     * 8000 was not enough for a content-heavy site.
     *
     * Measured on stripe.com: all three attempts stopped at the ceiling, ~70
     * seconds each, and the retry could not help because it re-asked at the same
     * size. The schema is a 400-line object — three personas, five concepts, four
     * to six selling points per product, six copy snippets and every quote — and
     * on a reasoning model the ceiling covers thinking as well as output, which is
     * why so little JSON arrived before it ran out.
     *
     * `json()` still escalates by half on a truncation, so this is the size that
     * should usually land first time rather than a hard limit.
     */
    maxTokens: 12_000,
    attempts: 3,
    // The one call in the pipeline long enough to look stalled. It is a single
    // 8000-token generation against a 400-line schema, and on a retry it is two
    // or three of them — so the first try says what is happening and each retry
    // says what the model got wrong, rather than leaving two silent minutes.
    onAttempt: ({ attempt, of, problem }) =>
      onStep?.(
        attempt === 1
          ? { label: "writing the kit", detail: `${capture.assets.length} images, ${corpus.length} chars of copy` }
          : {
              label: `rewriting (${attempt} of ${of})`,
              detail: problem ?? "the last answer did not fit the schema",
              ok: false,
            }
      ),
  });
};

/* ------------------------------------------------------------ 2c grounding --- */

const normalise = (text: string) =>
  (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Delete every evidence quote that is not literally in the captured text.
 *
 * An ellipsis-joined quote is allowed through when both halves are present,
 * because a model quoting across a line break is being accurate about the words
 * and inaccurate only about the whitespace.
 */
export const groundEvidence = (brand: Groundable, capture: Capture) => {
  const corpus = normalise(
    [capture.markdown, ...Object.values(capture.meta)].join("\n")
  );

  let kept = 0;
  let dropped = 0;
  const removed: string[] = [];

  for (const product of brand.products ?? []) {
    product.evidence = (product.evidence ?? []).filter(
      (entry) => {
        const quote = normalise(entry.quote ?? "");

        if (quote.length < 12) {
          dropped++;
          return false;
        }

        const segments = quote
          .split(/\s*(?:\.\.\.|…)\s*/)
          .filter((segment) => segment.length > 8);

        const supported = (segments.length ? segments : [quote]).every(
          (segment) => corpus.includes(segment)
        );

        if (supported) {
          entry.source_url = entry.source_url ?? capture.url;
          kept++;
          return true;
        }

        dropped++;
        removed.push(entry.quote ?? "");
        return false;
      }
    );
  }

  return { kept, dropped, removed };
};

/* ------------------------------------------------------------------- run --- */

export const buildBrandKit = async (
  capture: Capture,
  notes: Record<string, unknown>,
  onStep?: (step: KitStep) => void
): Promise<{ kit: BrandKit; dropped: string[] }> => {
  const began = Date.now();
  const raw = await synthesise(capture, notes, onStep);

  const check = groundEvidence(raw, capture);

  // Worth reporting even though it is instant: it is the quality gate, and the
  // number of quotes thrown away is the most interesting thing this stage knows.
  // A kit that dropped nine of fifteen is a kit built on a page that did not say
  // much, and the person watching should see that as it happens rather than
  // reading it off a card afterwards.
  onStep?.({
    label: "checking quotes",
    detail: check.dropped
      ? `${check.kept} verbatim, ${check.dropped} invented and deleted`
      : `${check.kept} verbatim, none invented`,
    ms: Date.now() - began,
    ok: true,
  });

  const kit: BrandKit = {
    ...(raw as object),
    slug: capture.slug,
    sourceUrl: capture.url,
    brand_name: raw.brand_name ?? capture.title,
    facts: {
      title: capture.title,
      meta_description: capture.meta.description ?? "",
      tagline: raw.facts?.tagline ?? "",
      copy_snippets: raw.facts?.copy_snippets ?? [],
      palette: capture.palette.colors,
      palette_source: capture.palette.source,
    },
    assets: capture.assets,
    evidence_check: { kept: check.kept, dropped: check.dropped },
  } as BrandKit;

  if (!kit.video_concepts?.length) {
    throw new ModelError(
      "The model produced no video concepts, so there is nothing to make. " +
        "This is usually a model routing problem — try the run again."
    );
  }

  return { kit, dropped: check.removed };
};
