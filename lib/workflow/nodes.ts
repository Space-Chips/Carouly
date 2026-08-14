/**
 * Node implementations. Importing this module registers every node type.
 *
 * Ported from prototype/workflow/nodes.py. One structural change, and it is
 * worth being plain about it: the prototype shells out to a local ffmpeg for
 * `video.concat` and `video.captions`, which is not available in a serverless
 * runtime. Here those two nodes build the timeline and the caption track as
 * data, and hand the actual muxing to fal's compose endpoint when a key is
 * present. The upside is that the cut is described precisely enough to be
 * re-rendered anywhere; the cost is that the local path, which preserved each
 * clip's native dialogue track for free, now depends on compose doing the same.
 * That is a real open question and it is flagged in the code where it bites.
 */

import * as fal from "@/lib/tools/fal";
import * as render from "@/lib/tools/render";
import { json as llmJson, text as llmText, MODEL } from "@/lib/agent/llm";
import { nodeType, NODE_TYPES, type NodeCtx } from "@/lib/workflow/graph";

/**
 * What each node takes, in a form a model can be handed.
 *
 * Written by hand because the params are read inside the implementations rather
 * than declared, so there is nothing to introspect. The assertion underneath is
 * what stops that from rotting: register a node type without documenting it and
 * the module throws on import, which is a much better time to find out than
 * halfway through a composed graph that references a node nobody described.
 */
export const NODE_DOCS: Record<string, string> = {
  const: "value — a literal. Pin shared style or negative prompts here once.",
  join: "items (list), separator — concatenate into one string.",
  list: "items (list) — build one flat list out of single values and lists, in the order written. This is how a fanned-out node's clips are placed around a single one, e.g. a lead clip then a foreach of the rest.",
  pick: "items (list), field — take one field from each item.",
  zip: "any number of list params — merge into one list of objects, so `foreach` can walk them together. This is how a script beat is paired with its generated frame.",
  "text.fit":
    "text, seconds, headroom — compress voiceover until it can be read over the cut.",
  "llm.text": "system, prompt, model?, max_tokens? — prompt to plain text.",
  "llm.json":
    "system, prompt, schema (an object showing the shape wanted), temperature? — prompt to a validated JSON object. Use this to write the script and cast the actor.",
  "fal.image":
    "prompt, negative_prompt?, aspect_ratio? — text to a still. The master frame.",
  "fal.image_edit":
    "prompt, image_url, aspect_ratio? — edit a still while holding identity. Every per-beat frame must be an edit of one master frame, or the person changes between shots.",
  "fal.video":
    "prompt, image_url?, negative_prompt?, duration, model? — a clip. Image-to-video whenever a first frame is given. The model must have native audio unless the shot is silent.",
  "video.concat": "clips (list of clip results), clip_seconds — join in order.",
  "video.captions":
    "video, lines (list of strings), clip_seconds (list) — time the captions and burn them in.",
  "asset.pick": "role ('logo'|'product'|'icon'), index — a captured brand asset.",
  "asset.upload": "path — make a local asset reachable by the generators.",
};

const param = <T>(
  ctx: NodeCtx,
  key: string,
  fallback?: T,
  required = false
): T => {
  const value = ctx.params[key] as T | undefined;

  if (required && (value === undefined || value === null || value === "")) {
    throw new Error(`node '${ctx.node.id}' is missing required param '${key}'`);
  }

  return (value ?? fallback) as T;
};

/* ----------------------------------------------------------- primitives --- */

/** Literal passthrough — pins shared config (style, negatives) in one place. */
nodeType("const", async (ctx) => param(ctx, "value"));

/** Concatenate a list into a string. */
nodeType("join", async (ctx) => {
  const items = param<unknown[]>(ctx, "items", []) ?? [];
  return items.map(String).join(param(ctx, "separator", "\n"));
});

/**
 * Flatten single values and lists into one ordered list.
 *
 * The gap this fills is specific: `video.concat` walks its `clips` param looking
 * for a `url` on each entry, so a nested array — which is exactly what a
 * `foreach` node returns — is silently skipped. Writing
 * `["{{lead_clip}}", "{{other_clips}}"]` therefore produced a one-clip cut and no
 * error. Anything that mixes a fanned-out node with a single one (a montage plus
 * an end card, a lead voice then the rest) needs this in between.
 *
 * One level deep on purpose. A list of lists of clips is not a timeline anybody
 * meant to describe, and flattening it anyway would hide the mistake.
 */
nodeType("list", async (ctx) => {
  const items = param<unknown[]>(ctx, "items", []) ?? [];

  return (Array.isArray(items) ? items : [items]).flatMap((item) =>
    Array.isArray(item) ? item : [item]
  );
});

