"""Stage 1 — capture. Deterministic, no LLM.

Reproduces AdAnt's `capture/` + `pages/` artifacts. Cheap code does the fetching;
the model is only spent on judgement later.

The reference run's lesson is baked in: a headless render that returns an error
page is not a dead end. If the render looks broken, refetch over plain HTTP —
server-rendered markup usually still carries the real copy.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

from core import config
from core.trace import TRACE
from tools import fs, imaging, web

ERROR_MARKERS = (
    "INTERNAL_SERVER_ERROR", "MIDDLEWARE_INVOCATION_FAILED", "This Routing Middleware has crashed",
    "404: NOT_FOUND", "Application error", "DEPLOYMENT_NOT_FOUND",
)


def looks_broken(status: int | None, text: str) -> bool:
    if status is not None and status >= 400:
        return True
    return any(m in text for m in ERROR_MARKERS)


def variants(url: str) -> list[str]:
    """The same page addressed differently — often one path works when another 500s."""
    url = web.normalise_url(url)
    p = urlparse(url)
    host = p.netloc
    alt = host[4:] if host.startswith("www.") else "www." + host
    seen, out = set(), []
    for h in (host, alt):
        for scheme in ("https",):
            u = f"{scheme}://{h}{p.path or '/'}"
            if u not in seen:
                seen.add(u)
                out.append(u)
    return out


def capture(url: str, slug: str | None = None) -> dict:
    url = web.normalise_url(url)
    slug = slug or web.slug_for(url)
    base = config.brand_dir(slug)
    TRACE.stage(f"Stage 1 · capture {url} → workspace/{slug}")

    # ── render ───────────────────────────────────────────────────────────
    rendered: dict = {}
    try:
        rendered = web.render(url, out_dir=base)
        TRACE.step(f"rendered: status={rendered.get('status')} title={rendered.get('title','')!r}")
    except Exception as e:  # noqa: BLE001
        TRACE.warn(f"render failed: {e}")

    html = rendered.get("html", "")
    broken = looks_broken(rendered.get("status"), html)
    fallback_used = None

    # ── HTTP fallback when the render is an error page ───────────────────
    if broken or not html:
        TRACE.warn("render looks like an error page — falling back to direct HTTP")
        for candidate in variants(url):
            try:
                raw = json.loads(web.http_get.fn(candidate))
            except Exception as e:  # noqa: BLE001
                TRACE.warn(f"  {candidate} → {e}")
                continue
            body = raw.get("body", "")
            TRACE.step(f"  {candidate} → {raw['status']} ({raw['length']}b)")
            if not looks_broken(raw["status"], body) and len(body) > 2000:
                html = body
                fallback_used = candidate
                TRACE.ok(f"recovered real HTML via {candidate}")
                break

    if not html:
        TRACE.error("no usable HTML from any strategy")

    # ── pages/ ───────────────────────────────────────────────────────────
    (base / "pages").mkdir(parents=True, exist_ok=True)
    (base / "pages" / "home.html").write_text(html or "")
    md = web.html_to_markdown(html) if html else ""
    (base / "pages" / "home.md").write_text(md)
    title = rendered.get("title") or ""
    if html and (not title or looks_broken(None, title)):
        m = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
        title = (m.group(1).strip() if m else "")[:200]

    fs.write_json(base / "pages" / "crawl.json", {
        "root_url": url, "final_url": rendered.get("final_url", url),
        "kind": "site", "render_status": rendered.get("status"),
        "render_broken": broken, "http_fallback": fallback_used,
        "pages": [{"name": "home", "url": fallback_used or url, "title": title,
                   "html_file": "pages/home.html", "md_file": "pages/home.md",
                   "via": "http" if fallback_used else "playwright", "text_len": len(md)}],
    })

    # ── stylesheet (best palette source) ─────────────────────────────────
    css = ""
    sheets = (rendered.get("assets") or {}).get("stylesheets") or []
    if not sheets and html:
        sheets = [urljoin(fallback_used or url, h)
                  for h in re.findall(r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"', html)]
    for s in sheets[:4]:
        try:
            chunk = json.loads(web.http_get.fn(s)).get("body", "")
            css += chunk
        except Exception:  # noqa: BLE001
            continue
    if css:
        (base / "pages" / "style.css").write_text(css[:400000])
        TRACE.step(f"stylesheet: {len(css)}b from {len(sheets[:4])} file(s)")

    # ── capture/ ─────────────────────────────────────────────────────────
    cap = base / "capture"
    cap.mkdir(parents=True, exist_ok=True)
    tokens = rendered.get("design_tokens") or {}
    fs.write_json(cap / "design-tokens.json", tokens)

    visible = rendered.get("visible_text") or []
    if broken or not visible:
        visible = [{"tag": "md", "text": ln, "href": ""} for ln in md.splitlines() if ln.strip()][:400]
    fs.write_json(cap / "visible-text.json", visible)
    (cap / "visible-text.txt").write_text("\n".join(v["text"] for v in visible))

    palette = derive_palette(tokens, css, base)
    fs.write_json(cap / "palette.json", palette)
    TRACE.step(f"palette: {' '.join(palette['palette'][:8])} (via {palette['palette_source']})")

    assets = harvest_assets(rendered, html, fallback_used or url, base)

    fs.write_json(cap / "manifest.json", {
        "schema_version": 1, "source_url": url,
        "final_url": rendered.get("final_url", url),
        "status": rendered.get("status"), "render_broken": broken,
        "http_fallback": fallback_used,
        "page_height": rendered.get("page_height"),
        "screenshots": rendered.get("screenshots", []),
        "downloaded": [a["file"] for a in _flatten(assets)],
    })

    fs.write_json(base / "assets_patch.json", {"assets": assets})
    TRACE.ok(f"captured {len(_flatten(assets))} assets, {len(md)} chars of copy")

    return {
        "slug": slug, "url": url, "title": title, "markdown": md,
        "visible_text": visible, "palette": palette, "assets": assets,
        "render_broken": broken, "http_fallback": fallback_used,
        "meta": (rendered.get("assets") or {}).get("meta", {}),
    }


def _flatten(assets: dict) -> list[dict]:
    return [a for group in assets.values() for a in group]


def derive_palette(tokens: dict, css: str, base: Path) -> dict:
    """CSS custom properties > stylesheet hex frequency > screenshot pixels."""
    css_vars = tokens.get("css_variables") or {}
    hexes = [v.strip() for v in css_vars.values() if re.fullmatch(r"#[0-9a-fA-F]{3,8}", v.strip())]
    if len(hexes) >= 3:
        return {"palette": _dedupe(hexes)[:10], "palette_source": "live_css_variables",
                "css_variables": css_vars}

    from_css = web.palette_from_css(css) if css else []
    if len(from_css) >= 3:
        return {"palette": from_css[:10], "palette_source": "stylesheet_frequency",
                "css_variables": css_vars}

    computed = [h for h in (web.rgb_to_hex(c) for c in (tokens.get("colors") or [])) if h]
    if len(computed) >= 3:
        return {"palette": _dedupe(computed)[:10], "palette_source": "computed_styles",
                "css_variables": css_vars}

    shot = base / "capture" / "screenshots" / "scroll-01.png"
    if shot.exists():
        return {"palette": imaging.palette_from_image(shot, 8),
                "palette_source": "screenshot_pixels", "css_variables": css_vars}
    return {"palette": [], "palette_source": "none", "css_variables": css_vars}


def _dedupe(items: list[str]) -> list[str]:
    seen, out = set(), []
    for i in items:
        k = i.lower()
        if k not in seen:
            seen.add(k)
            out.append(k)
    return out


# Conventions that almost every framework honours but that never appear as a
# src/href in the markup. AdAnt found carouly's real logo this way, not from the DOM.
WELL_KNOWN = [
    ("logo.svg", "logo"), ("logo.png", "logo"), ("icon.svg", "icon"),
    ("icon.png", "icon"), ("favicon.svg", "icon"), ("apple-touch-icon.png", "icon"),
    ("opengraph-image.png", "product"), ("og-image.png", "product"), ("twitter-image.png", "product"),
]


def probe_well_known(page_url: str) -> list[dict]:
    """HEAD/GET the conventional asset paths. A 404 page can still be 15 KB, so trust status only."""
    origin = f"{urlparse(page_url).scheme}://{urlparse(page_url).netloc}"
    out = []
    with web._client() as c:
        for path, role in WELL_KNOWN:
            u = f"{origin}/{path}"
            try:
                r = c.get(u)
            except Exception:  # noqa: BLE001
                continue
            ctype = r.headers.get("content-type", "")
            if r.status_code == 200 and ("image" in ctype or "svg" in ctype):
                out.append({"url": u, "role_hint": role, "alt": f"well-known:{path}"})
    if out:
        TRACE.step(f"well-known probe found {len(out)}: {', '.join(Path(o['url']).name for o in out)}")
    return out


EXT_FOR_TYPE = {
    "image/svg+xml": ".svg", "image/png": ".png", "image/jpeg": ".jpg",
    "image/webp": ".webp", "image/gif": ".gif", "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico", "image/avif": ".avif",
}


def asset_filename(url: str, content_type: str, taken: set[str]) -> str:
    """A stable, collision-free, correctly-suffixed filename for a downloaded asset.

    Prefers the URL's own filename when it looks like one (bitter.jpg), and falls
    back to a URL hash for CDN paths whose last segment is a transform recipe
    rather than a name.
    """
    segments = [s for s in urlparse(url).path.split("/") if s]
    ext = EXT_FOR_TYPE.get((content_type or "").split(";")[0].strip().lower(), "")

    stem, url_ext = "", ""
    for seg in reversed(segments):
        candidate, dot, suffix = seg.rpartition(".")
        if dot and f".{suffix.lower()}" in EXT_FOR_TYPE.values():
            stem, url_ext = candidate, f".{suffix.lower()}"
            break
    if not stem:
        # No real filename in the path. CDN URLs end in a transform recipe
        # ("f=auto,fit=scale-down,metadata=none"), so skip any segment carrying
        # key=value pairs and take the last real identifier before it.
        def is_recipe(seg: str) -> bool:
            return "=" in seg or "," in seg

        meaningful = [s for s in segments if not is_recipe(s) and len(s) > 3]
        stem = (meaningful[-1] if meaningful else "asset")

    stem = re.sub(r"[^A-Za-z0-9._-]", "_", stem)[:48].strip("_-") or "asset"
    ext = ext or url_ext or ".bin"

    name = f"{stem}{ext}"
    if name in taken:
        name = f"{stem}-{hashlib.sha1(url.encode()).hexdigest()[:8]}{ext}"
    return name


def _dir_for(role: str) -> str:
    """Logos and icons share a folder, matching AdAnt's layout."""
    return "logo" if role in ("logo", "icon") else role


