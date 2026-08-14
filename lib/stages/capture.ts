/**
 * Stage 1 — capture. Deterministic, no model spend.
 *
 * Cheap code does the fetching; the model is only spent on judgement later.
 *
 * The prototype tries a headless render first and falls back to plain HTTP when
 * the render returns an error page. In this runtime there is no headless browser
 * at all, so it is HTTP only — which is not the compromise it sounds like. The
 * fallback path is the one that actually works on the sites that matter: a
 * framework whose middleware 500s under a headless Chrome still serves correct
 * prerendered markup over ordinary HTTP, and that markup is where the copy is.
 * What is genuinely lost is computed styles and screenshot pixels, which cost
 * this stage two of its four palette sources.
 */

import { normalizeSite } from "@/lib/site-url";
import { safeFetch } from "@/lib/net/safe-fetch";
import type { CapturedAsset } from "@/lib/agent/events";

const UA =
  "Mozilla/5.0 (compatible; CaroulyBot/1.0; +https://carouly.eu/about-our-crawler)";

const ERROR_MARKERS = [
  "INTERNAL_SERVER_ERROR",
  "MIDDLEWARE_INVOCATION_FAILED",
  "This Routing Middleware has crashed",
  "404: NOT_FOUND",
  "DEPLOYMENT_NOT_FOUND",
  "Application error",
];

export type Capture = {
  slug: string;
  url: string;
  finalUrl: string;
  title: string;
  markdown: string;
  meta: Record<string, string>;
  palette: { colors: string[]; source: string };
  assets: CapturedAsset[];
  links: { href: string; label: string }[];
  httpFallback: string | null;
};

export const slugFor = (url: string) =>
  new URL(url).hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-");

const looksBroken = (status: number, body: string) =>
  status >= 400 || ERROR_MARKERS.some((marker) => body.includes(marker));

/** The same page addressed differently — one host often works when the other 500s. */
const variants = (url: string) => {
  const parsed = new URL(url);
  const alt = parsed.hostname.startsWith("www.")
    ? parsed.hostname.slice(4)
    : `www.${parsed.hostname}`;

  return [...new Set([parsed.href, `https://${alt}${parsed.pathname}`])];
};

/**
 * The language every page is asked for.
 *
 * Stated, because leaving it unset makes the whole pipeline's output depend on
 * where the server happens to be running. Big sites negotiate on the request:
 * asked with no preference from a French address, `stripe.com` 302s to
 * `stripe.com/fr` and serves `lang="fr-FR"`, so the capture is French, so the
 * brand kit is French, so the video is French — for a brand whose site is
 * English. The same code deployed to a US region produces an English kit for a
 * French brand. Nothing errors either way and nothing records which happened,
 * which is what made it look like the model being erratic: two runs against one
 * address, minutes apart, came back in different languages.
 *
 * Measured: `Accept-Language: en-US,en;q=0.9` moves that redirect to
 * `stripe.com/en-fr` — English copy, region still geo-derived — so the header is
 * enough to make the language deterministic.
 *
 * Overridable, because a French brand should be read in French. This is the
 * default rather than the rule.
 */
const ACCEPT_LANGUAGE = process.env.CAROULY_LOCALE?.trim() || "en-US,en;q=0.9";

export const fetchPage = async (url: string) => {
  // `safeFetch`, not `fetch`: the address came from whoever is signed in, and it
  // follows its own redirects so each hop is checked rather than only the one
  // that was typed. See lib/net/safe-fetch.ts.
  const response = await safeFetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,*/*",
      "Accept-Language": ACCEPT_LANGUAGE,
    },
    signal: AbortSignal.timeout(20_000),
  });

  const body = await response.text();

  return {
    status: response.status,
    finalUrl: response.url || url,
    body,
    contentType: response.headers.get("content-type") ?? "",
  };
};

/* --------------------------------------------------------------- parsing --- */

const decodeEntities = (text: string) =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_full, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_full, code) =>
      String.fromCharCode(parseInt(code, 16))
    );

/**
 * HTML to something a model can read.
 *
 * Not a general-purpose converter — it only has to preserve the two things the
 * next stage needs: which sentences the site actually wrote, and which of them
 * were headings. Everything else is noise that costs tokens.
 */
export const htmlToText = (html: string) => {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<h([1-6])[^>]*>/gi, (_full, level) => `\n\n${"#".repeat(Number(level))} `)
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|section|tr|ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return decodeEntities(stripped)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
};

