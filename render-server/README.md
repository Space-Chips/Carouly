# Local render server

A 480p draft of a shot, on this machine, for nothing.

Production renders go to fal.ai and cost money per clip, which makes iterating on
a template absurd: you change one line of a casting prompt and spend real credits
to find out whether the framing works. This server is the other end of that —
same request shape, same graph, same templates, running LTX and Z-Image locally
through ComfyUI at draft quality.

**What a draft is for:** framing, whether the actor's face survives across three
beats, whether the pacing lands. **What it is not for:** dialogue. LTX at these
settings is silent, so every response is stamped `draft: true` and the studio
labels the artifact accordingly. The production rule that video models must
generate their own speech is suspended here and nowhere else.

---

## Why ComfyUI and not Draw Things

LTX-2.3 ships as **GGUF**, and Draw Things cannot load GGUF — it uses its own
converted format. The model card says ComfyUI, ComfyUI has native LTX-2 nodes
(`comfy/ldm/lightricks/av_model.py`, the `LTXAV*` loaders), and city96's
`ComfyUI-GGUF` supplies the loader. So ComfyUI is the backend for this model.
The Draw Things adapter stays for anything published in that format;
`RENDER_BACKEND=drawthings` switches to it.

## What is installed

`~/ComfyUI`, on its own Python 3.12 venv — **not** the system 3.14, because the
node ecosystem lags new interpreters.

```
~/ComfyUI/
  .venv/                                   torch 2.13.0, device mps, 36 GB
  custom_nodes/ComfyUI-GGUF/               the GGUF loader
  models/diffusion_models/LTX-2.3-22B-distilled-1.1-Q3_K_M.gguf
  models/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors
  models/vae/LTX23_video_vae_bf16.safetensors
  models/vae/taeltx2_3.safetensors                    tiny AE, fast previews
  models/checkpoints/ltx-2.3_text_projection_bf16.safetensors
  models/checkpoints/LTX23_audio_vae_bf16.safetensors
```

The last two are in `checkpoints` on purpose: `LTXAVTextEncoderLoader` takes a
`ckpt_name` alongside the encoder, and `LTXVAudioVAELoader` takes one outright.
Both read the `checkpoints` folder, so a file in `text_encoders` will simply not
appear in the dropdown.

**Why Q3 and fp4.** Not a compromise — the right size for the job. With 36 GB
unified, Q4 or Q5 would fit, but a 480p draft exists to answer "does the framing
work" and "does the face survive three beats", and neither question can tell Q3
from Q5. The smaller weights leave headroom for video latents, which are what
actually runs you out of memory.

## Running it

```bash
cd ~/ComfyUI && ./.venv/bin/python main.py    # the engine, :8188
npm run render                                # this server, :8787
```

```bash
# .env.local
CAROULY_RENDER=local
```

That one variable points the app here. Unset it, or set it to `fal`, and
everything goes back to fal.ai untouched.

## Endpoints

| | |
|---|---|
| `GET /health` | ffmpeg, config, and what the live backend reports |
| `GET /files/:name` | serves generated media |
| `POST /image` | text → still (first frames, end cards) |
| `POST /edit` | still → still, holding identity (per-beat frames) |
| `POST /video` | a shot; image-to-video whenever a first frame is given |
| `POST /concat` | join clips, keeping each one's own audio |
| `POST /captions` | time the captions and composite them on |

Everything is content-hashed and cached on disk, so re-running a graph after
changing one prompt re-renders one node rather than all of them — the same
property the workflow engine's own cache has, for the same reason.

## Two things worth knowing

**Concat and captions actually work here.** They could not on the serverless
side: a lambda has no ffmpeg, so assembly is handed to fal's compose endpoint and
whether it preserves each clip's dialogue track has never been observed. Locally
the cut is assembled with the concat filter and silence is synthesised per-clip
at each clip's own length for anything silent — one shared silence track sized to
the whole timeline would stretch that segment and inflate the runtime.

**Captions are composited as images, not drawn.** This machine's ffmpeg is built
without freetype, libass or fontconfig, so `drawtext` and `subtitles` do not
exist in it. Caption plates are rasterised with `next/og` using the repo's own
Barlow, then laid on with `overlay`, which needs no optional libraries.

## Measured on this machine

M4 Max, 36 GB, 480×832:

| | |
|---|---|
| Z-Image master frame | ~40s cold, ~30s warm, 8 steps |
| LTX shot, 2s | ~13s a step — under 2 min at 8 steps |
| Gemma encoder | 11.2 GB, placed on CPU by ComfyUI |
| LTX DiT | 14.1 GB resident |

Swap runs at 6–9 GB during a shot. It does not thrash, but this is the ceiling:
a longer shot or a larger frame is where it will start to.

**Both graphs have run end to end.** The two risks flagged before the first
render — whether a *distilled* model needs base-model sampler settings, and
whether the natively audio-visual LTX-2.3 would accept a video-only path — both
turned out fine. The video-only route works and the audio VAE stays unused.

The result that matters: **identity survives image-to-video.** The face, the
freckles, the hair tie and the apron all hold from the master frame across two
seconds of speaking, with natural blinking and head movement. That is the whole
premise of the talking-head template, and it now has evidence behind it rather
than an argument.

If a graph does need correcting later: open ComfyUI at `:8188`, load the
workflow, fix it, **Export (API)**, save it over the file in `workflows/`.
Nothing in the server changes — the graph is a file precisely so it can be
repaired by hand.

## The master frame — Z-Image Turbo

LTX is image-to-video: something has to make the still it starts from. That still
is the identity anchor — every beat frame is an edit of it — so it is the one
image worth generating properly rather than stubbing.

`z-image-turbo-Q4_K_M.gguf` (4.7 GB) with a Qwen3-4B encoder (fp8, 5.3 GB) and
the Flux-style `ae` VAE. Distilled: **8 steps at cfg 1.0**. At a base model's
cfg 7–8 you get burnt, oversaturated frames — that look is the symptom.

Generated at the draft video size so LTX consumes it without resampling.

**What still goes to fal:** the per-beat frames. Those are *edits* that have to
hold the master's face, and neither Z-Image Turbo (text-to-image) nor LTX can do
that — it needs an edit model. So a local run is: master frame local, beat frames
on fal, clips local. That leaves only the cheap call remote.

The encoder `type` in `workflows/z-image.json` says `lumina2`, not `z_image` —
there is no such CLIPType. ComfyUI routes Qwen3-4B to the Z-Image encoder from
the state dict itself (`comfy/sd.py`, `TEModel.QWEN3_4B`); the field only matters
for steering it towards Flux instead.
