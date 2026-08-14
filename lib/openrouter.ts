import { createHash } from "crypto";

/**
 * Thin OpenRouter client. One place that knows about models, so swapping a
 * model is an env change, not a code change.
 *
 * OPENROUTER_TEXT_MODEL  — writes keywords, slide copy and captions.
 * OPENROUTER_IMAGE_MODEL — generates the hook-slide background image.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_IMAGE_URL = "https://openrouter.ai/api/v1/images/generations";

/**
 * Requested hook-image size: exactly 4:5, matching the slide, and both
 * dimensions divisible by 16 as diffusion models expect. Asking for the right
 * aspect beats generating a square and cropping half the composition away.
 */
export const IMAGE_SIZE = "832x1040";

export const TEXT_MODEL =
  process.env.OPENROUTER_TEXT_MODEL ?? "anthropic/claude-sonnet-5";

export const IMAGE_MODEL =
  process.env.OPENROUTER_IMAGE_MODEL ?? "google/gemini-2.5-flash-image";

/**
 * Whitespace around an env value survives some dotenv parsers, and a key with
 * a stray space fails in ways that look nothing like "your key is malformed".
 */
const apiKey = () => {
  const key = process.env.OPEN_ROUTER_API?.trim();

  if (!key) {
    throw new Error(
      "OPEN_ROUTER_API is not set. Get one at https://openrouter.ai/keys"
    );
  }

  return key;
};

/**
 * A non-secret fingerprint of the key actually loaded into this process.
 *
 * Env files are read once at boot and can be shadowed by an exported shell
 * variable, so "which key is the server really using" is otherwise
 * unanswerable from the outside. This is a truncated one-way hash — it
 * identifies the key without revealing it.
 */
export const keyFingerprint = (): string => {
  try {
    return `${createHash("sha256").update(apiKey()).digest("hex").slice(0, 12)}/${apiKey().length}`;
  } catch {
    return "unset";
  }
};

const headers = () => {
  return {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
    // OpenRouter uses these for attribution on its leaderboards.
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    "X-Title": "Carouly",
  };
};

type ChatMessage = { role: "system" | "user"; content: string };

const postChat = async (body: Record<string, unknown>) => {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `OpenRouter request failed (${response.status}): ${detail.slice(0, 500)}`
    );
  }

  return response.json();
};

/**
 * Asks the model for JSON and parses it. Models occasionally wrap JSON in a
 * fenced block or add a sentence around it, so we extract the outermost
 * JSON value rather than trusting the response verbatim.
 */
export const completeJson = async <T>({
  system,
  prompt,
  maxTokens = 4000,
  model = TEXT_MODEL,
}: {
  system: string;
  prompt: string;
  maxTokens?: number;
  model?: string;
}): Promise<T> => {
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: prompt },
  ];

  const data = await postChat({
    model,
    messages,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
  });

  const choice = data?.choices?.[0];
  const content: string = choice?.message?.content ?? "";

  /**
   * A completion stopped by the token ceiling ran out of room; it is not wrong.
   *
   * Checked before the empty-content case below, because both are the same fault
   * and only this one names it. Two shapes reach here:
   *
   *  - Partial JSON. `parseJson`'s salvage slices to the last `}` and hands back
   *    a string ending just after an array element, so `JSON.parse` reports
   *    `Expected ',' or ']' after array element at position 11135` — which reads
   *    as "the model wrote bad JSON" and sends `json()` into a retry at the same
   *    ceiling for the same result. One brand kit that needed more room became
   *    three truncated ones and four minutes, then an error naming the wrong
   *    cause.
   *  - Nothing at all. On a reasoning model the ceiling covers reasoning tokens,
   *    so a large schema can spend the whole budget thinking and emit zero
   *    characters. Measured on claude-sonnet-5: 900 completion tokens, 0 chars,
   *    `finish_reason: length`. Reported as "empty completion" it looks like a
   *    provider fault and is not retried usefully; reported as truncation it is
   *    recoverable, which it is.
   *
   * `native_finish_reason` is checked too because OpenRouter passes the upstream
   * provider's own wording through beside its normalised one.
   */
  if (
    choice?.finish_reason === "length" ||
    choice?.native_finish_reason === "max_tokens" ||
    choice?.native_finish_reason === "length"
  ) {
    throw new TruncatedError(
      `the answer was cut off at the ${maxTokens}-token ceiling ` +
        `(${content.length} characters arrived` +
        `${data?.usage?.completion_tokens ? `, ${data.usage.completion_tokens} tokens spent` : ""})`
    );
  }

  if (!content.trim()) {
    throw new Error("OpenRouter returned an empty completion.");
  }

  return parseJson<T>(content);
};