const metaFrom = (html: string) => {
  const meta: Record<string, string> = {};

  for (const match of html.matchAll(/<meta\s+([^>]+)>/gi)) {
    const attrs = match[1];
    const name = /(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1];
    if (name && content) meta[name.toLowerCase()] = decodeEntities(content);
  }

  // What language the page actually came back in, which is not the same question
  // as what we asked for: content negotiation and geo redirects both answer it,
  // and neither tells us. Recorded so the kit is written in the language of the
  // copy it was built from rather than whichever one the model infers, and so a
  // French kit for an English brand is a visible fact rather than a mystery.
  const lang = /<html[^>]*\slang\s*=\s*["']([^"']+)["']/i.exec(html)?.[1];
  if (lang) meta["html:lang"] = lang.trim().toLowerCase();

  return meta;
};

const titleFrom = (html: string) =>
  decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "")
    .trim()
    .slice(0, 200);

/** Internal links, so the research agent knows what pages exist before guessing. */
const linksFrom = (html: string, base: string) => {
  const origin = new URL(base).origin;
  const out = new Map<string, string>();

  for (const match of html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href: string;
    try {
      // Decoded first: an href in the source carries `&amp;` between query
      // parameters, and handing that to the research agent produces a URL with
      // a literal "amp;" in it that fetches the wrong page or none at all.
      href = new URL(decodeEntities(match[1]), base).href;
    } catch {
      continue;
    }

    if (!href.startsWith(origin) || href.includes("#")) continue;

    const label = decodeEntities(match[2].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();

    if (!out.has(href) && label) out.set(href, label.slice(0, 60));
  }

  return [...out].slice(0, 40).map(([href, label]) => ({ href, label }));
};

/* --------------------------------------------------------------- palette --- */

/** Greys carry no brand information, and a page is mostly greys. */
const isGrey = (hex: string) => {
  const full =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;

  const [r, g, b] = [1, 3, 5].map((offset) =>
    parseInt(full.slice(offset, offset + 2), 16)
  );

  return Math.max(r, g, b) - Math.min(r, g, b) < 18;
};

const dedupe = (colors: string[]) => [
  ...new Map(colors.map((hex) => [hex.toLowerCase(), hex.toLowerCase()])).values(),
];

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0"))
    .join("")}`;

/**
 * Any CSS colour notation to hex, or null.
 *
 * Hex alone is not enough any more. A design system written this decade declares
 * its tokens in `hsl()` or `rgb()` as often as not, and reading only hex means a
 * site with a perfectly explicit palette comes back with none at all — which is
 * exactly what linear.app did. `oklch()` is deliberately not converted: the
 * conversion is a real colour-space transform, and a wrong colour is worse here
 * than a missing one.
 */
export const parseColor = (raw: string): string | null => {
  const value = raw.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})\b/.exec(value);
  if (hex) {
    const digits = hex[1];
    return digits.length === 3
      ? `#${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`
      : `#${digits}`;
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(value);
  if (rgb) return toHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));

  const hsl = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(value);
  if (hsl) {
    const [h, s, l] = [Number(hsl[1]) / 360, Number(hsl[2]) / 100, Number(hsl[3]) / 100];
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] = (
      [
        [c, x, 0],
        [x, c, 0],
        [0, c, x],
        [0, x, c],
        [x, 0, c],
        [c, 0, x],
      ] as const
    )[Math.floor(h * 6) % 6];

    return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }

  return null;
};

/**
 * The palette cascade, best source first: CSS custom properties, then hex
 * frequency across the stylesheets.
 *
 * Custom properties win because they are the brand's own tokens under their own
 * names — a site that declares `--brand-primary` has told you the answer. Only
 * when a site ships no variables does frequency counting have to guess, and
 * there greys have to be excluded or every site comes back the same shade of
 * near-black.
 */
export const derivePalette = (css: string) => {
  // Every custom property first, so `var()` indirection can be followed. Tokens
  // are routinely declared in two layers — a palette scale, then semantic names
  // pointing at it — and reading only the semantic layer finds nothing but
  // `var(--blue-500)`.
  const declared = new Map<string, string>();
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+)/gi)) {
    declared.set(match[1].toLowerCase(), match[2].trim());
  }

  const deref = (value: string, depth = 0): string => {
    const reference = /^var\(\s*(--[a-z0-9-]+)/i.exec(value.trim());
    if (!reference || depth > 3) return value;
    return deref(declared.get(reference[1].toLowerCase()) ?? "", depth + 1);
  };

  const variables: string[] = [];
  for (const [name, value] of declared) {
    if (!/color|brand|primary|accent|secondary|bg|surface|ink|theme/.test(name)) {
      continue;
    }
    const hex = parseColor(deref(value));
    if (hex) variables.push(hex);
  }

  // Two is enough here, where the prototype wanted three. It read every custom
  // property a site declared, so three was a low bar; this reads only the ones
  // whose names say they are brand colours, and plenty of brands have exactly
  // two. A site that declares `--brand-primary` and `--color-accent` has already
  // answered the question — falling through to frequency counting after that is
  // ignoring the answer in favour of a guess.
  const branded = dedupe(variables).filter((hex) => !isGrey(hex));
  if (branded.length >= 2) {
    return { colors: branded.slice(0, 10), source: "css custom properties" };
  }

  const counts = new Map<string, number>();
  for (const match of css.matchAll(/#[0-9a-f]{6}\b/gi)) {
    const hex = match[0].toLowerCase();
    if (isGrey(hex)) continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }

  const frequent = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);

  if (frequent.length >= 3) {
    return { colors: frequent.slice(0, 10), source: "stylesheet frequency" };
  }

  return {
    colors: dedupe([...branded, ...frequent]).slice(0, 10),
    source: frequent.length || branded.length ? "partial" : "none",
  };
};

