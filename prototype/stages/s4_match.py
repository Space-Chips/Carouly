"""Stage 4 — template matching.

Deterministic scoring first (free, explainable, stable), then one cheap LLM call
to pick among the top candidates and say why. Scoring beats an LLM here because
the signal is literal tag overlap between the brand profile and each preset's
`match` block.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from core import config, llm
from core.trace import TRACE
from workflow.graph import Workflow, load_presets

WEIGHTS = {
    "creative_format": 3.0,
    "preferred_types": 2.0,
    "tone": 1.5,
    "funnel_stage": 1.0,
    "settings": 1.0,
}


def _tags(v) -> set[str]:
    if isinstance(v, str):
        return {v.lower().strip()}
    if isinstance(v, list):
        return {str(x).lower().strip() for x in v}
    return set()


def _tokens(tag: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", tag.lower()) if len(t) > 2}


def _similarity(a: str, b: str) -> float:
    """1.0 exact, 0.6 token overlap, 0 otherwise.

    Models will not reproduce our controlled vocabulary exactly — they write
    "demo" where a preset says "product-demo". Exact set intersection throws
    those away, so compare on token overlap instead.
    """
    if a == b:
        return 1.0
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    overlap = ta & tb
    if not overlap:
        return 0.0
    return 0.6 * (len(overlap) / min(len(ta), len(tb)))


def score(profile: dict, wf: Workflow) -> tuple[float, list[str]]:
    total, reasons = 0.0, []
    for key, weight in WEIGHTS.items():
        brand_tags = _tags(profile.get(key))
        tmpl_tags = _tags(wf.match.get(key))
        if not brand_tags or not tmpl_tags:
            continue
        hits = []
        for bt in brand_tags:
            best = max((( _similarity(bt, tt), tt) for tt in tmpl_tags), default=(0.0, ""))
            if best[0] > 0:
                total += weight * best[0]
                hits.append(bt if best[0] == 1.0 else f"{bt}~{best[1]}")
        if hits:
            reasons.append(f"{key}: {', '.join(sorted(hits))}")
    return total, reasons


def rank(brand: dict, presets_dir: Path | None = None) -> list[dict]:
    presets = load_presets(presets_dir or config.PRESETS)
    profile = brand.get("template_matching_profile", {}) or {}
    out = []
    for wf in presets:
        s, reasons = score(profile, wf)
        out.append({"id": wf.id, "name": wf.name, "description": wf.description,
                    "score": round(s, 2), "reasons": reasons,
                    "inputs": list(wf.inputs.keys())})
    return sorted(out, key=lambda r: -r["score"])


def run(brand: dict, top_n: int = 4) -> dict:
    TRACE.stage("Stage 4 · template matching")
    ranked = rank(brand)
    for r in ranked:
        TRACE.step(f"  {r['score']:>5}  {r['id']:<24} {'; '.join(r['reasons'])[:70]}")

    shortlist = ranked[:top_n]
    concepts = brand.get("video_concepts", []) or []

    pairing = {}
    if concepts and shortlist:
        try:
            pairing = llm.json_call(
                "You match video concepts to production templates. Answer only with JSON.",
                f"""Brand: {brand.get('brand_name')} — {brand.get('brand_summary','')[:600]}

CONCEPTS:
{json.dumps([{ 'title': c.get('title'), 'format': c.get('format'), 'hook': c.get('hook') } for c in concepts], indent=1)}

TEMPLATES:
{json.dumps([{ 'id': t['id'], 'name': t['name'], 'description': t['description'] } for t in shortlist], indent=1)}

For each concept pick the single best template id and give a one-line reason.""",
                model=config.MODEL_SYNTH,
                schema_hint='{"pairs":[{"concept_title":"","template_id":"","why":""}]}',
                temperature=0.3, max_tokens=1500,
            )
        except Exception as e:  # noqa: BLE001 - fall back to pure scoring
            TRACE.warn(f"LLM pairing failed, using score order: {e}")

    pairs = pairing.get("pairs", []) if isinstance(pairing, dict) else []
    valid_ids = {t["id"] for t in shortlist}
    for p in pairs:
        if p.get("template_id") not in valid_ids:
            p["template_id"] = shortlist[0]["id"]
    if not pairs:
        pairs = [{"concept_title": c.get("title"), "template_id": shortlist[0]["id"] if shortlist else None,
                  "why": "highest profile match score"} for c in concepts]

    for p in pairs:
        TRACE.ok(f"«{p.get('concept_title','?')}» → {p.get('template_id')}")

    result = {"ranked": ranked, "shortlist": shortlist, "pairs": pairs}
    (config.brand_dir(brand["slug"]) / "template_match.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False))
    return result