/**
 * The model ran out of room, rather than getting the shape wrong.
 *
 * Its own type so a retry can respond by raising the ceiling instead of asking
 * the identical question again.
 */
export class TruncatedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TruncatedError";
  }
}

export const parseJson = <T>(content: string): T => {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fall back to the first balanced object/array in the string.
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));

    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }

    throw new Error(
      `Model did not return valid JSON: ${cleaned.slice(0, 300)}`
    );
  }
};

export type GeneratedImage = { bytes: Uint8Array; contentType: string };

/**
 * OpenRouter serves image models through two different APIs, and which one a
 * model supports is not something you can tell from its name:
 *
 *  - /images/generations — the OpenAI-style image API. Dedicated diffusion
 *    models (Black Forest Labs FLUX, etc.) live here, and it accepts `size`,
 *    so we can ask for the slide's 4:5 aspect directly.
 *  - /chat/completions with `modalities: ["image","text"]` — multimodal chat
 *    models (Gemini image, GPT image) return pictures this way instead.
 *
 * Calling the wrong one returns 404 "No endpoints found that support the
 * requested output modalities", so we try the image API first and fall back.
 */
const viaImagesApi = async (prompt: string): Promise<GeneratedImage | null> => {
  const response = await fetch(OPENROUTER_IMAGE_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      size: IMAGE_SIZE,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `images API (${response.status}): ${(await response.text()).slice(0, 300)}`
    );
  }

  const data = await response.json();
  const first = data?.data?.[0];

  if (first?.b64_json) {
    return {
      bytes: Uint8Array.from(Buffer.from(first.b64_json, "base64")),
      contentType: first.media_type ?? "image/png",
    };
  }

  if (first?.url) return download(first.url);

  return null;
};

const viaChatCompletions = async (
  prompt: string
): Promise<GeneratedImage | null> => {
  const data = await postChat({
    model: IMAGE_MODEL,
    modalities: ["image", "text"],
    messages: [{ role: "user", content: prompt }],
  });

  const url: string | undefined =
    data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

  if (!url) return null;

  const match = /^data:([^;]+);base64,(.+)$/.exec(url);

  if (match) {
    return {
      bytes: Uint8Array.from(Buffer.from(match[2], "base64")),
      contentType: match[1],
    };
  }

  return download(url);
};

const download = async (url: string): Promise<GeneratedImage | null> => {
  const remote = await fetch(url);
  if (!remote.ok) return null;

  return {
    bytes: new Uint8Array(await remote.arrayBuffer()),
    contentType: remote.headers.get("content-type") ?? "image/png",
  };
};

/**
 * Generates the hook image.
 *
 * Throws with a readable reason rather than returning null on failure: the
 * caller keeps the carousel either way, but a misconfigured model must be
 * visible instead of silently producing image-less carousels forever.
 */
export const generateImage = async (
  prompt: string
): Promise<GeneratedImage | null> => {
  let imagesApiError: unknown;

  // Two attempts. Rejections at a spend-cap boundary (403) and provider
  // hiccups (429/5xx) are intermittent — the same request often succeeds
  // seconds later — and losing the hook image costs a whole carousel's look.
  // A 404 means the model does not serve this API at all, so it is not
  // retried; the chat-completions fallback below is the right next step.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await viaImagesApi(prompt);
      if (result) return result;
      break;
    } catch (error) {
      imagesApiError = error;

      const permanent = /\(404\)/.test(String(error));
      if (permanent || attempt === 1) break;

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  try {
    return await viaChatCompletions(prompt);
  } catch (chatError) {
    const detail = imagesApiError
      ? `${String(imagesApiError)} | chat: ${String(chatError)}`
      : String(chatError);

    throw new Error(
      `Image model "${IMAGE_MODEL}" produced nothing [key ${keyFingerprint()}]. ${detail}`
    );
  }
};