/* ---------------------------------------------------------------- assets --- */

const IMAGE_EXT = /\.(svg|png|jpe?g|webp|gif|ico|avif)$/i;

/**
 * A readable name for a downloaded asset.
 *
 * Naively taking the last path segment is wrong on every image CDN, and wrong in
 * a way that hides itself: Cloudflare's URLs end in a transform recipe like
 * `f=auto,fit=scale-down,metadata=none`, so eleven distinct linear.app images
 * all come back named the same thing and collapse into three. So segments that
 * carry `=` or `,` are skipped, and the last real identifier before them wins.
 */
export const assetName = (url: string) => {
  const segments = new URL(url).pathname.split("/").filter(Boolean);

  const named = [...segments].reverse().find((segment) => IMAGE_EXT.test(segment));
  if (named) return named;

  const meaningful = segments.filter(
    (segment) => !segment.includes("=") && !segment.includes(",") && segment.length > 3
  );

  return meaningful[meaningful.length - 1] ?? "asset";
};

const classify = (url: string, alt: string): CapturedAsset["role"] => {
  const haystack = `${url} ${alt}`.toLowerCase();

  if (/logo|wordmark|brandmark/.test(haystack)) return "logo";
  if (/favicon|icon|apple-touch/.test(haystack)) return "icon";
  if (/product|screenshot|hero|feature|shot|app|preview|og[-_]?image/.test(haystack)) {
    return "product";
  }
  return "image";
};

/**
 * Conventions almost every framework honours but that appear in no `src`
 * attribute. Probing them is how the prototype found carouly's real logo, which
 * is not referenced anywhere in the markup.
 *
 * A 404 page can still be 15KB of HTML, so only the status code and the content
 * type are trusted — never the response size.
 */
const WELL_KNOWN: [string, CapturedAsset["role"]][] = [
  ["logo.svg", "logo"],
  ["logo.png", "logo"],
  ["icon.svg", "icon"],
  ["icon.png", "icon"],
  ["favicon.svg", "icon"],
  ["apple-touch-icon.png", "icon"],
  ["opengraph-image.png", "product"],
  ["og-image.png", "product"],
];

const probeWellKnown = async (pageUrl: string): Promise<CapturedAsset[]> => {
  const origin = new URL(pageUrl).origin;

  const results = await Promise.all(
    WELL_KNOWN.map(async ([path, role]): Promise<CapturedAsset | null> => {
      try {
        const response = await safeFetch(`${origin}/${path}`, {
          method: "GET",
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(8000),
        });

        const type = response.headers.get("content-type") ?? "";
        if (!response.ok || !/image|svg/.test(type)) return null;

        return {
          file: path,
          role,
          sourceUrl: `${origin}/${path}`,
          alt: `well-known:${path}`,
        } satisfies CapturedAsset;
      } catch {
        return null;
      }
    })
  );

  return results.filter((asset): asset is CapturedAsset => Boolean(asset));
};

const CAPS: Record<CapturedAsset["role"], number> = {
  logo: 3,
  icon: 2,
  product: 8,
  image: 6,
};

const harvestAssets = async (
  html: string,
  pageUrl: string,
  meta: Record<string, string>
): Promise<CapturedAsset[]> => {
  const candidates: CapturedAsset[] = [];

  const add = (rawUrl: string, alt: string, role?: CapturedAsset["role"]) => {
    if (!rawUrl || rawUrl.startsWith("data:")) return;

    let absolute: string;
    try {
      absolute = new URL(rawUrl, pageUrl).href;
    } catch {
      return;
    }

    candidates.push({
      file: assetName(absolute),
      role: role ?? classify(absolute, alt),
      sourceUrl: absolute,
      alt,
    });
  };

  for (const match of html.matchAll(/<img\s+([^>]+)>/gi)) {
    const attrs = match[1];
    const src =
      /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ??
      /\bdata-src\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? "";
    if (src) add(src, decodeEntities(alt));
  }

  for (const key of ["og:image", "twitter:image", "og:image:secure_url"]) {
    if (meta[key]?.startsWith("http")) add(meta[key], key, "product");
  }

  for (const match of html.matchAll(
    /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/gi
  )) {
    add(match[1], "declared icon", "icon");
  }

  candidates.push(...(await probeWellKnown(pageUrl)));

  // Dedupe by URL, then cap per role. The caps exist because a marketing page
  // can carry sixty images and the kit only needs the ones that identify the
  // brand — everything past the cap is decoration.
  const seen = new Set<string>();
  const perRole: Record<string, number> = {};
  const out: CapturedAsset[] = [];

  for (const asset of candidates) {
    if (seen.has(asset.sourceUrl)) continue;
    if ((perRole[asset.role] ?? 0) >= CAPS[asset.role]) continue;

    seen.add(asset.sourceUrl);
    perRole[asset.role] = (perRole[asset.role] ?? 0) + 1;
    out.push(asset);
  }

  return out;
};

