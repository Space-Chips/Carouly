"""Node implementations. Importing this module registers every node type."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from core import config, llm
from core.trace import TRACE
from tools import falai, imaging
from workflow.graph import NodeCtx, node_type


def _p(ctx: NodeCtx, key: str, default=None, required: bool = False):
    v = ctx.params.get(key, default)
    if required and (v is None or v == ""):
        raise ValueError(f"node '{ctx.node.id}' missing required param '{key}'")
    return v


# ─────────────────────────── primitives ───────────────────────────


@node_type("const")
def _const(ctx: NodeCtx):
    """Literal passthrough — useful for pinning shared config in one place."""
    return _p(ctx, "value")


@node_type("join")
def _join(ctx: NodeCtx):
    """Concatenate a list into a string."""
    items = _p(ctx, "items", []) or []
    sep = _p(ctx, "separator", "\n")
    return sep.join(str(i) for i in items)


@node_type("pick")
def _pick(ctx: NodeCtx):
    """Take field `field` from each item of a list."""
    items = _p(ctx, "items", []) or []
    field = _p(ctx, "field", required=True)
    return [i.get(field) if isinstance(i, dict) else None for i in items]


@node_type("zip")
def _zip(ctx: NodeCtx):
    """Merge parallel lists into one list of dicts, so `foreach` can walk them together.

    `foreach` iterates a single list, so pairing per-beat script entries with
    their per-beat generated frames needs an explicit join first.
    """
    lists = {k: v for k, v in ctx.params.items() if isinstance(v, list)}
    if not lists:
        raise ValueError(f"node '{ctx.node.id}': zip needs at least one list param")
    n = min(len(v) for v in lists.values())
    if len({len(v) for v in lists.values()}) > 1:
        TRACE.warn(f"    zip truncating to shortest list ({n}): "
                   f"{ {k: len(v) for k, v in lists.items()} }")
    return [{k: v[i] for k, v in lists.items()} for i in range(n)]


# Conversational read speed. Ad voiceover sits a little above ordinary speech
# but you want air at the end of a cut, not a sprint into the last frame.
WORDS_PER_SECOND = 2.4


def speech_seconds(text: str) -> float:
    return len((text or "").split()) / WORDS_PER_SECOND


@node_type("text.fit")
def _text_fit(ctx: NodeCtx):
    """Compress voiceover text until it can actually be read over the cut.

    Without this, a template asking for "at most 45 words" over an 11-second
    edit produces ~18 seconds of speech, and video.mux simply lets the audio
    run off the end of the picture.
    """
    text = (_p(ctx, "text", required=True) or "").strip()
    seconds = float(_p(ctx, "seconds", required=True))
    headroom = float(_p(ctx, "headroom", 0.9))       # leave the last ~10% silent
    budget_s = seconds * headroom
    max_words = max(6, int(budget_s * WORDS_PER_SECOND))

    words = len(text.split())
    if words <= max_words:
        TRACE.step(f"    vo fits: {words}w ≈ {speech_seconds(text):.1f}s of {seconds:.1f}s")
        return text

    TRACE.warn(f"    vo too long: {words}w ≈ {speech_seconds(text):.1f}s > {budget_s:.1f}s — trimming to {max_words}w")
    for _ in range(2):
        out = llm.chat(
            [
                {"role": "system", "content":
                 "You cut voiceover to length. Keep the hook and the call to action. "
                 "Drop qualifiers and repetition, never the concrete claim. "
                 "Return only the rewritten voiceover, no commentary."},
                {"role": "user", "content":
                 f"Cut this to {max_words} words or fewer. It is read aloud over "
                 f"{seconds:.0f} seconds of video.\n\n{text}"},
            ],
            model=_p(ctx, "model") or config.MODEL_SYNTH,
            temperature=0.4, max_tokens=600,
        ).get("content") or ""
        out = out.strip().strip('"')
        if out and len(out.split()) <= max_words:
            TRACE.ok(f"    vo trimmed to {len(out.split())}w ≈ {speech_seconds(out):.1f}s")
            return out

    # Model would not comply — truncate on a sentence boundary rather than ship
    # audio that overruns the picture.
    kept: list[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        if len(" ".join(kept + [sentence]).split()) > max_words:
            break
        kept.append(sentence)
    fallback = " ".join(kept) or " ".join(text.split()[:max_words])
    TRACE.warn(f"    vo hard-trimmed to {len(fallback.split())}w")
    return fallback


# ─────────────────────────── llm ───────────────────────────


@node_type("llm.text")
def _llm_text(ctx: NodeCtx):
    """Prompt -> plain text."""
    msg = llm.chat(
        [
            {"role": "system", "content": _p(ctx, "system", "You are a precise copywriter.")},
            {"role": "user", "content": _p(ctx, "prompt", required=True)},
        ],
        model=_p(ctx, "model") or config.MODEL_SYNTH,
        temperature=_p(ctx, "temperature", 0.7),
        max_tokens=_p(ctx, "max_tokens", 2000),
    )
    return (msg.get("content") or "").strip()


@node_type("llm.json")
def _llm_json(ctx: NodeCtx):
    """Prompt -> parsed JSON, with top-level key validation.

    The free router hands work to whichever model is spare, and the weaker ones
    routinely drop keys. Downstream nodes then fail on a missing required param,
    which is a confusing place to discover the real problem. So enforce the
    schema's top-level keys here, where the retry is cheap and the error is clear.
    """
    schema = _p(ctx, "schema")
    hint = ""
    required_keys: list[str] = []
    if schema:
        hint = "Return JSON matching exactly this shape:\n" + (
            schema if isinstance(schema, str) else json.dumps(schema, indent=2)
        )
        if isinstance(schema, dict):
            required_keys = list(schema.keys())

    prompt = _p(ctx, "prompt", required=True)
    system = _p(ctx, "system", "You return only valid JSON.")
    model = _p(ctx, "model") or config.MODEL_SYNTH

    for attempt in range(3):
        out = llm.json_call(
            system, prompt, model=model, schema_hint=hint,
            temperature=_p(ctx, "temperature", 0.6),
            max_tokens=_p(ctx, "max_tokens", 4000),
        )
        if not isinstance(out, dict):
            prompt += "\n\nReturn a JSON OBJECT, not an array."
            continue
        missing = [k for k in required_keys if not out.get(k)]
        if not missing:
            return out
        TRACE.warn(f"  {ctx.node.id}: missing/empty keys {missing} (attempt {attempt + 1}/3)")
        prompt = (
            f"{_p(ctx, 'prompt')}\n\nYour previous answer omitted these required keys: "
            f"{', '.join(missing)}. Include every key with a non-empty value."
        )
    raise ValueError(f"node '{ctx.node.id}': model never produced keys {required_keys}")


# ─────────────────────────── fal generation ───────────────────────────


def _stem(ctx: NodeCtx, *parts: str) -> str:
    """Deterministic, collision-free media filename.

    A `foreach` node runs many times under one node id, so the id alone would
    have every iteration overwrite the last. Python's hash() is salted per
    process and would rename files on every run, so digest the content instead.
    """
    digest = hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:10]
    return f"{ctx.node.id}_{digest}"


def _download(ctx: NodeCtx, result: dict, stem: str, ext: str) -> dict:
    url = falai.first_url(result)
    out = {"url": url, "model": result.get("_model"), "dry_run": result.get("_dry_run", False)}
    if url:
        dest = ctx.workdir / "media" / f"{stem}.{ext}"
        try:
            falai.fetch_to(url, dest)
            out["file"] = str(dest.relative_to(ctx.workdir))
        except Exception as e:  # noqa: BLE001 - keep the URL even if the download fails
            TRACE.warn(f"download failed for {stem}: {e}")
    return out


@node_type("fal.video")
def _fal_video(ctx: NodeCtx):
    """Generate one clip. Image-to-video whenever a first frame is supplied.

    Refuses silent models by default: dialogue must come from the video model
    itself. A shot with genuinely no speech can opt out with `silent: true`.
    """
    model = _p(ctx, "model", "video.veo3_fast_i2v")
    silent_ok = bool(_p(ctx, "silent", False))
    if not falai.has_audio(model) and not silent_ok:
        speakers = ", ".join(m for m in falai.MODELS if falai.has_audio(m))
        raise ValueError(
            f"node '{ctx.node.id}': model '{model}' has no native audio. "
            f"This pipeline does not add speech afterwards — pick one of: {speakers}, "
            f"or set \"silent\": true if this shot has no dialogue."
        )

    payload = {
        "prompt": _p(ctx, "prompt", required=True),
        "aspect_ratio": _p(ctx, "aspect_ratio", "9:16"),
        "duration": _p(ctx, "duration", 8),
    }
    image_url = _p(ctx, "image_url")
    if image_url:
        payload["image_url"] = image_url
    if _p(ctx, "negative_prompt"):
        payload["negative_prompt"] = _p(ctx, "negative_prompt")
    if falai.has_audio(model):
        payload["generate_audio"] = True
    payload.update(_p(ctx, "extra", {}) or {})

    res = falai.submit(model, payload)
    out = _download(ctx, res, _stem(ctx, payload["prompt"], payload.get("image_url", "")), "mp4")
    # Carry the clip's length forward — video.concat needs real durations to
    # place each clip on the timeline, not its index.
    out["seconds"] = payload["duration"]
    out["has_audio"] = falai.has_audio(model)
    return out


@node_type("fal.image")
def _fal_image(ctx: NodeCtx):
    """Text-to-image — first frames, thumbnails, end cards."""
    payload = {
        "prompt": _p(ctx, "prompt", required=True),
        "aspect_ratio": _p(ctx, "aspect_ratio", "9:16"),
        "num_images": 1,
    }
    if _p(ctx, "negative_prompt"):
        payload["negative_prompt"] = _p(ctx, "negative_prompt")
    payload.update(_p(ctx, "extra", {}) or {})
    res = falai.submit(_p(ctx, "model", "image.nano_banana"), payload)
    return _download(ctx, res, _stem(ctx, payload["prompt"]), "png")


@node_type("fal.image_edit")
def _fal_image_edit(ctx: NodeCtx):
    """Re-pose or re-frame an existing image while holding identity fixed.

    This is what keeps one actor recognisable across beats: every per-beat frame
    is an edit of the same master frame, not a fresh generation from text.
    """
    payload = {
        "prompt": _p(ctx, "prompt", required=True),
        "image_urls": [_p(ctx, "image_url", required=True)],
        "aspect_ratio": _p(ctx, "aspect_ratio", "9:16"),
        "num_images": 1,
    }
    payload.update(_p(ctx, "extra", {}) or {})
    res = falai.submit(_p(ctx, "model", "edit.nano_banana"), payload)
    return _download(ctx, res, _stem(ctx, payload["prompt"], payload["image_urls"][0]), "png")


@node_type("video.concat")
def _concat(ctx: NodeCtx):
    """Stitch clips in order into the final vertical cut.

    Each keyframe's `timestamp` is the clip's cumulative start offset on the
    timeline. Using the loop index here instead would stack every clip in the
    first few seconds — invisible in dry run, ruinous on the first real render.
    """
    clips = _p(ctx, "clips", []) or []
    default_seconds = _p(ctx, "clip_seconds", 8)

    keyframes, urls, offset = [], [], 0.0
    for c in clips:
        url = c.get("url") if isinstance(c, dict) else c
        if not url:
            continue
        seconds = float((c.get("seconds") if isinstance(c, dict) else None) or default_seconds)
        keyframes.append({"url": url, "timestamp": round(offset, 3), "duration": seconds})
        urls.append(url)
        offset += seconds

    if not urls:
        raise ValueError(f"node '{ctx.node.id}': no clip urls to concat")
    if len(urls) == 1:
        single = dict(clips[0]) if isinstance(clips[0], dict) else {"url": urls[0]}
        single.update({"clips": urls, "seconds": offset, "single": True})
        return single

    # Prefer local ffmpeg: it keeps each clip's native dialogue track, which the
    # remote video-only compose would drop. Falls back to fal when the clips are
    # not on disk (dry run) or ffmpeg is missing.
    local = _concat_local(ctx, clips, offset)
    if local:
        return local

    res = falai.submit(_p(ctx, "model", "compose.ffmpeg"),
                       {"tracks": [{"id": "video", "type": "video", "keyframes": keyframes}]})
    out = _download(ctx, res, "final", "mp4")
    out["clips"] = urls
    out["seconds"] = offset
    return out


def _probe_duration(path: Path) -> float:
    import shutil
    import subprocess
    if not shutil.which("ffprobe"):
        return 0.0
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True,
    )
    try:
        return float(proc.stdout.strip())
    except ValueError:
        return 0.0


def _has_audio_stream(path: Path) -> bool:
    import shutil
    import subprocess
    if not shutil.which("ffprobe"):
        return False
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries",
         "stream=index", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    )
    return bool(proc.stdout.strip())


def _concat_local(ctx: NodeCtx, clips: list, total: float) -> dict | None:
    """Join clips with the concat filter, preserving audio. None if not possible."""
    import shutil
    import subprocess

    if not shutil.which("ffmpeg"):
        return None
    paths = []
    for c in clips:
        rel = c.get("file") if isinstance(c, dict) else None
        if not rel:
            return None
        p = ctx.workdir / rel
        if not p.exists() or p.stat().st_size == 0:
            return None
        paths.append(p)

    # concat requires every input to expose the same streams; synthesise silence
    # for any clip that came from a silent model so the filter graph stays valid.
    # Each silence track must match its own clip's length — one shared track sized
    # to the whole timeline would stretch that segment and inflate the runtime.
    audio_flags = [_has_audio_stream(p) for p in paths]
    durations = [_probe_duration(p) or float(c.get("seconds") or 0) or 8.0
                 for p, c in zip(paths, clips)]
    out_path = ctx.workdir / "media" / "final_cut.mp4"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    inputs = []
    for p in paths:
        inputs += ["-i", str(p)]

    silence_for: dict[int, int] = {}
    for i, ok in enumerate(audio_flags):
        if not ok:
            silence_for[i] = len(paths) + len(silence_for)
            inputs += ["-f", "lavfi", "-t", f"{durations[i]:.3f}",
                       "-i", "anullsrc=r=48000:cl=stereo"]

    parts = []
    for i, ok in enumerate(audio_flags):
        parts.append(f"[{i}:v]")
        parts.append(f"[{i}:a]" if ok else f"[{silence_for[i]}:a]")

    filt = "".join(parts) + f"concat=n={len(paths)}:v=1:a=1[v][a]"
    total = sum(durations)
    cmd = ["ffmpeg", "-y", *inputs, "-filter_complex", filt,
           "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-loglevel", "error", str(out_path)]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not out_path.exists():
        TRACE.warn(f"    local concat failed, falling back to fal: {proc.stderr.strip()[:180]}")
        return None

    TRACE.ok(f"    concatenated {len(paths)} clips locally with audio → {out_path.name}")
    return {"url": None, "file": str(out_path.relative_to(ctx.workdir)),
            "clips": [c.get("url") for c in clips if isinstance(c, dict)],
            "seconds": total, "local": True}


def _srt_time(t: float) -> str:
    h, rem = divmod(max(t, 0.0), 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02}:{int(m):02}:{int(s):02},{int(round((s % 1) * 1000)):03}"


def build_srt(lines: list[str], spans: list[tuple[float, float]]) -> str:
    out = []
    for i, (text, (start, end)) in enumerate(zip(lines, spans), 1):
        out.append(f"{i}\n{_srt_time(start)} --> {_srt_time(end)}\n{text.strip()}\n")
    return "\n".join(out)


@node_type("video.captions")
def _captions(ctx: NodeCtx):
    """Burn on-screen captions into the cut with local ffmpeg.

    Most vertical social video is watched muted, so the templates already write
    an `on_screen_text` line per shot — this is what finally renders it. Falls
    back to writing a sidecar .srt when ffmpeg or a local file is unavailable
    (which is always the case in dry run), so the pipeline never blocks on it.
    """
    import shutil
    import subprocess

    source = _p(ctx, "video", required=True)
    lines = [str(x) for x in (_p(ctx, "lines", []) or []) if str(x).strip()]
    if not lines:
        TRACE.step("    no caption lines — passing video through")
        return source if isinstance(source, dict) else {"url": source}

    result = dict(source) if isinstance(source, dict) else {"url": source}

    # Timing: one caption per clip when the counts line up, else split evenly.
    clip_seconds = _p(ctx, "clip_seconds") or []
    total = float(result.get("seconds") or _p(ctx, "seconds", 0) or sum(clip_seconds) or 0)
    if len(clip_seconds) == len(lines) and total:
        spans, offset = [], 0.0
        for d in clip_seconds:
            spans.append((offset, offset + float(d)))
            offset += float(d)
    else:
        total = total or len(lines) * 4.0
        step = total / len(lines)
        spans = [(i * step, (i + 1) * step) for i in range(len(lines))]

    srt_path = ctx.workdir / "media" / f"{ctx.node.id}.srt"
    srt_path.parent.mkdir(parents=True, exist_ok=True)
    srt_path.write_text(build_srt(lines, spans))
    result["captions_srt"] = str(srt_path.relative_to(ctx.workdir))

    local = ctx.workdir / result["file"] if result.get("file") else None
    if not shutil.which("ffmpeg") or not local or not local.exists() or local.stat().st_size == 0:
        TRACE.warn(f"    captions written to {srt_path.name} but not burned "
                   f"({'no ffmpeg' if not shutil.which('ffmpeg') else 'no local video file'})")
        return result

    width, height = _probe_size(local)
    if not width:
        TRACE.warn("    could not probe video size — captions left as a sidecar .srt")
        return result

    # Render each caption to a transparent PNG, then composite with `overlay`,
    # which is always available. See imaging.caption_png for why not drawtext.
    pngs = []
    for i, line in enumerate(lines):
        png = srt_path.parent / f"{ctx.node.id}_cap{i}.png"
        pngs.append(imaging.caption_png(line, width, png))

    margin_v = int(height * 0.12)
    inputs, filters, label = ["-i", str(local)], [], "0:v"
    for i, (png, (start, end)) in enumerate(zip(pngs, spans)):
        inputs += ["-i", png["file"]]
        nxt = f"v{i}"
        filters.append(
            f"[{label}][{i + 1}:v]overlay=x=(W-w)/2:y=H-h-{margin_v}:"
            f"enable='between(t,{start:.2f},{end:.2f})'[{nxt}]"
        )
        label = nxt

    out_path = local.with_name(local.stem + "_captioned.mp4")
    cmd = [
        "ffmpeg", "-y", *inputs,
        "-filter_complex", ";".join(filters),
        "-map", f"[{label}]",
        *(["-map", "0:a?", "-c:a", "copy"]),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-loglevel", "error", str(out_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not out_path.exists():
        TRACE.warn(f"    caption burn failed, keeping clean cut: {proc.stderr.strip()[:220]}")
        return result

    result["file"] = str(out_path.relative_to(ctx.workdir))
    result["captioned"] = True
    TRACE.ok(f"    burned {len(lines)} captions into {out_path.name}")
    return result


def _probe_size(path: Path) -> tuple[int, int]:
    import shutil
    import subprocess

    if not shutil.which("ffprobe"):
        return (0, 0)
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", str(path)],
        capture_output=True, text=True,
    )
    try:
        w, h = proc.stdout.strip().split("x")[:2]
        return (int(w), int(h))
    except (ValueError, IndexError):
        return (0, 0)


@node_type("asset.pick")
def _asset_pick(ctx: NodeCtx):
    """Select a brand asset by role from the captured kit ('logo' | 'product' | 'icon')."""
    role = _p(ctx, "role", "product")
    assets = (ctx.brand.get("assets") or {}).get(role) or []
    idx = int(_p(ctx, "index", 0) or 0)
    if not assets:
        return None
    item = assets[idx % len(assets)]
    return item.get("source_url") or item.get("file")


@node_type("asset.upload")
def _asset_upload(ctx: NodeCtx):
    """Upload a local brand asset to fal storage so generation nodes can reference it."""
    rel = _p(ctx, "path", required=True)
    p = Path(rel)
    if not p.is_absolute():
        p = ctx.workdir.parent / rel
    if not p.exists():
        raise ValueError(f"asset not found: {p}")
    return falai.upload(p)
