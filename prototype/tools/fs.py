"""Workspace-scoped file tools. The agent can only touch its own brand folder."""
from __future__ import annotations

import json
from pathlib import Path

from core import config
from core.tools import tool


def _safe(brand_slug: str, rel_path: str) -> Path:
    """Resolve rel_path inside the brand dir, refusing traversal outside it."""
    base = config.brand_dir(brand_slug).resolve()
    target = (base / rel_path).resolve()
    if base not in target.parents and target != base:
        raise ValueError(f"path escapes brand workspace: {rel_path}")
    return target


@tool
def write_file(brand_slug: str, rel_path: str, content: str) -> str:
    """Write a text file into the brand kit folder, creating parent directories.

    Args:
        brand_slug: Brand folder name, e.g. "carouly".
        rel_path: Path inside the kit, e.g. "brand.json" or "pages/home.md".
        content: Full file contents to write.
    """
    p = _safe(brand_slug, rel_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)
    return f"wrote {rel_path} ({len(content)} chars)"


@tool
def read_file(brand_slug: str, rel_path: str) -> str:
    """Read a text file from the brand kit folder.

    Args:
        brand_slug: Brand folder name.
        rel_path: Path inside the kit.
    """
    p = _safe(brand_slug, rel_path)
    if not p.exists():
        return f"ERROR: {rel_path} does not exist"
    return p.read_text(errors="replace")[:40000]


@tool
def list_files(brand_slug: str) -> str:
    """List every file currently in the brand kit folder with its size.

    Args:
        brand_slug: Brand folder name.
    """
    base = config.brand_dir(brand_slug)
    out = []
    for p in sorted(base.rglob("*")):
        if p.is_file():
            out.append({"path": str(p.relative_to(base)), "bytes": p.stat().st_size})
    return json.dumps(out)


def read_json(path: Path, default=None):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return default


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
