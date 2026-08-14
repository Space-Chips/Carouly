/**
 * Where generation actually happens.
 *
 * Three backends, one shape. The graph, the templates and the nodes do not know
 * which one is live — they ask for a shot and get a URL back — so moving between
 * them is an env var rather than a code change:
 *
 *   CAROULY_RENDER=local   the machine in front of you, via render-server/
 *   CAROULY_RENDER=fal     fal.ai, the production path (default when FAL_KEY is set)
 *   CAROULY_RENDER=dry     nothing is called and placeholders come back
 *
 * The local path exists because iterating on a template at production quality is
 * absurd: you are checking whether the framing works and whether the actor's
 * face survives three beats, and you can see both of those at 480p for nothing.
 *
 * The audio policy bends here, and only here. Production refuses silent video
 * models outright, because a talking-head clip from one is footage of somebody
 * mouthing at the camera. A local draft is silent by nature, so the refusal is
 * suspended and every output is stamped `draft` instead — the check that matters
 * is that nothing silent can reach a customer, not that nothing silent can exist.
 */

import * as fal from "@/lib/tools/fal";

export type Mode = "local" | "fal" | "dry";

export const mode = (): Mode => {
  const explicit = process.env.CAROULY_RENDER?.trim();
  if (explicit === "local" || explicit === "fal" || explicit === "dry") return explicit;

  // Unset: use fal if it can be used, otherwise cost nothing.
  return process.env.FAL_KEY?.trim() && process.env.CAROULY_DRY_RUN !== "1"
    ? "fal"
    : "dry";
};

const localUrl = () =>
  (process.env.LOCAL_RENDER_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");

/**
 * True when output is draft quality — smaller, quicker, not shippable.
 *
 * This is now only about *quality*. It used to double as "and therefore silent",
 * which was true of the first local graph and is not true of the model: LTX-2
 * generates dialogue and picture in one sampling pass. The two facts have been
 * separated because conflating them is what let a whole backend go quietly mute
 * without anything in the pipeline objecting.
 */
export const draftOnly = () => mode() === "local";

/** Whether a model speaks. LTX-2 does, natively and in sync. */
export const hasAudio = (model: string) =>
  mode() === "local" ? true : fal.hasAudio(model);

export type Media = {
  url?: string;
  file?: string;
  seconds?: number;
  has_audio?: boolean;
  model?: string;
  /** A stubbed placeholder — never a real render. */
  dry_run?: boolean;
  /** A real render at draft quality. Not the same thing as a stub. */
  draft?: boolean;
  captions?: string[];
  captions_srt?: string;
  clips?: unknown;
};

const local = async (path: string, body: unknown): Promise<Media> => {
  let response: Response;

  try {
    response = await fetch(`${localUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Generation on a laptop is minutes, not seconds.
      signal: AbortSignal.timeout(20 * 60 * 1000),
    });
  } catch (error) {
    throw new Error(
      `The local render server is not answering at ${localUrl()}. Start it with ` +
        `\`npm run render\`. (${error instanceof Error ? error.message : error})`
    );
  }

  const payload = await response.json();

  // A failure can arrive as 200: the render server commits its status line up
  // front so that a six-minute generation is not cut off by undici's own
  // five-minute headers deadline, which leaves the error itself as the only
  // signal. See the heartbeat comment in render-server/server.ts.
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error ?? `render ${path} failed`);
  }

  return payload as Media;
};

const stub = async (kind: string, body: unknown): Promise<Media> => {
  const bytes = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(kind + JSON.stringify(body))
  );
  const id = [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);

  return { url: `https://dry-run.local/${id}.${kind === "video" ? "mp4" : "png"}`, dry_run: true };
};

const fromFal = (result: fal.FalResult): Media => ({
  url: fal.firstUrl(result),
  model: result._model,
  dry_run: result._dry_run === true,
});

/* ------------------------------------------------------------------ image --- */

/**
 * Editing a still is the one thing the local stack cannot do.
 *
 * Z-Image Turbo makes the master frame, and LTX makes the clips — but the
 * per-beat frames are *edits* that have to hold the master's face, and neither
 * model does that. So `imageEdit` alone falls back: to fal when there is a key,
 * to a stub when there is not, which still lets the whole graph run.
 */
const editBackend = (): Mode =>
  mode() === "local" ? (process.env.FAL_KEY?.trim() ? "fal" : "dry") : mode();

export const image = async (params: {
  prompt: string;
  negative_prompt?: string;
  aspect_ratio?: string;
  model?: string;
  extra?: Record<string, unknown>;
}): Promise<Media> => {
  if (mode() === "dry") return stub("image", params);

  // The master frame. Local, because it is the identity anchor for every beat
  // that follows and iterating on it is most of the work.
  if (mode() === "local") {
    return local("/image", {
      prompt: params.prompt,
      negative_prompt: params.negative_prompt,
    });
  }

  return fromFal(
    await fal.submit(params.model ?? "image.nano_banana", {
      prompt: params.prompt,
      aspect_ratio: params.aspect_ratio ?? "9:16",
      num_images: 1,
      ...(params.negative_prompt ? { negative_prompt: params.negative_prompt } : {}),
      ...(params.extra ?? {}),
    })
  );
};