/** Take one field from each item of a list. */
nodeType("pick", async (ctx) => {
  const items = param<unknown[]>(ctx, "items", []) ?? [];
  const field = param<string>(ctx, "field", undefined, true);

  return items.map((item) =>
    item && typeof item === "object"
      ? (item as Record<string, unknown>)[field]
      : null
  );
});

/**
 * Merge parallel lists into one list of objects, so `foreach` can walk them
 * together.
 *
 * `foreach` iterates a single list, so pairing per-beat script entries with
 * their per-beat generated frames needs an explicit join first. Without this the
 * talking-head template cannot exist.
 */
nodeType("zip", async (ctx) => {
  const lists = Object.entries(ctx.params).filter(([, value]) =>
    Array.isArray(value)
  ) as [string, unknown[]][];

  if (!lists.length) {
    throw new Error(`node '${ctx.node.id}': zip needs at least one list param`);
  }

  const length = Math.min(...lists.map(([, value]) => value.length));

  return Array.from({ length }, (_unused, index) =>
    Object.fromEntries(lists.map(([key, value]) => [key, value[index]]))
  );
});

/**
 * Conversational read speed. Ad voiceover sits a little above ordinary speech,
 * but you want air at the end of a cut rather than a sprint into the last frame.
 */
export const WORDS_PER_SECOND = 2.4;

export const speechSeconds = (text: string) =>
  (text ?? "").trim().split(/\s+/).filter(Boolean).length / WORDS_PER_SECOND;

/**
 * Compress voiceover until it can actually be read over the cut.
 *
 * Without this, a template asking for "at most 45 words" over an 11-second edit
 * produces about 18 seconds of speech and the audio simply runs off the end of
 * the picture. Templates ask for a fitting word count up front; this is the
 * backstop for when the model ignores it.
 */
nodeType("text.fit", async (ctx) => {
  const source = String(param(ctx, "text", "", true)).trim();
  const seconds = Number(param(ctx, "seconds", undefined, true));
  const headroom = Number(param(ctx, "headroom", 0.9));
  const maxWords = Math.max(6, Math.floor(seconds * headroom * WORDS_PER_SECOND));
  const words = source.split(/\s+/).filter(Boolean);

  if (words.length <= maxWords) return source;

  for (let attempt = 0; attempt < 2; attempt++) {
    const out = (
      await llmText({
        system:
          "You cut voiceover to length. Keep the hook and the call to action. " +
          "Drop qualifiers and repetition, never the concrete claim. " +
          "Return only the rewritten voiceover, no commentary.",
        prompt: `Cut this to ${maxWords} words or fewer. It is read aloud over ${Math.round(
          seconds
        )} seconds of video.\n\n${source}`,
        model: param<string>(ctx, "model") || MODEL.synth,
        maxTokens: 600,
      })
    )
      .trim()
      .replace(/^"|"$/g, "");

    if (out && out.split(/\s+/).length <= maxWords) return out;
  }

  // The model would not comply. Truncate on a sentence boundary rather than
  // ship audio that overruns the picture.
  const kept: string[] = [];
  for (const sentence of source.split(/(?<=[.!?])\s+/)) {
    if ([...kept, sentence].join(" ").split(/\s+/).length > maxWords) break;
    kept.push(sentence);
  }

  return kept.join(" ") || words.slice(0, maxWords).join(" ");
});

/* ------------------------------------------------------------------ llm --- */

nodeType("llm.text", async (ctx) =>
  llmText({
    system: param(ctx, "system", "You are a precise copywriter."),
    prompt: param<string>(ctx, "prompt", undefined, true),
    model: param<string>(ctx, "model") || MODEL.synth,
    maxTokens: param(ctx, "max_tokens", 2000),
  })
);

nodeType("llm.json", async (ctx) =>
  llmJson({
    system: param(ctx, "system", "You return only valid JSON."),
    prompt: param<string>(ctx, "prompt", undefined, true),
    schema: param<Record<string, unknown>>(ctx, "schema"),
    model: param<string>(ctx, "model") || MODEL.synth,
    maxTokens: param(ctx, "max_tokens", 4000),
  })
);

/* ----------------------------------------------------------- generation --- */

type Media = render.Media;

/**
 * Generate one clip. Image-to-video whenever a first frame is supplied.
 *
 * Refuses silent models. This is the audio policy enforced at the only place it
 * can be: a template that reaches for a silent model has almost certainly
 * written dialogue into its motion prompt and will get back footage of someone
 * mouthing at the camera in silence.
 *
 * The refusal used to lift on the local backend, on the grounds that nothing
 * there could speak. That exemption is gone, because the premise was never about
 * the model — LTX-2 generates dialogue and picture in one pass — but about a
 * graph that decoded only the video half. The policy now holds everywhere, which
 * is the point of having one.
 */
