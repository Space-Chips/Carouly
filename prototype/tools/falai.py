"""fal.ai queue client + model registry.

Raw HTTP against the queue API (no fal_client dependency) so the surface stays visible.

DRY RUN: when FAL_KEY is unset, or CAROULY_DRY_RUN=1, every call returns a
deterministic placeholder instead of spending credits. That lets the whole
workflow graph be exercised end to end for free while iterating on structure.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path

import httpx

from core import config
from core.trace import TRACE

QUEUE = "https://queue.fal.run"

# Model IDs churn on fal. Keep them in one table, referenced by role from presets.
#
# AUDIO POLICY: video models must generate their own dialogue. There is no TTS,
# no lipsync and no audio muxing in this pipeline — bolting synthetic speech onto
# silent footage never matches lip movement or room tone, and the models that
# speak natively already solve it. `fal.video` refuses any model with
# audio: False unless a preset opts in explicitly for a shot with no speech.
MODELS = {
    # text -> video, native audio
    "video.veo3":         {"id": "fal-ai/veo3",                                    "kind": "t2v", "audio": True,  "max_s": 8},
    "video.veo3_fast":    {"id": "fal-ai/veo3/fast",                               "kind": "t2v", "audio": True,  "max_s": 8},
    # image -> video, native audio — the default path: identity comes from the
    # first frame, speech comes from the model.
    "video.veo3_i2v":     {"id": "fal-ai/veo3/image-to-video",                     "kind": "i2v", "audio": True,  "max_s": 8},
    "video.veo3_fast_i2v":{"id": "fal-ai/veo3/fast/image-to-video",                "kind": "i2v", "audio": True,  "max_s": 8},
    # silent models — usable only for shots with no speech (b-roll, end cards)
    "video.kling_i2v":    {"id": "fal-ai/kling-video/v2.1/master/image-to-video",  "kind": "i2v", "audio": False, "max_s": 10},
    "video.seedance_i2v": {"id": "fal-ai/bytedance/seedance/v1/pro/image-to-video","kind": "i2v", "audio": False, "max_s": 10},
    # first-frame generation
    "image.nano_banana":  {"id": "fal-ai/nano-banana-pro",                         "kind": "t2i"},
    "image.flux":         {"id": "fal-ai/flux/dev",                                "kind": "t2i"},
    "image.flux_ultra":   {"id": "fal-ai/flux-pro/v1.1-ultra",                     "kind": "t2i"},
    # identity-preserving edits — derive per-beat frames from one master frame
    "edit.nano_banana":   {"id": "fal-ai/nano-banana-pro/edit",                    "kind": "i2i"},
    "edit.flux":          {"id": "fal-ai/flux/dev/image-to-image",                 "kind": "i2i"},
    # assembly fallback when local ffmpeg is unavailable
    "compose.ffmpeg":     {"id": "fal-ai/ffmpeg-api/compose",                      "kind": "compose"},
}


def has_audio(model: str) -> bool:
    entry = MODELS.get(model)
    return bool(entry and entry.get("audio"))


def dry_run() -> bool:
    return os.environ.get("CAROULY_DRY_RUN") == "1" or not config.FAL_KEY


class FalError(RuntimeError):
    pass


def resolve(model: str) -> str:
    """Accept either a registry alias ('video.veo3') or a raw fal id."""
    entry = MODELS.get(model)
    return entry["id"] if entry else model


def submit(model: str, payload: dict, *, poll: float = 3.0, timeout: float = 900) -> dict:
    """Run a fal model to completion via the queue API."""
    model_id = resolve(model)

    if dry_run():
        digest = hashlib.sha1(f"{model_id}{json.dumps(payload, sort_keys=True)}".encode()).hexdigest()[:12]
        TRACE.warn(f"DRY RUN {model_id} → placeholder {digest}")
        return {
            "_dry_run": True, "_model": model_id,
            "video": {"url": f"https://dry-run.local/{digest}.mp4"},
            "audio": {"url": f"https://dry-run.local/{digest}.mp3"},
            "images": [{"url": f"https://dry-run.local/{digest}.png"}],
            "url": f"https://dry-run.local/{digest}.bin",
        }

    headers = {"Authorization": f"Key {config.FAL_KEY}", "Content-Type": "application/json"}
    with httpx.Client(timeout=60) as c:
        r = c.post(f"{QUEUE}/{model_id}", json=payload, headers=headers)
        if r.status_code >= 400:
            raise FalError(f"submit {model_id} -> {r.status_code}: {r.text[:400]}")
        job = r.json()
        req_id = job.get("request_id")
        status_url = job.get("status_url") or f"{QUEUE}/{model_id}/requests/{req_id}/status"
        result_url = job.get("response_url") or f"{QUEUE}/{model_id}/requests/{req_id}"
        TRACE.step(f"fal {model_id} queued ({req_id})")

        deadline = time.time() + timeout
        while time.time() < deadline:
            time.sleep(poll)
            s = c.get(status_url, headers=headers)
            if s.status_code >= 400:
                raise FalError(f"status {req_id} -> {s.status_code}: {s.text[:300]}")
            state = s.json().get("status")
            if state == "COMPLETED":
                out = c.get(result_url, headers=headers)
                if out.status_code >= 400:
                    raise FalError(f"result {req_id} -> {out.status_code}: {out.text[:300]}")
                return out.json()
            if state in ("FAILED", "ERROR"):
                raise FalError(f"{model_id} failed: {json.dumps(s.json())[:400]}")
        raise FalError(f"{model_id} timed out after {timeout}s")


def upload(path: Path) -> str:
    """Upload a local file to fal storage and return its public URL."""
    if dry_run():
        return f"https://dry-run.local/upload/{path.name}"
    headers = {"Authorization": f"Key {config.FAL_KEY}"}
    with httpx.Client(timeout=180) as c:
        init = c.post(
            "https://rest.alpha.fal.ai/storage/upload/initiate",
            json={"content_type": "application/octet-stream", "file_name": path.name},
            headers=headers,
        )
        init.raise_for_status()
        data = init.json()
        put = c.put(data["upload_url"], content=path.read_bytes(),
                    headers={"Content-Type": "application/octet-stream"})
        put.raise_for_status()
        return data["file_url"]


def first_url(result: dict) -> str | None:
    """Pull the primary output URL out of fal's inconsistent response shapes."""
    for key in ("video", "audio", "image"):
        v = result.get(key)
        if isinstance(v, dict) and v.get("url"):
            return v["url"]
    for key in ("images", "videos", "audios", "files"):
        v = result.get(key)
        if isinstance(v, list) and v and isinstance(v[0], dict) and v[0].get("url"):
            return v[0]["url"]
    if isinstance(result.get("url"), str):
        return result["url"]
    return None


def fetch_to(url: str, dest: Path) -> Path:
    """Download a fal output URL to disk. No-op placeholder in dry run."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if url.startswith("https://dry-run.local/"):
        dest.write_bytes(b"")
        return dest
    with httpx.Client(timeout=300, follow_redirects=True) as c:
        r = c.get(url)
        r.raise_for_status()
        dest.write_bytes(r.content)
    return dest