def reclassify_by_size(base: Path, rel: str, role: str) -> str:
    """A downloaded file tells the truth its URL did not: real pixels decide product vs incidental."""
    if role in ("logo", "icon"):
        return role
    p = base / rel
    if p.suffix.lower() == ".svg":
        return role
    try:
        from PIL import Image
        with Image.open(p) as im:
            w, h = im.size
    except Exception:  # noqa: BLE001
        return role
    if w >= 400 and h >= 400:
        return "product"
    if max(w, h) <= 64:
        return "icon"
    return role


def harvest_assets(rendered: dict, html: str, page_url: str, base: Path) -> dict:
    """Download logos, icons and product imagery into the kit, classified by role."""
    found = rendered.get("assets") or {}
    candidates: list[dict] = []

    for img in found.get("images", []):
        candidates.append({**img, "role_hint": web.classify_asset(img["url"], img)})
    for bg in found.get("backgrounds", []):
        candidates.append({**bg, "role_hint": web.classify_asset(bg["url"], bg)})
    for ic in found.get("icons", []):
        candidates.append({"url": ic["url"], "role_hint": "icon", "alt": ic.get("rel", "")})
    for k, v in (found.get("meta") or {}).items():
        if "image" in k and isinstance(v, str) and v.startswith("http"):
            candidates.append({"url": v, "role_hint": "product", "alt": k})

    # If the render broke there is no DOM — scrape asset URLs out of raw HTML instead.
    if not candidates and html:
        for m in re.findall(r'(?:src|href)="([^"]+\.(?:png|jpe?g|svg|webp|ico))"', html, re.I):
            u = urljoin(page_url, m)
            candidates.append({"url": u, "role_hint": web.classify_asset(u, {}), "alt": ""})
        TRACE.step(f"scraped {len(candidates)} asset urls from raw HTML")

    candidates += probe_well_known(page_url)

    out: dict[str, list] = {"logo": [], "icon": [], "product": [], "image": []}
    seen: set[str] = set()
    taken: set[str] = set()
    caps = {"logo": 4, "icon": 3, "product": 8, "image": 6}

    for c in candidates:
        u = c.get("url")
        if not u or u in seen or u.startswith("data:"):
            continue
        role = c.get("role_hint", "image")
        role = role if role in out else "image"
        if len(out[role]) >= caps[role]:
            continue
        seen.add(u)

        # Download to a URL-unique staging name first: CDN paths like
        # /imagedelivery/<id>/<uuid>/f_auto_fit_scale-down often share a last
        # segment, so naming from the URL up front silently overwrites assets.
        staging = f"assets/_incoming/{hashlib.sha1(u.encode()).hexdigest()[:16]}"
        try:
            info = web.download(u, base / staging)
        except Exception as e:  # noqa: BLE001
            TRACE.warn(f"  skip {u[:70]}: {e}")
            continue
        if info["bytes"] < 350:          # tracking pixels and empty responses
            (base / staging).unlink(missing_ok=True)
            continue

        name = asset_filename(u, info["content_type"], taken)
        taken.add(name)
        rel = f"assets/{_dir_for(role)}/{name}"
        (base / rel).parent.mkdir(parents=True, exist_ok=True)
        (base / staging).replace(base / rel)

        # The file on disk is more reliable than the URL guess.
        true_role = reclassify_by_size(base, rel, role)
        if true_role != role:
            new_rel = f"assets/{_dir_for(true_role)}/{name}"
            (base / new_rel).parent.mkdir(parents=True, exist_ok=True)
            (base / rel).replace(base / new_rel)
            rel, role = new_rel, true_role
        if len(out[role]) >= caps[role]:
            # Reclassified into a role that is already full. Delete rather than
            # leave an orphan on disk: it would be absent from brand.json but
            # still swept into the contact sheet.
            (base / rel).unlink(missing_ok=True)
            continue

        out[role].append({"file": rel, "source_url": u, "alt": c.get("alt", ""),
                          "bytes": info["bytes"], "kind": role})

    staging_dir = base / "assets" / "_incoming"
    if staging_dir.exists():
        for leftover in staging_dir.iterdir():
            leftover.unlink()
        staging_dir.rmdir()

    for role, items in out.items():
        if items:
            TRACE.step(f"  {role}: {len(items)} downloaded")
    return out