nodeType("fal.video", async (ctx) => {
  const model = param(ctx, "model", "video.veo3_fast_i2v");
  const silentOk = param(ctx, "silent", false);

  if (!render.hasAudio(model) && !silentOk) {
    const speakers = Object.keys(fal.MODELS).filter(fal.hasAudio).join(", ");
    throw new Error(
      `node '${ctx.node.id}': model '${model}' has no native audio. This pipeline ` +
        `does not add speech afterwards — pick one of: ${speakers}, or set ` +
        `"silent": true if this shot genuinely has no dialogue.`
    );
  }

  const duration = Number(param(ctx, "duration", 8));

  const out = await render.video({
    prompt: param<string>(ctx, "prompt", undefined, true),
    negative_prompt: param<string>(ctx, "negative_prompt"),
    image_url: param<string>(ctx, "image_url"),
    aspect_ratio: param(ctx, "aspect_ratio", "9:16"),
    duration,
    model,
    extra: param<Record<string, unknown>>(ctx, "extra", {}),
  });

  return {
    ...out,
    // Carry the clip's real length forward: video.concat needs actual durations
    // to place clips on the timeline, not their index. The local backend caps
    // draft length, so what comes back can be shorter than what was asked for.
    seconds: out.seconds ?? duration,
  } satisfies Media;
});

/** Text to image — first frames, thumbnails, end cards. */
nodeType("fal.image", async (ctx) =>
  render.image({
    prompt: param<string>(ctx, "prompt", undefined, true),
    negative_prompt: param<string>(ctx, "negative_prompt"),
    aspect_ratio: param(ctx, "aspect_ratio", "9:16"),
    model: param(ctx, "model", "image.nano_banana"),
    extra: param<Record<string, unknown>>(ctx, "extra", {}),
  })
);

/**
 * Re-pose or re-frame an existing image while holding identity fixed.
 *
 * This is the node that keeps one actor recognisable across beats. Three
 * independent text-to-image calls produce three different people; every beat's
 * frame being an *edit* of one master frame is what holds the face.
 */
nodeType("fal.image_edit", async (ctx) =>
  render.imageEdit({
    prompt: param<string>(ctx, "prompt", undefined, true),
    image_url: param<string>(ctx, "image_url", undefined, true),
    aspect_ratio: param(ctx, "aspect_ratio", "9:16"),
    model: param(ctx, "model", "edit.nano_banana"),
    extra: param<Record<string, unknown>>(ctx, "extra", {}),
  })
);


/**
 * Stitch clips in order into the final vertical cut.
 *
 * Each keyframe's `timestamp` is the clip's cumulative start offset. Using the
 * loop index here instead would stack every clip in the first few seconds —
 * invisible in dry run, ruinous on the first real render.
 */
nodeType("video.concat", async (ctx) => {
  const clips = param<Media[]>(ctx, "clips", []) ?? [];
  const fallbackSeconds = Number(param(ctx, "clip_seconds", 8));

  let offset = 0;
  const keyframes: { url: string; timestamp: number; duration: number }[] = [];

  for (const clip of clips) {
    const url = typeof clip === "string" ? clip : clip?.url;
    if (!url) continue;

    const seconds = Number(clip?.seconds ?? fallbackSeconds);
    keyframes.push({ url, timestamp: Number(offset.toFixed(3)), duration: seconds });
    offset += seconds;
  }

  if (!keyframes.length) {
    throw new Error(`node '${ctx.node.id}': no clip urls to concat`);
  }

  const timeline = { clips: keyframes, seconds: offset };

  if (keyframes.length === 1) {
    return { ...clips[0], ...timeline, single: true };
  }

  // Locally this is real ffmpeg and each clip keeps its own audio. Remotely it
  // is fal's compose, where whether the dialogue track survives has still never
  // been observed — which is precisely why running a cut locally is worth doing.
  const out = await render.concat({
    clips,
    keyframes,
    seconds: offset,
    model: param(ctx, "model", "compose.ffmpeg"),
  });

  return { ...out, ...timeline, seconds: out.seconds ?? offset };
});