export const imageEdit = async (params: {
  prompt: string;
  image_url: string;
  aspect_ratio?: string;
  model?: string;
  extra?: Record<string, unknown>;
}): Promise<Media> => {
  /**
   * Local, with no editor and no key: hand the master frame straight back.
   *
   * A stub here is worse than useless — it is a `dry-run.local` URL that the
   * next node hands to a real backend as a first frame, which fails on DNS
   * three minutes into a run. Passing the source through means every beat
   * starts from the master frame instead of an edit of it: the change of
   * expression and framing is lost, and identity is held perfectly, which is
   * the right trade for a draft whose whole job is to show framing and pacing.
   */
  if (mode() === "local" && editBackend() === "dry") {
    return { url: params.image_url, draft: true };
  }

  if (editBackend() === "dry") return stub("image", params);

  return fromFal(
    await fal.submit(params.model ?? "edit.nano_banana", {
      prompt: params.prompt,
      image_urls: [params.image_url],
      aspect_ratio: params.aspect_ratio ?? "9:16",
      num_images: 1,
      ...(params.extra ?? {}),
    })
  );
};

/* ------------------------------------------------------------------ video --- */

export const video = async (params: {
  prompt: string;
  negative_prompt?: string;
  image_url?: string;
  aspect_ratio?: string;
  duration: number;
  model?: string;
  extra?: Record<string, unknown>;
}): Promise<Media> => {
  if (mode() === "dry") {
    return { ...(await stub("video", params)), seconds: params.duration, has_audio: false };
  }

  if (mode() === "local") {
    return local("/video", {
      prompt: params.prompt,
      negative_prompt: params.negative_prompt,
      image_url: params.image_url,
      duration: params.duration,
    });
  }

  const model = params.model ?? "video.veo3_fast_i2v";

  return {
    ...fromFal(
      await fal.submit(model, {
        prompt: params.prompt,
        aspect_ratio: params.aspect_ratio ?? "9:16",
        duration: params.duration,
        ...(params.image_url ? { image_url: params.image_url } : {}),
        ...(params.negative_prompt ? { negative_prompt: params.negative_prompt } : {}),
        ...(fal.hasAudio(model) ? { generate_audio: true } : {}),
        ...(params.extra ?? {}),
      })
    ),
    seconds: params.duration,
    has_audio: fal.hasAudio(model),
  };
};

/* --------------------------------------------------------------- assembly --- */

/**
 * Join the shots.
 *
 * Locally this is real ffmpeg with each clip's own audio preserved, which is the
 * behaviour the production path is supposed to have and has never been able to
 * demonstrate — a lambda has no ffmpeg, so fal's compose does the joining there
 * and whether it keeps the dialogue track is still unverified. Running a cut
 * locally is currently the only way to see the intended result.
 */
export const concat = async (params: {
  clips: Media[];
  keyframes: { url: string; timestamp: number; duration: number }[];
  seconds: number;
  model?: string;
}): Promise<Media> => {
  if (mode() === "dry") return { ...(await stub("video", params.keyframes)), seconds: params.seconds };

  if (mode() === "local") {
    return local("/concat", { clips: params.clips.map((clip) => ({ url: clip.url })) });
  }

  return {
    ...fromFal(
      await fal.submit(params.model ?? "compose.ffmpeg", {
        tracks: [{ id: "video", type: "video", keyframes: params.keyframes }],
      })
    ),
    seconds: params.seconds,
  };
};

/** True when the backend can actually burn captions rather than describe them. */
export const canBurnCaptions = () => mode() === "local";

export const captions = async (params: {
  video: Media;
  lines: string[];
  clip_seconds: number[];
}): Promise<Media> => {
  // Guarded by canBurnCaptions() at the call site, but stated here too: this is
  // the one entry point with no remote equivalent, and silently posting to a
  // local port that is not running would be a confusing way to find that out.
  if (mode() !== "local") {
    throw new Error("burning captions needs the local render server");
  }

  return local("/captions", {
    video: { url: params.video.url },
    lines: params.lines,
    clip_seconds: params.clip_seconds,
  });
};

/**
 * Add designed copy as a separate visual layer.
 *
 * Captions follow dialogue; overlays are hooks, labels and call-outs that
 * belong to the picture even when nobody is speaking.
 */
export const textOverlays = async (params: {
  video: Media;
  items: {
    text: string;
    start: number;
    end: number;
    position?: "top" | "center" | "bottom";
  }[];
}): Promise<Media> => {
  if (mode() !== "local") {
    throw new Error("burning text overlays needs the local render server");
  }

  return local("/text-overlays", {
    video: { url: params.video.url },
    items: params.items,
  });
};
