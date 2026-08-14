/**
 * fal.ai queue client and model registry.
 *
 * Raw HTTP against the queue API rather than the SDK, so the surface stays
 * visible and the retry and timeout behaviour is ours.
 *
 * DRY RUN: with no FAL_KEY, or CAROULY_DRY_RUN=1, every call returns a
 * deterministic placeholder instead of spending credits. That is what lets the
 * whole graph — and the whole studio around it — be exercised end to end for
 * free while the structure is still moving. The placeholder is marked
 * `dry_run: true`, and the graph cache discards any cached value carrying that
 * mark the moment a real key appears, so adding the key cannot silently replay
 * stubs and look like a successful render.
 */

const QUEUE = "https://queue.fal.run";

/**
 * Model ids churn on fal, so they live in one table and presets reference them
 * by role.
 *
 * AUDIO POLICY: video models must generate their own dialogue. There is no TTS,
 * no lipsync and no muxing anywhere in this pipeline — synthetic speech bolted
 * onto silent footage never matches lip movement or room tone, and the models
 * that speak natively already solve it. `fal.video` refuses any model marked
 * `audio: false` unless a shot opts out explicitly with `silent: true`.
 */
export const MODELS: Record<
  string,
  { id: string; kind: string; audio?: boolean; maxSeconds?: number }
> = {
  "video.veo3": { id: "fal-ai/veo3", kind: "t2v", audio: true, maxSeconds: 8 },
  "video.veo3_fast": { id: "fal-ai/veo3/fast", kind: "t2v", audio: true, maxSeconds: 8 },
  // The default path: identity comes from the first frame, speech from the model.
  "video.veo3_i2v": {
    id: "fal-ai/veo3/image-to-video",
    kind: "i2v",
    audio: true,
    maxSeconds: 8,
  },
  "video.veo3_fast_i2v": {
    id: "fal-ai/veo3/fast/image-to-video",
    kind: "i2v",
    audio: true,
    maxSeconds: 8,
  },
  // Silent models — only for shots with no speech (b-roll, end cards).
  "video.kling_i2v": {
    id: "fal-ai/kling-video/v2.1/master/image-to-video",
    kind: "i2v",
    audio: false,
    maxSeconds: 10,
  },
  "video.seedance_i2v": {
    id: "fal-ai/bytedance/seedance/v1/pro/image-to-video",
    kind: "i2v",
    audio: false,
    maxSeconds: 10,
  },
  "image.nano_banana": { id: "fal-ai/nano-banana-pro", kind: "t2i" },
  "image.flux": { id: "fal-ai/flux/dev", kind: "t2i" },
  "image.flux_ultra": { id: "fal-ai/flux-pro/v1.1-ultra", kind: "t2i" },
  // Identity-preserving edits — every per-beat frame is an edit of one master.
  "edit.nano_banana": { id: "fal-ai/nano-banana-pro/edit", kind: "i2i" },
  "edit.flux": { id: "fal-ai/flux/dev/image-to-image", kind: "i2i" },
  "compose.ffmpeg": { id: "fal-ai/ffmpeg-api/compose", kind: "compose" },
};

export class FalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FalError";
  }
}

export const hasAudio = (model: string) => Boolean(MODELS[model]?.audio);

export const dryRun = () =>
  process.env.CAROULY_DRY_RUN === "1" || !process.env.FAL_KEY?.trim();

/** Accept either a registry alias ('video.veo3') or a raw fal id. */
export const resolveModel = (model: string) => MODELS[model]?.id ?? model;

const digest = async (input: string) => {
  const bytes = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(input)
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
};

export type FalResult = Record<string, unknown> & {
  _model?: string;
  _dry_run?: boolean;
};

/** Run a fal model to completion through the queue API. */
export const submit = async (
  model: string,
  payload: Record<string, unknown>,
  { pollMs = 3000, timeoutMs = 900_000 } = {}
): Promise<FalResult> => {
  const modelId = resolveModel(model);

  if (dryRun()) {
    const stamp = await digest(modelId + JSON.stringify(payload));
    return {
      _dry_run: true,
      _model: modelId,
      video: { url: `https://dry-run.local/${stamp}.mp4` },
      images: [{ url: `https://dry-run.local/${stamp}.png` }],
      url: `https://dry-run.local/${stamp}.bin`,
    };
  }

  const headers = {
    Authorization: `Key ${process.env.FAL_KEY?.trim()}`,
    "Content-Type": "application/json",
  };

  const queued = await fetch(`${QUEUE}/${modelId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!queued.ok) {
    throw new FalError(
      `submit ${modelId} → ${queued.status}: ${(await queued.text()).slice(0, 400)}`
    );
  }

  const job = await queued.json();
  const requestId = job.request_id;
  const statusUrl =
    job.status_url ?? `${QUEUE}/${modelId}/requests/${requestId}/status`;
  const resultUrl = job.response_url ?? `${QUEUE}/${modelId}/requests/${requestId}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((done) => setTimeout(done, pollMs));

    const status = await fetch(statusUrl, { headers });
    if (!status.ok) {
      throw new FalError(
        `status ${requestId} → ${status.status}: ${(await status.text()).slice(0, 300)}`
      );
    }

    const state = (await status.json()).status;

    if (state === "COMPLETED") {
      const result = await fetch(resultUrl, { headers });
      if (!result.ok) {
        throw new FalError(
          `result ${requestId} → ${result.status}: ${(await result.text()).slice(0, 300)}`
        );
      }
      return { ...(await result.json()), _model: modelId };
    }

    if (state === "FAILED" || state === "ERROR") {
      throw new FalError(`${modelId} failed while queued (${requestId})`);
    }
  }

  throw new FalError(`${modelId} timed out after ${Math.round(timeoutMs / 1000)}s`);
};

/** Pull the primary output URL out of fal's inconsistent response shapes. */
export const firstUrl = (result: FalResult): string | undefined => {
  for (const key of ["video", "audio", "image"]) {
    const value = result[key];
    if (value && typeof value === "object" && "url" in value) {
      return String((value as { url: string }).url);
    }
  }

  for (const key of ["images", "videos", "audios", "files"]) {
    const value = result[key];
    if (Array.isArray(value) && value[0] && typeof value[0] === "object") {
      const url = (value[0] as { url?: string }).url;
      if (url) return url;
    }
  }

  return typeof result.url === "string" ? result.url : undefined;
};