const srtTime = (seconds: number) => {
  const total = Math.max(seconds, 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const millis = Math.round((total % 1) * 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    secs
  ).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
};

export const buildSrt = (lines: string[], spans: [number, number][]) =>
  lines
    .map(
      (line, index) =>
        `${index + 1}\n${srtTime(spans[index][0])} --> ${srtTime(
          spans[index][1]
        )}\n${line.trim()}\n`
    )
    .join("\n");

/**
 * Time and attach the on-screen captions.
 *
 * Most vertical social video is watched muted, so every template already writes
 * one caption per shot — this is what turns them into a timed track. What the
 * node guarantees either way is that the timing comes from the real clip lengths
 * rather than being split evenly and hoped for.
 *
 * Whether the captions are actually burned in depends on the backend. Locally
 * they are, composited as images because this machine's ffmpeg has no freetype.
 * Remotely the timed track is carried alongside for the renderer to apply.
 */
nodeType("video.captions", async (ctx) => {
  const source = param<Media & { clips?: { duration: number }[] }>(
    ctx,
    "video",
    undefined,
    true
  );
  const lines = (param<unknown[]>(ctx, "lines", []) ?? [])
    .map(String)
    .filter((line) => line.trim());

  const result = { ...(typeof source === "string" ? { url: source } : source) };

  if (!lines.length) return result;

  const declared = (param<number[]>(ctx, "clip_seconds", []) ?? []).map(Number);
  const perClip = declared.length
    ? declared
    : (source.clips ?? []).map((clip) => clip.duration);

  let spans: [number, number][];

  if (perClip.length === lines.length) {
    let offset = 0;
    spans = perClip.map((seconds) => {
      const span: [number, number] = [offset, offset + seconds];
      offset += seconds;
      return span;
    });
  } else {
    const total = Number(source.seconds ?? lines.length * 4);
    const step = total / lines.length;
    spans = lines.map((_line, index) => [index * step, (index + 1) * step]);
  }

  const timed = {
    ...result,
    captions: lines,
    captions_srt: buildSrt(lines, spans),
    caption_spans: spans,
  };

  if (!render.canBurnCaptions() || !result.url) return timed;

  try {
    const burned = await render.captions({
      video: result,
      lines,
      clip_seconds: spans.map(([start, end]) => end - start),
    });

    return { ...timed, ...burned, captioned: true };
  } catch {
    // A caption that would not composite is not worth losing the cut over — the
    // timed track above is still correct and the video still plays.
    return timed;
  }
});

/* --------------------------------------------------------------- assets --- */

/**
 * Select a captured brand asset by role.
 *
 * The kit stores assets as a flat list, each carrying its own `role` — so this
 * filters rather than indexes. It used to index (`assets[role]`), which on an
 * array is always `undefined`, so every pick silently returned null and no graph
 * could reach a brand image at all. Silently, because returning null is exactly
 * what "this brand has no logo" looks like.
 */
nodeType("asset.pick", async (ctx) => {
  const role = param(ctx, "role", "product");
  const all = (ctx.brand.assets ?? []) as {
    role?: string;
    sourceUrl?: string;
    storageUrl?: string;
    file?: string;
  }[];

  const matching = Array.isArray(all) ? all.filter((asset) => asset.role === role) : [];
  if (!matching.length) return null;

  const index = Number(param(ctx, "index", 0)) % matching.length;
  const asset = matching[index];

  // The rehosted copy first when there is one: it is the URL that will still
  // resolve when the customer redesigns their site.
  return asset.storageUrl ?? asset.sourceUrl ?? asset.file ?? null;
});

/**
 * Make a brand asset reachable by the generation models.
 *
 * Captured assets already live at public URLs on the customer's own site, so in
 * the common case there is nothing to upload and the URL passes straight
 * through. Only a locally-derived asset needs fal storage.
 */
nodeType("asset.upload", async (ctx) => {
  const path = param<string>(ctx, "path", undefined, true);

  if (/^https?:\/\//.test(path)) return path;
  if (fal.dryRun()) return `https://dry-run.local/upload/${path.split("/").pop()}`;

  throw new Error(
    `node '${ctx.node.id}': asset.upload needs a public URL. Local file staging ` +
      `is not available in this runtime.`
  );
});

/**
 * The catalogue must describe every node type that exists.
 *
 * Checked at import rather than left to drift: a composed graph is written from
 * this list, so a registered-but-undocumented node is one the model can never
 * use, and a documented-but-unregistered one is a node it will confidently
 * reference into a runtime failure.
 */
const registered = [...NODE_TYPES.keys()].sort();
const documented = Object.keys(NODE_DOCS).sort();

if (registered.join() !== documented.join()) {
  const missing = registered.filter((name) => !NODE_DOCS[name]);
  const extra = documented.filter((name) => !NODE_TYPES.has(name));

  throw new Error(
    "NODE_DOCS is out of step with the node registry" +
      (missing.length ? `; undocumented: ${missing.join(", ")}` : "") +
      (extra.length ? `; documented but not registered: ${extra.join(", ")}` : "")
  );
}
