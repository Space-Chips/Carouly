"""Config + env loading. Reads the Next.js app's .env.local so there is one key store."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # prototype/
REPO = ROOT.parent                                      # Carouly/
WORKSPACE = ROOT / "workspace"
PRESETS = ROOT / "workflow" / "presets"


def _load_env() -> None:
    """Parse .env.local by hand — no python-dotenv dependency."""
    for path in (REPO / ".env.local", ROOT / ".env"):
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env()

OPENROUTER_KEY = os.environ.get("OPEN_ROUTER_API", "")
FAL_KEY = os.environ.get("FAL_KEY", "")

# openrouter/free picks a random free model per call, so quality swings run to run.
# Each role can be overridden independently when a stage needs a stronger model.
MODEL_AGENT = os.environ.get("CAROULY_MODEL_AGENT", "openrouter/free")
MODEL_SYNTH = os.environ.get("CAROULY_MODEL_SYNTH", "openrouter/free")
MODEL_VISION = os.environ.get("CAROULY_MODEL_VISION", "openrouter/free")

HTTP_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def brand_dir(slug: str) -> Path:
    d = WORKSPACE / slug
    d.mkdir(parents=True, exist_ok=True)
    return d


def require_openrouter() -> str:
    if not OPENROUTER_KEY:
        raise SystemExit("OPEN_ROUTER_API missing from .env.local")
    return OPENROUTER_KEY
