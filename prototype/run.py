#!/usr/bin/env python3
"""Carouly prototype CLI.

  ./run.py kit https://carouly.eu            capture + brand kit + package
  ./run.py match carouly                     rank templates for a captured brand
  ./run.py video carouly --concept 0         produce one video from a concept
  ./run.py all https://carouly.eu            everything, first concept
  ./run.py templates                         list template workflows
  ./run.py graph ugc_talking_head            show a template's DAG

Free by default: openrouter/free for text, and fal calls are stubbed unless
FAL_KEY is set. Add FAL_KEY to .env.local to render for real.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from core import config, llm  # noqa: E402
from core.trace import C, Trace, set_trace  # noqa: E402
from stages import s1_capture, s2_brand, s3_package, s4_match, s5_produce  # noqa: E402
from tools import falai, fs, web  # noqa: E402
from workflow import nodes  # noqa: E402,F401
from workflow.graph import Workflow, load_presets  # noqa: E402


def _load_brand(slug: str) -> dict:
    p = config.brand_dir(slug) / "brand.json"
    brand = fs.read_json(p)
    if not brand:
        raise SystemExit(f"no brand.json for '{slug}' — run: ./run.py kit <url>")
    return brand


def _trace_for(slug: str) -> None:
    set_trace(Trace(config.brand_dir(slug) / "trace.jsonl"))


def cmd_kit(args) -> dict:
    slug = args.slug or web.slug_for(args.url)
    _trace_for(slug)
    cap = s1_capture.capture(args.url, slug)
    brand = s2_brand.run(cap)
    return s3_package.run(brand)


def cmd_match(args) -> dict:
    _trace_for(args.slug)
    return s4_match.run(_load_brand(args.slug))


def cmd_video(args) -> dict:
    _trace_for(args.slug)
    brand = _load_brand(args.slug)
    concepts = brand.get("video_concepts") or []
    if not concepts:
        raise SystemExit("brand.json has no video_concepts")
    idx = max(0, min(args.concept, len(concepts) - 1))
    concept = concepts[idx]

    template = args.template
    if not template:
        match = fs.read_json(config.brand_dir(args.slug) / "template_match.json") or s4_match.run(brand)
        pairs = match.get("pairs", [])
        hit = next((p for p in pairs if p.get("concept_title") == concept.get("title")), None)
        template = (hit or {}).get("template_id") or match["shortlist"][0]["id"]
    return s5_produce.run(brand, concept, template, fresh=args.fresh)


def cmd_all(args) -> dict:
    brand = cmd_kit(args)
    s4_match.run(brand)
    ns = argparse.Namespace(slug=brand["slug"], concept=0, template=args.template, fresh=False)
    return cmd_video(ns)


def cmd_templates(_args) -> None:
    for wf in load_presets(config.PRESETS):
        print(f"\n{C['b']}{wf.id}{C['x']}  — {wf.name}")
        print(f"  {wf.description}")
        print(f"  {C['dim']}inputs: {', '.join(wf.inputs)}{C['x']}")
        print(f"  {C['dim']}nodes:  {' → '.join(n.id for n in wf.order())}{C['x']}")


def cmd_graph(args) -> None:
    wf = Workflow.load(config.PRESETS / f"{args.template}.json")
    print(f"\n{C['b']}{wf.name}{C['x']} ({wf.id})  {wf.meta.get('aspect','')}\n")
    for n in wf.order():
        loop = f"  {C['yel']}foreach {n.foreach}{C['x']}" if n.foreach else ""
        print(f"  {C['grn']}{n.id:<12}{C['x']} {C['dim']}{n.type:<14}{C['x']}{loop}")
        for k, v in n.params.items():
            s = json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
            print(f"       {C['dim']}{k}: {s[:100].replace(chr(10),' ')}{C['x']}")
    print(f"\n  output: {wf.output}\n")


def main() -> None:
    ap = argparse.ArgumentParser(prog="run.py", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    k = sub.add_parser("kit", help="capture a site and build its brand kit")
    k.add_argument("url"); k.add_argument("--slug")
    k.set_defaults(fn=cmd_kit)

    m = sub.add_parser("match", help="rank templates for a captured brand")
    m.add_argument("slug"); m.set_defaults(fn=cmd_match)

    v = sub.add_parser("video", help="produce a video from a concept")
    v.add_argument("slug")
    v.add_argument("--concept", type=int, default=0, help="index into brand.video_concepts")
    v.add_argument("--template", help="force a template id")
    v.add_argument("--fresh", action="store_true", help="ignore the node cache")
    v.set_defaults(fn=cmd_video)

    a = sub.add_parser("all", help="kit + match + first video")
    a.add_argument("url"); a.add_argument("--slug"); a.add_argument("--template")
    a.set_defaults(fn=cmd_all)

    sub.add_parser("templates", help="list template workflows").set_defaults(fn=cmd_templates)

    g = sub.add_parser("graph", help="print a template's DAG")
    g.add_argument("template"); g.set_defaults(fn=cmd_graph)

    args = ap.parse_args()
    if falai.dry_run() and args.cmd in ("video", "all"):
        print(f"{C['yel']}⚠ FAL_KEY unset — video nodes run in DRY RUN (no credits spent){C['x']}")

    try:
        out = args.fn(args)
    except KeyboardInterrupt:
        print(f"\n{C['yel']}interrupted — cached nodes are preserved, rerun to resume{C['x']}")
        raise SystemExit(130)
    except Exception as e:  # noqa: BLE001 - CLI boundary: report, don't dump a traceback
        slug = getattr(args, "slug", None) or (
            web.slug_for(args.url) if getattr(args, "url", None) else None)
        print(f"\n{C['red']}✗ {type(e).__name__}: {e}{C['x']}")
        if slug:
            print(f"  {C['dim']}trace: workspace/{slug}/trace.jsonl{C['x']}")
        print(f"  {C['dim']}{llm.USAGE.summary()}{C['x']}")
        if "--debug" in sys.argv:
            raise
        raise SystemExit(1)

    if isinstance(out, dict):
        print(f"\n{C['b']}{C['grn']}done{C['x']}  {llm.USAGE.summary()}")


if __name__ == "__main__":
    main()
