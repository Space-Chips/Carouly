"""Stage 3 — package: contact sheet, human-readable brief, zip bundle."""
from __future__ import annotations

import json
import zipfile
from pathlib import Path

from core import config, llm
from core.trace import TRACE
from tools import fs, imaging

BRIEF_SYSTEM = """You write brand briefs for a creative team that will shoot short vertical video.
Plain English, no filler, no bullet-point padding. Every line must be usable by a director.
Output GitHub-flavoured markdown only."""


def _unfence(md: str) -> str:
    """Models often wrap a whole markdown document in a ```markdown fence."""
    s = md.strip()
    if s.startswith("```"):
        first, _, rest = s.partition("\n")
        # Only unwrap a markdown fence — a ```json block is real document content.
        if first.strip("` ").lower() in ("", "markdown", "md"):
            s = rest
            if s.rstrip().endswith("```"):
                s = s.rstrip()[:-3]
    return s.strip() + "\n"


def brief(brand: dict) -> str:
    TRACE.step("writing brandkit.md")
    slim = {k: v for k, v in brand.items() if k not in ("assets", "capture_health")}
    try:
        return _unfence(llm.chat(
            [
                {"role": "system", "content": BRIEF_SYSTEM},
                {"role": "user", "content":
                 f"Write a one-page brand brief from this kit.\n\nSections: what it is, brand voice, "
                 f"visual identity (use the real palette hexes), personas, video concepts, and a "
                 f"'research notes' section stating capture problems honestly.\n\n"
                 f"{json.dumps(slim, ensure_ascii=False)[:14000]}\n\n"
                 f"Capture health: {json.dumps(brand.get('capture_health', {}))}"},
            ],
            model=config.MODEL_SYNTH, temperature=0.5, max_tokens=3000,
        ).get("content") or "")
    except Exception as e:  # noqa: BLE001
        TRACE.warn(f"brief generation failed: {e}")
        return f"# {brand.get('brand_name','Brand')} — Brand Kit\n\n{brand.get('brand_summary','')}\n"


def bundle(slug: str) -> Path:
    base = config.brand_dir(slug)
    out = base / f"{slug}-brand-kit.zip"
    skip = {out.name, "run.json"}
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(base.rglob("*")):
            if p.is_file() and p.name not in skip and "video" not in p.relative_to(base).parts:
                z.write(p, p.relative_to(base))
    return out


def run(brand: dict) -> dict:
    slug = brand["slug"]
    base = config.brand_dir(slug)
    TRACE.stage("Stage 3 · package")

    sheet = imaging.contact_sheet(slug)
    if "error" in sheet:
        TRACE.warn(f"contact sheet: {sheet['error']}")
    else:
        TRACE.ok(f"contact sheet: {sheet['tiles']} tiles → {sheet['file']}")
        brand.setdefault("assets", {})["contact_sheet"] = sheet["file"]

    md = brief(brand)
    (base / "brandkit.md").write_text(md)

    zip_path = bundle(slug)
    brand.setdefault("assets", {})["bundle"] = zip_path.name
    fs.write_json(base / "brand.json", brand)
    TRACE.ok(f"bundle: {zip_path.name} ({zip_path.stat().st_size // 1024} KB)")
    return brand