/* ------------------------------------------------------------------ run --- */

export const capture = async (
  input: string,
  log: (message: string) => void = () => {}
): Promise<Capture> => {
  const normalized = normalizeSite(input);
  if (!normalized.ok) throw new Error(normalized.reason);

  const url = `https://${normalized.host}`;
  let page = await fetchPage(url);
  let httpFallback: string | null = null;

  if (looksBroken(page.status, page.body) || page.body.length < 500) {
    log(`${url} returned ${page.status} — trying the other host`);

    for (const candidate of variants(url).slice(1)) {
      try {
        const retry = await fetchPage(candidate);
        if (!looksBroken(retry.status, retry.body) && retry.body.length > 2000) {
          page = retry;
          httpFallback = candidate;
          log(`recovered real HTML via ${candidate}`);
          break;
        }
      } catch {
        continue;
      }
    }
  }

  if (!page.body || page.body.length < 200) {
    throw new Error(
      `Nothing readable came back from ${normalized.host} (HTTP ${page.status}). ` +
        `If the site is behind a login or a bot wall, paste a public page instead.`
    );
  }

  // Every fallback is spent and the page is still an error page. Stopping here
  // matters more than it looks: an error page parses perfectly happily. Vercel's
  // 500 yields a title, a stylesheet and a palette — of Vercel's brand colours —
  // and the run would go on to build a confident brand kit out of it. A hard
  // failure naming the status is the only honest outcome.
  if (looksBroken(page.status, page.body)) {
    throw new Error(
      `${normalized.host} is serving an error page right now (HTTP ${page.status}), ` +
        `so there is nothing to read. Try again once the site is back up.`
    );
  }

  const html = page.body;
  const meta = metaFrom(html);
  const markdown = htmlToText(html);

  // Stylesheets are the palette's best source, so they are worth a second round
  // trip — but taking the first few in document order does not work on a
  // code-split app. linear.app links 52 sheets and the first four are component
  // files totalling 7KB with no colour in them at all. So the ones whose names
  // suggest they hold globals go first, and the budget is wide enough that a
  // token file further down the list is still reached.
  const allSheets = [
    ...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi),
  ]
    .map((match) => {
      try {
        return new URL(match[1], page.finalUrl).href;
      } catch {
        return null;
      }
    })
    .filter((href): href is string => Boolean(href));

  const looksGlobal = (href: string) =>
    /global|main|app|index|token|theme|root|layout|style|variable|base|provider/i.test(
      href.split("/").pop() ?? ""
    );

  const sheetUrls = [
    ...allSheets.filter(looksGlobal),
    ...allSheets.filter((href) => !looksGlobal(href)),
  ].slice(0, 12);

  const inlineCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1])
    .join("\n");

  const sheets = await Promise.all(
    sheetUrls.map(async (href) => {
      try {
        // These hrefs come out of the page's own markup rather than from the
        // address that was typed, so they are the least trustworthy URLs in the
        // capture — a `<link rel=stylesheet href="http://169.254.169.254/…">` is
        // a stylesheet as far as this loop is concerned.
        const response = await safeFetch(href, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(10_000),
        });
        return response.ok ? (await response.text()).slice(0, 400_000) : "";
      } catch {
        return "";
      }
    })
  );

  const palette = derivePalette([inlineCss, ...sheets].join("\n"));
  log(`palette: ${palette.colors.slice(0, 5).join(" ")} via ${palette.source}`);

  const assets = await harvestAssets(html, page.finalUrl, meta);
  log(`${assets.length} assets, ${markdown.length} characters of copy`);

  return {
    slug: slugFor(url),
    url,
    finalUrl: page.finalUrl,
    title: titleFrom(html) || meta["og:title"] || normalized.host,
    markdown,
    meta,
    palette,
    assets,
    links: linksFrom(html, page.finalUrl),
    httpFallback,
  };
};
