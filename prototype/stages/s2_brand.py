"""Stage 2 — brand synthesis. This is the agentic stage.

Three passes, because asking a free model for one 400-line JSON reliably fails:
  2a  research  — an agent with web tools explores beyond the landing page
  2b  synthesis — structured generation of brand.json from capture + research
  2c  grounding — every evidence quote is checked against the real captured text,
                  and unsupported ones are dropped (AdAnt's fix_evidence.json pass)
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from core import config, llm
from core.agent import Agent
from core.tools import Toolbox
from core.trace import TRACE
from tools import fs, imaging, web

RESEARCH_SYSTEM = """You are a brand researcher. You are given a landing page that has already been captured.
Your job is to fill the gaps the landing page alone cannot answer.

Method:
- Use page_text on likely sub-pages (/pricing, /about, /faq, /features, /blog) to find real detail.
- If a page errors, try http_get on it — server-rendered HTML often still holds the copy.
- Do NOT invent anything. If you cannot find pricing or social links, say so.

Stop after at most 6 tool calls. Then reply with ONLY a JSON object:
{"pages_checked": [...], "extra_copy": ["verbatim sentences worth quoting"],
 "pricing": "what you actually found or null", "social_links": [...],
 "competitors_or_category": "...", "gaps": ["what remains unknown"]}"""

BRAND_SYSTEM = """You are a brand strategist producing a machine-readable brand kit for a short-form video generator.

Hard rules:
- Ground every claim in the supplied captured text. Never invent features, prices or customers.
- `evidence[].quote` MUST be copied verbatim from the captured text. If you cannot find a real
  supporting sentence for a selling point, omit that evidence entry rather than paraphrasing.
- voice_tone should describe how the brand actually writes, judged from its own sentences.
- video_concepts must be shootable as 9:16 vertical video in under 25 seconds each."""

BRAND_SCHEMA = """{
  "brand_name": "string",
  "brand_summary": "3-4 sentences on what it is and who it is for",
  "voice_tone": "how this brand writes, in one line",
  "value_props": ["3-6 strings"],
  "facts": {"title": "", "meta_description": "", "tagline": "",
            "copy_snippets": ["5-8 verbatim lines from the site"]},
  "products": [{"id": "kebab-case", "name": "", "product_kind": "app|physical|service",
                "category": "", "product_type": "", "description": "2-4 sentences",
                "selling_points": ["4-6"], "use_cases": ["2-4"], "target_audiences": ["2-3"],
                "evidence": [{"quote": "verbatim from captured text", "supports": ["selling_points[0]"]}]}],
  "target_personas": [{"name": "", "demographics": "", "needs": "", "where_they_are": ""}],
  "brand_ideas": [{"title": "", "angle": "", "why": ""}],
  "video_concepts": [{"title": "", "hook": "spoken first line, <=14 words", "format": "UGC|talking-head|demo",
                      "beats": ["3-4 shot beats"], "cta": ""}],
  "template_matching_profile": {
    "preferred_types": [], "industries": [], "product_types": [], "use_cases": [],
    "pain_points": [], "audiences": [], "funnel_stage": [], "creative_format": [],
    "tone": [], "settings": []},
  "asset_descriptions": {"assets/product/x.jpg": "what this image shows, one clause"}
}

COUNTS (produce at least this many): 3 target_personas, 5 brand_ideas, 5 video_concepts,
4 selling_points per product, 6 copy_snippets.

CONTROLLED VOCABULARY — for template_matching_profile use ONLY these values, because
they are matched literally against the template library:
  preferred_types:  UGC | Demo | Animation | TVC | Testimonial
  creative_format:  talking-head | ugc-testimonial | product-demo | screen-recording | voiceover-montage
  funnel_stage:     awareness | consideration | conversion | retention
  tone:             confident | plain-spoken | contrarian | dry-wit | warm | urgent | empathetic | premium
  settings:         home-office | small-shop | desk | outdoor | studio | screen | app-ui | phone-camera-selfie
The other keys (industries, product_types, use_cases, pain_points, audiences) are free text:
use lowercase-hyphenated tags."""


def _corpus(cap: dict, base: Path) -> str:
    """Everything real we know the site said, as one searchable blob."""
    parts = [cap.get("markdown", "")]
    parts += [v["text"] for v in cap.get("visible_text", [])]
    parts += [f"{k}: {v}" for k, v in (cap.get("meta") or {}).items()]
    return "\n".join(p for p in parts if p)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip().lower()


def research(cap: dict) -> dict:
    """2a — agentic gap-filling beyond the landing page."""
    TRACE.stage("Stage 2a · research (agentic)")
    box = Toolbox(web.page_text, web.http_get)
    agent = Agent("researcher", RESEARCH_SYSTEM, box, model=config.MODEL_AGENT, max_steps=10)
    goal = (
        f"Site: {cap['url']}\nTitle: {cap.get('title','')}\n\n"
        f"Already captured from the landing page:\n{cap.get('markdown','')[:6000]}\n\n"
        "Find what is missing. Then return the JSON object."
    )
    try:
        out = agent.run(goal, expect_json=True)
        return out if isinstance(out, dict) else {}
    except Exception as e:  # noqa: BLE001 - research is optional enrichment
        TRACE.warn(f"research failed, continuing without it: {e}")
        return {}


def synthesise(cap: dict, notes: dict, base: Path) -> dict:
    """2b — structured brand.json generation."""
    TRACE.stage("Stage 2b · synthesis")
    corpus = _corpus(cap, base)
    palette = cap["palette"]

    user = f"""SOURCE URL: {cap['url']}
