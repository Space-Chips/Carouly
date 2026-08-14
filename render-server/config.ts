/**
 * Local render server — configuration.
 *
 * Everything a machine-specific detail lives here rather than being threaded
 * through the code, because the two things most likely to be wrong on a fresh
 * install are the Draw Things port and the model name, and both should be one
 * env var away from fixed.
 */

import { homedir } from "node:os";
import { join } from "node:path";

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  /** Where this server listens. Not 7860: that is Draw Things' own default,
   *  and on this machine it is currently held by a Wan2GP instance. */
  port: num(process.env.RENDER_PORT, 8787),
  host: process.env.RENDER_HOST ?? "127.0.0.1",

  /**
   * Which local engine does the generating.
   *
   * `comfy` for LTX-2.3, because the weights are GGUF and Draw Things cannot
   * load GGUF — it uses its own converted format. Draw Things stays supported
   * for anything published in that format.
   */
  backend: (process.env.RENDER_BACKEND ?? "comfy") as "comfy" | "drawthings",

  comfy: {
    url: process.env.COMFY_URL ?? "http://127.0.0.1:8188",
    /** Filenames as they appear in ComfyUI's own model folders. */
    unet: process.env.COMFY_UNET ?? "LTX-2.3-22B-distilled-1.1-Q3_K_M.gguf",
    textEncoder: process.env.COMFY_TEXT_ENCODER ?? "gemma_3_12B_it_fp4_mixed.safetensors",
    textProjection:
      process.env.COMFY_TEXT_PROJECTION ?? "ltx-2.3_text_projection_bf16.safetensors",
    vae: process.env.COMFY_VAE ?? "LTX23_video_vae_bf16.safetensors",
    /**
     * The other half of the model.
     *
     * LTX-2 samples picture and dialogue together, so there is an audio VAE
     * beside the video one. Without it the graph can only decode half of what it
     * generated, which is exactly what it used to do.
     */
    audioVae: process.env.COMFY_AUDIO_VAE ?? "LTX23_audio_vae_bf16.safetensors",
    /** A tiny autoencoder decodes a draft in seconds instead of minutes. */
    previewVae: process.env.COMFY_PREVIEW_VAE ?? "taeltx2_3.safetensors",
    timeoutMs: num(process.env.COMFY_TIMEOUT_MS, 30 * 60 * 1000),
  },

  /**
   * Z-Image Turbo, for the master frame.
   *
   * LTX is image-to-video, so something has to make the still it starts from —
   * and that still is the identity anchor every later beat is edited out of, so
   * it is the one image worth generating properly rather than stubbing. Turbo is
   * distilled: 8 steps at cfg 1, which is a few seconds on this machine.
   */
  zImage: {
    unet: process.env.Z_IMAGE_UNET ?? "z-image-turbo-Q4_K_M.gguf",
    textEncoder: process.env.Z_IMAGE_TEXT_ENCODER ?? "qwen_3_4b_fp8_mixed.safetensors",
    vae: process.env.Z_IMAGE_VAE ?? "z_image_ae.safetensors",
    steps: num(process.env.Z_IMAGE_STEPS, 8),
    cfg: Number(process.env.Z_IMAGE_CFG ?? 1),
  },

  drawThings: {
    /** Draw Things → Settings → API Server. Turn it on before running this. */
    url: process.env.DRAW_THINGS_URL ?? "http://127.0.0.1:7860",
    /**
     * The model identifier Draw Things knows LTX by.
     *
     * Deliberately not guessed in code: names change between builds and a
     * wrong one fails deep inside a request. `GET /health` lists what the app
     * actually reports, so set this from that list.
     */
    video: process.env.DRAW_THINGS_VIDEO_MODEL ?? "",
    image: process.env.DRAW_THINGS_IMAGE_MODEL ?? "",
    /** Generation can take minutes on a laptop; this is not a web request. */
    timeoutMs: num(process.env.DRAW_THINGS_TIMEOUT_MS, 20 * 60 * 1000),
  },

  /**
   * Draft resolution.
   *
   * 480×832 rather than a true 9:16 480×854: both dimensions are multiples of
   * 32, which every latent video model wants, and the 1.5% the frame loses in
   * height is invisible at draft size. Framing checked here still holds at
   * production resolution.
   *
   * This was briefly 704×1280 and is back down deliberately. Resolution is not
   * a speed lever — 704×1280 is 2.2× the pixels and about 2.2× the wait per clip
   * — and what a draft is for is framing, pacing and whether the actor's face
   * survives three beats, all of which read perfectly at 480p. Spend the
   * resolution on the production path, where it reaches somebody.
   */
  draft: {
    width: num(process.env.RENDER_WIDTH, 480),
    height: num(process.env.RENDER_HEIGHT, 832),
    fps: num(process.env.RENDER_FPS, 24),
    /**
     * Eight, because these are distilled weights.
     *
     * A distilled model has the sampling trajectory trained into it and is done
     * in single digits; the 20 a base model wants is not better here, it is two
     * and a half times the wait for the same frame. Measured on this machine at
     * 480×832: about 13 seconds a step, so 8 steps is under two minutes a shot
     * and 20 was over four.
     */
    steps: num(process.env.RENDER_STEPS, 8),
    /** Cap: a 480p draft exists to be quick, and eight seconds is not quick. */
    maxSeconds: num(process.env.RENDER_MAX_SECONDS, 5),
  },

  /** Generated media, served back over HTTP. */
  outDir: process.env.RENDER_OUT ?? join(homedir(), ".carouly", "render"),
};

export const publicUrl = (name: string) =>
  `http://${config.host}:${config.port}/files/${name}`;
