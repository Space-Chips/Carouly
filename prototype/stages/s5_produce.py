"""Stage 5 — production: bind a concept to a template's declared inputs, then run the graph.

The template declares what it needs (`inputs`); a model fills those slots from the
brand kit and the chosen concept. Nothing else in the graph is model-decided, so the
same concept always produces a structurally identical video.
"""
from __future__ import annotations

import json
from pathlib import Path

from core import config, llm
from core.trace import TRACE
from workflow import nodes  # noqa: F401 - registers node types
from workflow.graph import Run, Workflow

BIND_SYSTEM = """You are a short-form video director filling in a production template.
You will be given a brand kit, one video concept, and the template's required inputs.
Return ONLY a JSON object whose keys are exactly the template's input names.

Rules:
- Write spoken language. Contractions. No marketing register.
- Respect any length limit stated in an input's description.
- Use the brand's real vocabulary and claims. Do not invent features."""


def find_template(template_id: str) -> Workflow:
    path = config.PRESETS / f"{template_id}.json"
    if not path.exists():
        available = ", ".join(p.stem for p in config.PRESETS.glob("*.json"))
        raise SystemExit(f"no template '{template_id}'. Available: {available}")
    return Workflow.load(path)


def bind_inputs(brand: dict, concept: dict, wf: Workflow) -> dict:
    """Ask the model for exactly the inputs this template declares."""
    TRACE.step(f"binding concept «{concept.get('title')}» to template «{wf.id}»")
    spec = {k: v.get("description", "") for k, v in wf.inputs.items()}
    user = f"""BRAND
name: {brand.get('brand_name')}
summary: {brand.get('brand_summary')}
voice: {brand.get('voice_tone')}
value props: {json.dumps(brand.get('value_props', []))}
personas: {json.dumps(brand.get('target_personas', []))[:1200]}
real lines from the site: {json.dumps((brand.get('facts') or {}).get('copy_snippets', []))}

CONCEPT
title: {concept.get('title')}
hook: {concept.get('hook')}
format: {concept.get('format')}
beats: {json.dumps(concept.get('beats', []))}
cta: {concept.get('cta')}

TEMPLATE «{wf.name}»
{wf.description}

REQUIRED INPUTS
{json.dumps(spec, indent=2)}

Return the JSON object with those exact keys."""

    try:
        values = llm.json_call(
            BIND_SYSTEM, user,
            model=config.MODEL_SYNTH,
            schema_hint="Keys required: " + ", ".join(wf.inputs.keys()),
            temperature=0.7, max_tokens=2500,
        )
    except llm.LLMError as e:
        # openrouter/free routes to whatever is spare; some models never return
        # usable JSON. The concept already holds everything the template needs,
        # so fall through to the deterministic mapping rather than failing the run.
        TRACE.warn(f"binding failed ({e}) — deriving inputs from the concept directly")
        values = {}
    if not isinstance(values, dict):
        values = {}

    # Repair: fill anything the model skipped straight from the concept.
    fallbacks = {
        "hook": concept.get("hook"), "cta": concept.get("cta"),
        "beats": concept.get("beats"), "steps": concept.get("beats"),
        "pain": concept.get("hook"), "turn": (concept.get("beats") or [None])[0],
        "payoff": (concept.get("beats") or [None, None])[-1],
        "promise": concept.get("hook"), "presenter": None,
    }
    for key, spec_v in wf.inputs.items():
        if not values.get(key) and fallbacks.get(key):
            values[key] = fallbacks[key]
            TRACE.warn(f"  input '{key}' missing — filled from concept")
        if not values.get(key) and not spec_v.get("required", True):
            values[key] = ""
    return values


def run(brand: dict, concept: dict, template_id: str, *, fresh: bool = False) -> dict:
    TRACE.stage(f"Stage 5 · produce · {template_id}")
    wf = find_template(template_id)

    slug_bits = "".join(ch if ch.isalnum() else "-" for ch in (concept.get("title") or "video").lower())
    workdir = config.brand_dir(brand["slug"]) / "video" / f"{template_id}__{slug_bits.strip('-')[:40]}"
    workdir.mkdir(parents=True, exist_ok=True)
    inputs_path = workdir / "inputs.json"

    # Binding is non-deterministic, so re-asking on every run would change every
    # downstream hash and defeat the node cache. Pin the creative once; --fresh rebinds.
    if inputs_path.exists() and not fresh:
        values = json.loads(inputs_path.read_text())
        TRACE.step(f"reusing pinned inputs from {inputs_path.name} (--fresh to rebind)")
    else:
        values = bind_inputs(brand, concept, wf)
        inputs_path.write_text(json.dumps(values, indent=2, ensure_ascii=False))
    TRACE.step("inputs: " + json.dumps(values, ensure_ascii=False)[:400])

    run_obj = Run(wf, workdir, brand=brand, fresh=fresh)

    out = run_obj.execute(values)

    manifest = {
        "template": wf.id, "concept": concept.get("title"),
        "inputs": values, "result": out["result"],
        "nodes": {k: v for k, v in out["scope"].items() if k not in ("inputs", "brand")},
    }
    (workdir / "manifest.json").write_text(json.dumps(manifest, indent=2, default=str, ensure_ascii=False))

    result = out["result"]
    url = result.get("url") if isinstance(result, dict) else None
    TRACE.ok(f"video → {url or workdir}")
    return manifest
