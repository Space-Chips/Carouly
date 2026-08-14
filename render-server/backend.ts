/**
 * Which local engine runs a shot.
 *
 * Two, because the format decides: LTX-2.3 ships as GGUF and only ComfyUI can
 * load that, while Draw Things is the better path for anything published in its
 * own format. `RENDER_BACKEND` picks; everything above this file is unaware.
 */

import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFile } from "node:fs/promises";

import * as comfy from "./comfy.ts";
import { config } from "./config.ts";
import * as dt from "./drawthings.ts";
import { framesToVideo, run } from "./media.ts";

/** LTX wants a frame count of 8n+1. Anything else is silently rounded or refused. */
export const frameCount = (seconds: number, fps: number) => {
  const wanted = Math.round(Math.min(seconds, config.draft.maxSeconds) * fps);
  return Math.max(9, Math.round((wanted - 1) / 8) * 8 + 1);
};

export const probe = async () =>
  config.backend === "comfy" ? comfy.probe() : dt.probe();

/**
 * The master frame.
 *
 * Z-Image Turbo rather than LTX, because LTX has no text-to-image path — and
 * because this still is the identity anchor: every beat frame is an edit of it,
 * so if the person here is wrong the whole cut is wrong. Generated at the draft
 * video size so LTX consumes it without resampling.
 */
export const makeImage = async ({
  prompt,
  negativePrompt,
  seed,
  out,
}: {
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  out: string;
}) => {
  if (config.backend === "drawthings") {
    await writeFile(out, await dt.textToImage({ prompt, negativePrompt, seed }));
    return out;
  }

  const stem = `carouly_master_${Date.now().toString(36)}`;

  const graph = await comfy.loadWorkflow("z-image", {
    unet: config.zImage.unet,
    text_encoder: config.zImage.textEncoder,
    vae: config.zImage.vae,
    prompt,
    negative_prompt: negativePrompt ?? "",
    width: config.draft.width,
    height: config.draft.height,
    steps: config.zImage.steps,
    cfg: config.zImage.cfg,
    seed: seed ?? Math.floor(Math.random() * 2 ** 31),
    stem,
  });

  const files = await comfy.runWorkflow(graph);
  await writeFile(out, await comfy.fetchOutput(files[0]));

  return out;
};

/**
 * Produce a shot and leave it at `out` as an mp4, with its dialogue.
 *
 * ComfyUI now writes the mp4 itself: `SaveVideo` muxes the decoded frames with
 * the audio LTX generated alongside them, so there is nothing to transcode and,
 * more to the point, nothing that can silently drop the speech on the way
 * through. The previous version saved a webm from frames only and re-encoded it
 * here, which is why every local clip came out silent.
 */
export const makeVideo = async ({
  prompt,
  negativePrompt,
  firstFrame,
  seconds,
  seed,
  out,
}: {
  prompt: string;
  negativePrompt?: string;
  firstFrame?: Buffer;
  seconds: number;
  seed?: number;
  out: string;
}) => {
  if (config.backend === "drawthings") {
    const { frames } = await dt.generateFrames({
      prompt,
      negativePrompt,
      firstFrame,
      seconds,
      seed,
    });
    await framesToVideo(frames, out);
    return out;
  }

  if (!firstFrame) {
    throw new Error(
      "the local LTX path is image-to-video: give it a first frame. Generate the " +
        "master frame on fal (images are cents) and pass its url as image_url."
    );
  }

  const stem = `carouly_${Date.now().toString(36)}`;
  const uploaded = await comfy.uploadImage(firstFrame, `${stem}.png`);

  const graph = await comfy.loadWorkflow("ltx-i2v", {
    unet: config.comfy.unet,
    text_encoder: config.comfy.textEncoder,
    text_projection: config.comfy.textProjection,
    vae: config.comfy.vae,
    audio_vae: config.comfy.audioVae,
    prompt,
    negative_prompt: negativePrompt ?? "",
    image: uploaded,
    width: config.draft.width,
    height: config.draft.height,
    length: frameCount(seconds, config.draft.fps),
    fps: config.draft.fps,
    steps: config.draft.steps,
    // A distilled model carries its guidance internally; running it at a base
    // model's cfg burns the frames out.
    cfg: 1,
    seed: seed ?? Math.floor(Math.random() * 2 ** 31),
    stem,
  });

  const files = await comfy.runWorkflow(graph);
  const produced = join(tmpdir(), `${stem}.mp4`);
  await writeFile(produced, await comfy.fetchOutput(files[0]));

  try {
    // Remux rather than re-encode: `-c copy` on both streams keeps the audio
    // bit-for-bit and costs a disk copy. Re-encoding the video here is what the
    // old webm path had to do, and it is the sort of step that quietly loses a
    // track when somebody later forgets `-c:a`.
    const { code, stderr } = await run("ffmpeg", [
      "-y", "-loglevel", "error",
      "-i", produced,
      "-c", "copy",
      "-movflags", "+faststart",
      out,
    ]);

    if (code !== 0) throw new Error(`could not package the draft: ${stderr.slice(0, 300)}`);
  } finally {
    await unlink(produced).catch(() => {});
  }

  return out;
};
