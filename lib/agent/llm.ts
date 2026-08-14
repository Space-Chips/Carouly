/**
 * Model access for the pipeline, with the guards the prototype learned it needed.
 *
 * `lib/openrouter.ts` is the transport and stays that way. What lives here is
 * everything that exists because a model is not a function: JSON that arrives
 * wrapped in prose, a schema whose keys came back empty, a router that hands the
 * next call to a different model than the last one.
 *
 * Every entry point degrades rather than throws where a degraded answer is still
 * useful, and throws with a readable reason where it is not.
 */

import {
  completeJson,
  parseJson,
  TEXT_MODEL,
  TruncatedError,
} from "@/lib/openrouter";

export class ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelError";
  }
}

/** True when the app has no model key at all, so callers can offer a demo path. */
export const hasModel = () => Boolean(process.env.OPEN_ROUTER_API?.trim());

export const MODEL = {
  /** The tool-calling loop. Wants instruction-following more than prose. */
  agent: process.env.CAROULY_MODEL_AGENT ?? TEXT_MODEL,
  /** Structured generation: brand.json, casting, script beats. */
  synth: process.env.CAROULY_MODEL_SYNTH ?? TEXT_MODEL,
};

type Message = { role: "system" | "user" | "assistant"; content: string };

/**
 * Prompt to plain text.
 *
 * Written on top of completeJson's transport rather than beside it so there is
 * one place that knows the endpoint, the headers and the key.
 */
export const text = async ({
  system,
  prompt,
  model = MODEL.synth,
  maxTokens = 2000,
}: {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}): Promise<string> => {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPEN_ROUTER_API?.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "Carouly",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ] satisfies Message[],
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    throw new ModelError(
      `text call failed (${response.status}): ${(await response.text()).slice(0, 300)}`
    );
  }

  const data = await response.json();
  // Some models return `"content": null` rather than omitting the field.
  return String(data?.choices?.[0]?.message?.content ?? "").trim();
};

/**
 * Prompt to a JSON object, validated on its top-level keys and retried.
 *
 * The key validation is the load-bearing part. A model that drops `shots` does
 * not fail here — it fails three nodes later on a missing required param, which
 * is a confusing place to find out the real problem. Checking at the boundary
 * makes the retry cheap and the error name the actual cause.
 */
export const json = async <T extends Record<string, unknown>>({
  system,
  prompt,
  schema,
  model = MODEL.synth,
  maxTokens = 4000,
  attempts = 3,
  onAttempt,
}: {
  system: string;
  prompt: string;
  /** Either a shape to show the model, or a list of keys that must come back filled. */
  schema?: Record<string, unknown> | string;
  model?: string;
  maxTokens?: number;
  attempts?: number;
  /**
   * Called before each try, with the reason the last one was rejected.
   *
   * Exists so a caller can say so on screen. A retry here is a whole extra model
   * call — thirty to sixty seconds on a big schema — and without this the only
   * thing the person watching sees is that one step is taking three times longer
   * than it usually does, with no indication that anything is being re-asked.
   */
  onAttempt?: (info: { attempt: number; of: number; problem?: string }) => void;
}): Promise<T> => {
  const required =
    schema && typeof schema === "object" ? Object.keys(schema) : [];

  const hint = schema
    ? `\n\nReturn JSON matching exactly this shape:\n${
        typeof schema === "string" ? schema : JSON.stringify(schema, null, 2)
      }`
    : "";

  let current = prompt + hint;
  let lastProblem = "";

  /**
   * The token ceiling for this attempt, which can go up.
   *
   * A retry is only worth making if something about the request changed. For a
   * wrong *shape* that something is the added instruction below; for an answer
   * that was simply cut off, the prompt is already right and the only useful
   * change is more room. Asking the identical question again at the identical
   * ceiling is how one truncated brand kit turned into three of them.
   */
  let budget = maxTokens;

  for (let attempt = 0; attempt < attempts; attempt++) {
    let data: unknown;

    onAttempt?.({
      attempt: attempt + 1,
      of: attempts,
      problem: lastProblem || undefined,
    });

    try {
      data = await completeJson<unknown>({
        system,
        prompt: current,
        model,
        maxTokens: budget,
      });
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error);

      // Half again, capped: enough to clear a schema that was close, without
      // letting a model that would happily write forever bill for it.
      if (error instanceof TruncatedError) {
        budget = Math.min(Math.round(budget * 1.5), 32_000);
        lastProblem += ` — retrying with ${budget} tokens`;
      }

      continue;
    }

    // Weaker models wrap the object in a single-element array.
    if (Array.isArray(data)) {
      data = data.find((entry) => entry && typeof entry === "object");
    }

    if (!data || typeof data !== "object") {
      lastProblem = "model returned a non-object";
      current = `${prompt}${hint}\n\nReturn a JSON OBJECT, not an array or a string.`;
      continue;
    }

    const record = data as Record<string, unknown>;
    const missing = required.filter((key) => {
      const value = record[key];
      return (
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
      );
    });

    if (missing.length === 0) return record as T;

    lastProblem = `missing or empty keys: ${missing.join(", ")}`;
    current = `${prompt}${hint}\n\nYour previous answer omitted these required keys: ${missing.join(
      ", "
    )}. Include every key with a non-empty value.`;
  }

  throw new ModelError(
    `model never produced usable JSON after ${attempts} attempts (${lastProblem})`
  );
};

export { parseJson };
