/**
 * The Draw Things adapter.
 *
 * Draw Things exposes an HTTP API that follows the AUTOMATIC1111 shape:
 * `/sdapi/v1/txt2img`, `/sdapi/v1/img2img`, `/sdapi/v1/options` and
 * `/sdapi/v1/sd-models`, with base64 images in and base64 images out. Video
 * models are driven through the same two endpoints and return a *sequence* of
 * images — the frames — rather than one.
 *
 * A word on confidence, because it matters for debugging: the endpoint paths
 * and the base64-in/base64-out contract are stable across A1111-compatible
 * servers and are what this is written against. The exact spelling of the
 * video-specific fields (how you ask for a frame count, how you name the model)
 * varies between Draw Things builds, so every one of them is overridable and
 * `GET /health` prints what the app actually reports back. If a request fails,
 * read health first — it is almost always a model name or a field name, not the
 * transport.
 */

import { config } from "./config.ts";

export class DrawThingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DrawThingsError";
  }
}

const api = (path: string) => `${config.drawThings.url.replace(/\/$/, "")}${path}`;

const post = async <T>(path: string, body: unknown): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(api(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.drawThings.timeoutMs),
    });
  } catch (error) {
    throw new DrawThingsError(
      `Could not reach Draw Things at ${config.drawThings.url}. Open the app, ` +
        `turn on Settings → API Server, and check the port. (${
          error instanceof Error ? error.message : String(error)
        })`
    );
  }

  if (!response.ok) {
    throw new DrawThingsError(
      `${path} → ${response.status}: ${(await response.text()).slice(0, 400)}`
    );
  }

  return (await response.json()) as T;
};

/** What the app says it has loaded. The one reliable way to learn model names. */
export const probe = async () => {
  const out: Record<string, unknown> = { url: config.drawThings.url };

  for (const path of ["/sdapi/v1/sd-models", "/sdapi/v1/options"]) {
    try {
      const response = await fetch(api(path), {
        signal: AbortSignal.timeout(5000),
      });
      out[path] = response.ok
        ? await response.json()
        : `HTTP ${response.status}`;
    } catch (error) {
      out[path] = `unreachable: ${error instanceof Error ? error.message : error}`;
    }
  }

  return out;
};

type ImagesReply = { images?: string[]; info?: unknown };

const framesFrom = (reply: ImagesReply, what: string) => {
  const images = reply.images ?? [];

  if (!images.length) {
    throw new DrawThingsError(
      `Draw Things returned no images for ${what}. If the model is loaded and ` +
        `the prompt is fine, this is usually a wrong model name — check GET /health.`
    );
  }

  return images.map((data) =>
    Buffer.from(data.replace(/^data:image\/\w+;base64,/, ""), "base64")
  );
};

const base = () => ({
  width: config.draft.width,
  height: config.draft.height,
  steps: config.draft.steps,
  cfg_scale: 4.5,
  seed: -1,
  batch_size: 1,
  batch_count: 1,
});

export const textToImage = async ({
  prompt,
  negativePrompt,
  model,
  seed,
}: {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  seed?: number;
}) => {
  const reply = await post<ImagesReply>("/sdapi/v1/txt2img", {
    ...base(),
    prompt,
    negative_prompt: negativePrompt ?? "",
    ...(seed !== undefined ? { seed } : {}),
    ...(model || config.drawThings.image
      ? { model: model ?? config.drawThings.image }
      : {}),
  });

  return framesFrom(reply, "txt2img")[0];
};

export const imageToImage = async ({
  prompt,
  image,
  negativePrompt,
  model,
  strength = 0.55,
  seed,
}: {
  prompt: string;
  image: Buffer;
  negativePrompt?: string;
  model?: string;
  /**
   * How far from the reference the edit may travel.
   *
   * This is the single most important number for identity: the whole reason
   * beat frames are edits of one master frame is to hold the face, and a
   * strength high enough to change the pose properly is also high enough to
   * change the person. 0.55 is a starting point to tune, not a fact.
   */
  strength?: number;
  seed?: number;
}) => {
  const reply = await post<ImagesReply>("/sdapi/v1/img2img", {
    ...base(),
    prompt,
    negative_prompt: negativePrompt ?? "",
    init_images: [image.toString("base64")],
    denoising_strength: strength,
    ...(seed !== undefined ? { seed } : {}),
    ...(model || config.drawThings.image
      ? { model: model ?? config.drawThings.image }
      : {}),
  });

  return framesFrom(reply, "img2img")[0];
};

/**
 * Generate a shot, as frames.
 *
 * Image-to-video whenever a first frame is supplied, which is the path that
 * matters — the identity anchor only works if the clip starts from the frame we
 * already committed to. Returns raw frames; turning them into a file is the
 * media layer's job, because that is where ffmpeg lives.
 */
export const generateFrames = async ({
  prompt,
  negativePrompt,
  firstFrame,
  seconds,
  model,
  seed,
}: {
  prompt: string;
  negativePrompt?: string;
  firstFrame?: Buffer;
  seconds: number;
  model?: string;
  seed?: number;
}) => {
  const capped = Math.min(seconds, config.draft.maxSeconds);
  const numFrames = Math.max(9, Math.round(capped * config.draft.fps));

  const payload = {
    ...base(),
    prompt,
    negative_prompt: negativePrompt ?? "",
    // Both spellings are sent. They are the field most likely to differ between
    // builds, and an ignored extra key is free where a missing one silently
    // produces a single still instead of a shot.
    num_frames: numFrames,
    numFrames,
    fps: config.draft.fps,
    ...(seed !== undefined ? { seed } : {}),
    ...(model || config.drawThings.video
      ? { model: model ?? config.drawThings.video }
      : {}),
  };

  const reply = firstFrame
    ? await post<ImagesReply>("/sdapi/v1/img2img", {
        ...payload,
        init_images: [firstFrame.toString("base64")],
        denoising_strength: 1,
      })
    : await post<ImagesReply>("/sdapi/v1/txt2img", payload);

  const frames = framesFrom(reply, "video");

  if (frames.length < 2) {
    throw new DrawThingsError(
      `Draw Things returned ${frames.length} frame for a ${capped}s shot. The ` +
        `loaded model is generating stills, so it is probably not the video ` +
        `model — set DRAW_THINGS_VIDEO_MODEL from GET /health.`
    );
  }

  return { frames, seconds: frames.length / config.draft.fps };
};