PAGE TITLE: {cap.get('title','')}
PALETTE (from {palette['palette_source']}): {', '.join(palette['palette'][:10])}
META: {json.dumps(cap.get('meta', {}))[:1200]}

── CAPTURED PAGE TEXT (the only source of truth for quotes) ──
{corpus[:22000]}

── ADDITIONAL RESEARCH ──
{json.dumps(notes, ensure_ascii=False)[:4000]}

── DOWNLOADED IMAGERY (the site ships no alt text; infer each one's subject from
   its filename and the page copy above, for `asset_descriptions`. If a filename
   tells you nothing, omit it rather than guessing.) ──
{json.dumps([a['file'] for role in ('product', 'image')
             for a in cap['assets'].get(role, [])], indent=1)}

Produce the brand kit JSON."""

    # openrouter/free routes to whichever model is spare; weak ones return an
    # array, or an object missing the keys everything downstream depends on.
    # Retry on a fresh routing draw before giving up on the whole run.
    essential = ("brand_name", "brand_summary", "video_concepts")
    last_err = ""
    for attempt in range(3):
        try:
            data = llm.json_call(
                BRAND_SYSTEM, user,
                model=config.MODEL_SYNTH,
                schema_hint="Return JSON of exactly this shape:\n" + BRAND_SCHEMA,
                temperature=0.5, max_tokens=8000,
            )
        except llm.LLMError as e:
            last_err = str(e)
            TRACE.warn(f"synthesis attempt {attempt + 1}/3 failed: {e}")
            continue

        if isinstance(data, list):
            data = next((d for d in data if isinstance(d, dict)), None)
        if not isinstance(data, dict):
            last_err = "model returned a non-object"
            TRACE.warn(f"synthesis attempt {attempt + 1}/3: {last_err}")
            continue

        missing = [k for k in essential if not data.get(k)]
        if missing:
            last_err = f"missing essential keys {missing}"
            TRACE.warn(f"synthesis attempt {attempt + 1}/3: {last_err}")
            continue
        return data

    raise llm.LLMError(
        f"synthesis failed after 3 attempts ({last_err}). "
        f"openrouter/free is unreliable for output this large — set "
        f"CAROULY_MODEL_SYNTH to a paid model."
    )


def ground_evidence(brand: dict, cap: dict, base: Path) -> dict:
    """2c — drop every evidence quote that is not literally in the captured text."""
    TRACE.stage("Stage 2c · evidence grounding")
    corpus_n = _norm(_corpus(cap, base))
    kept, dropped = 0, 0

    for product in brand.get("products", []) or []:
        verified = []
        for ev in product.get("evidence", []) or []:
            q = _norm(ev.get("quote", ""))
            if len(q) < 12:
                dropped += 1
                continue
            # allow an ellipsis-joined quote if both halves are present
            segments = [s for s in re.split(r"\s*\.\.\.\s*|\s*…\s*", q) if len(s) > 8] or [q]
            if all(s in corpus_n for s in segments):
                ev.setdefault("source_url", cap["url"])
                verified.append(ev)
                kept += 1
            else:
                TRACE.warn(f"  unsupported quote dropped: {ev.get('quote','')[:70]}…")
                dropped += 1
        product["evidence"] = verified

    fs.write_json(base / "fix_evidence.json", {
        "checked_against": "capture/visible-text.txt + pages/home.md",
        "kept": kept, "dropped": dropped,
        "products": [{"id": p.get("id"), "evidence": p.get("evidence", [])}
                     for p in brand.get("products", []) or []],
    })
    (TRACE.ok if dropped == 0 else TRACE.warn)(f"evidence: {kept} verified, {dropped} dropped")
    return brand


def finalise(brand: dict, cap: dict, base: Path) -> dict:
    """Merge captured facts into the model's output and write brand.json."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    facts = brand.setdefault("facts", {})
    facts.setdefault("title", cap.get("title", ""))
    facts.setdefault("meta_description", (cap.get("meta") or {}).get("description", ""))
    facts["palette"] = cap["palette"]["palette"]
    facts["palette_source"] = cap["palette"]["palette_source"]
    facts.setdefault("fonts", [t.get("fontFamily") for t in
                               (fs.read_json(base / "capture" / "design-tokens.json", {}) or {})
                               .get("typography", [])[:2]])

    # Fold generated descriptions back onto the asset records so downstream
    # video nodes get a usable `alt` instead of the site's empty one.
    descriptions = brand.pop("asset_descriptions", {}) or {}
    for group in cap["assets"].values():
        for a in group:
            if descriptions.get(a["file"]):
                a["alt"] = descriptions[a["file"]]

    brand.update({
        "schema_version": 2,
        "slug": cap["slug"],
        "source_url": cap["url"],
        "kind": "site",
        "assets": cap["assets"],
        "capture_health": {
            "render_broken": cap["render_broken"],
            "http_fallback": cap["http_fallback"],
        },
        "updated_at": now,
    })
    brand.setdefault("created_at", now)
    if brand.get("products"):
        brand.setdefault("primary_product_id", brand["products"][0].get("id"))

    fs.write_json(base / "brand.json", brand)
    TRACE.ok(f"brand.json written ({len(json.dumps(brand))} bytes)")
    return brand


def run(cap: dict) -> dict:
    base = config.brand_dir(cap["slug"])
    notes = research(cap)
    fs.write_json(base / "research.json", notes)
    brand = synthesise(cap, notes, base)
    brand = ground_evidence(brand, cap, base)
    return finalise(brand, cap, base)
