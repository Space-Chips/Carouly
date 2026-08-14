"""Web capture tools.

Design note: AdAnt's reference run failed because the site 500'd under a headless
browser (Clerk middleware), and it recovered by fetching the prerendered HTML
directly. So every render path here has an HTTP fallback, and `capture_site`
treats a non-200 render as a signal to retry rather than as a fatal error.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from core import config
from core.tools import tool
from core.trace import TRACE

_STRIP_TAGS = ("script", "style", "noscript", "svg", "template")


def _client() -> httpx.Client:
    return httpx.Client(
        follow_redirects=True,
        timeout=30,
        headers={"User-Agent": config.HTTP_UA, "Accept-Language": "en-US,en;q=0.9"},
    )


def normalise_url(url: str) -> str:
    if not url.startswith(("http://", "https://")):
        url = "https://" + url.lstrip("/")
    return url


def slug_for(url: str) -> str:
    host = urlparse(normalise_url(url)).netloc.lower()
    host = re.sub(r"^www\.", "", host)
    return re.sub(r"[^a-z0-9]+", "-", host.split(".")[0]).strip("-") or "brand"


# ─────────────────────────── raw fetch ───────────────────────────


@tool
def http_get(url: str) -> str:
    """Fetch a URL over plain HTTP and return status, content-type and body text.

    Use this when a rendered page fails or looks like an error page — server-side
    rendered HTML often contains the real content even when the browser render breaks.

    Args:
        url: Absolute URL to fetch.
    """
    url = normalise_url(url)
    with _client() as c:
        r = c.get(url)
        body = r.text
    return json.dumps(
        {
            "status": r.status_code,
            "final_url": str(r.url),
            "content_type": r.headers.get("content-type", ""),
            "length": len(body),
            "body": body[:60000],
        }
    )


@tool
def page_text(url: str) -> str:
    """Fetch a URL and return only its readable text content, tags stripped.

    Cheaper than http_get when you just need the copy on the page.

    Args:
        url: Absolute URL to fetch.
    """
    url = normalise_url(url)
    with _client() as c:
        r = c.get(url)
    return html_to_text(r.text)[:40000]


def html_to_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(list(_STRIP_TAGS)):
        t.decompose()
    lines = [ln.strip() for ln in soup.get_text("\n").splitlines()]
    return "\n".join(ln for ln in lines if ln)


def html_to_markdown(html: str) -> str:
    """Very small HTML->markdown: headings, list items, links, paragraphs."""
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(list(_STRIP_TAGS)):
        t.decompose()
    out: list[str] = []
    for el in soup.find_all(["h1", "h2", "h3", "h4", "p", "li", "blockquote", "a"]):
        txt = " ".join(el.get_text(" ").split())
        if not txt or len(txt) < 2:
            continue
        name = el.name
        if name.startswith("h"):
            out.append(f"{'#' * int(name[1])} {txt}")
        elif name == "li":
            out.append(f"- {txt}")
        elif name == "blockquote":
            out.append(f"> {txt}")
        elif name == "a":
            href = el.get("href", "")
            if href and not href.startswith("#") and len(txt) > 2:
                out.append(f"[{txt}]({href})")
        else:
            out.append(txt)
    # de-dupe consecutive repeats (nav links repeated in header+footer)
    dedup: list[str] = []
    for line in out:
        if not dedup or dedup[-1] != line:
            dedup.append(line)
    return "\n\n".join(dedup)


# ─────────────────────────── rendered capture ───────────────────────────


def render(url: str, *, out_dir: Path, full_page: bool = True, width: int = 1440) -> dict:
    """Render with Playwright: screenshot, visible text, computed design tokens, asset URLs."""
    from playwright.sync_api import sync_playwright

    url = normalise_url(url)
    shots_dir = out_dir / "capture" / "screenshots"
    shots_dir.mkdir(parents=True, exist_ok=True)
    result: dict = {"source_url": url, "screenshots": [], "status": None}

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-blink-features=AutomationControlled"])
        page = browser.new_page(
            viewport={"width": width, "height": 900},
            user_agent=config.HTTP_UA,
            device_scale_factor=1,
        )
        try:
            resp = page.goto(url, wait_until="domcontentloaded", timeout=45000)
            result["status"] = resp.status if resp else None
            result["final_url"] = page.url
            try:
                page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass
            page.wait_for_timeout(1200)

            result["html"] = page.content()
            result["title"] = page.title()
            result["page_height"] = page.evaluate("document.body.scrollHeight")

            shot = shots_dir / "scroll-01.png"
            page.screenshot(path=str(shot), full_page=full_page)
            result["screenshots"].append(
                {"file": "capture/screenshots/scroll-01.png", "kind": "website-screenshot",
                 "role": "product-ui", "page_url": page.url, "scroll_y": 0}
            )

            result["design_tokens"] = page.evaluate(_TOKENS_JS)
            result["visible_text"] = page.evaluate(_VISIBLE_TEXT_JS)
            result["assets"] = page.evaluate(_ASSETS_JS)
        finally:
            browser.close()
    return result


_TOKENS_JS = """() => {
  const pick = el => { const s = getComputedStyle(el); return {
    fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight,
    lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, color: s.color }; };
  const typography = [];
  for (const sel of ['body','h1','h2','h3','p','a','button']) {
    const el = document.querySelector(sel);
    if (el) typography.push({ selector: sel, ...pick(el) });
  }
  // Count colours by painted area so brand colours outrank one-off text colours.
  const weight = new Map();
  const bump = (c, w) => { if (!c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent') return;
    weight.set(c, (weight.get(c) || 0) + w); };
  for (const el of Array.from(document.querySelectorAll('*')).slice(0, 3000)) {
    const r = el.getBoundingClientRect(); const area = Math.max(r.width * r.height, 1);
    const s = getComputedStyle(el);
    bump(s.backgroundColor, area);
    bump(s.color, Math.min(area, 20000));
    bump(s.borderTopColor, area * 0.05);
  }
  const colors = [...weight.entries()].sort((a,b) => b[1]-a[1]).slice(0,16).map(e => e[0]);
  // CSS custom properties are the highest-signal palette source when present.
  const vars = {};
  for (const sheet of document.styleSheets) {
    try { for (const rule of sheet.cssRules) {
      if (rule.selectorText === ':root' || rule.selectorText === 'html') {
        for (const n of rule.style) if (n.startsWith('--')) vars[n] = rule.style.getPropertyValue(n).trim();
      }
    } } catch (e) {}
  }
  const fonts = [...new Set(typography.map(t => t.fontFamily))];
  return { typography, colors, css_variables: vars, fonts };
}"""

_VISIBLE_TEXT_JS = """() => {
  const out = [];
  const sels = 'h1,h2,h3,h4,p,li,blockquote,button,a,span[class*=tag],figcaption';
  for (const el of document.querySelectorAll(sels)) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const text = (el.innerText || '').trim().replace(/\\s+/g, ' ');
    if (!text || text.length > 600) continue;
    out.push({ tag: el.tagName.toLowerCase(), text, href: el.getAttribute('href') || '' });
    if (out.length > 400) break;
  }
  return out;
}"""

_ASSETS_JS = """() => {
  const abs = u => { try { return new URL(u, location.href).href; } catch (e) { return null; } };
  const images = [];
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith('data:')) continue;
    images.push({ url: abs(src), alt: img.alt || '', w: Math.round(r.width), h: Math.round(r.height),
                  natural_w: img.naturalWidth, natural_h: img.naturalHeight,
                  cls: (img.className || '').toString().slice(0,120) });
  }
  const bg = [];
  for (const el of Array.from(document.querySelectorAll('*')).slice(0, 2500)) {
    const m = getComputedStyle(el).backgroundImage.match(/url\\(["']?(.*?)["']?\\)/);
    if (m && !m[1].startsWith('data:')) bg.push({ url: abs(m[1]), role: 'background' });
  }
  const meta = {};
  for (const m of document.querySelectorAll('meta[property],meta[name]')) {
    const k = m.getAttribute('property') || m.getAttribute('name');
    if (/og:|twitter:|description|theme-color/.test(k)) meta[k] = m.content;
  }
  const icons = [];
  for (const l of document.querySelectorAll('link[rel*=icon],link[rel=apple-touch-icon]'))
    icons.push({ url: abs(l.href), rel: l.rel, sizes: l.getAttribute('sizes') || '' });
  const styles = [];
  for (const l of document.querySelectorAll('link[rel=stylesheet]')) styles.push(abs(l.href));
  const videos = [];
  for (const v of document.querySelectorAll('video source, video')) {
    const s = v.src || v.getAttribute('src'); if (s && !s.startsWith('data:')) videos.push(abs(s));
  }
  const links = [...new Set([...document.querySelectorAll('a[href]')]
    .map(a => abs(a.href)).filter(u => u && u.startsWith(location.origin)))].slice(0, 120);
  return { images, backgrounds: bg, meta, icons, stylesheets: styles, videos, links };
}"""


# ─────────────────────────── assets ───────────────────────────


def download(url: str, dest: Path) -> dict:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with _client() as c:
        r = c.get(url)
        r.raise_for_status()
        dest.write_bytes(r.content)
    return {"file": str(dest), "bytes": len(r.content), "content_type": r.headers.get("content-type", "")}


@tool
def download_asset(url: str, brand_slug: str, rel_path: str) -> str:
    """Download an image/svg/font from the live site into the brand kit folder.

    Args:
        url: Absolute URL of the asset.
        brand_slug: Brand folder name, e.g. "carouly".
        rel_path: Path inside the kit, e.g. "assets/logo/logo_primary.svg".
    """
    dest = config.brand_dir(brand_slug) / rel_path
    info = download(normalise_url(url), dest)
    return json.dumps({"saved": rel_path, "bytes": info["bytes"], "content_type": info["content_type"]})


HEX_RE = re.compile(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b")


def palette_from_css(css: str, limit: int = 12) -> list[str]:
    """Rank hex colours in a stylesheet by frequency, ignoring pure greys."""
    counts: dict[str, int] = {}
    for m in HEX_RE.findall(css):
        h = m.lower()
        if len(h) == 4:
            h = "#" + "".join(c * 2 for c in h[1:])
        counts[h] = counts.get(h, 0) + 1
    def interest(h: str) -> tuple:
        r, g, b = (int(h[i : i + 2], 16) for i in (1, 3, 5))
        saturation = max(r, g, b) - min(r, g, b)
        return (saturation > 18, counts[h])
    return [h for h in sorted(counts, key=interest, reverse=True)][:limit]


def rgb_to_hex(rgb: str) -> str | None:
    m = re.match(r"rgba?\((\d+),\s*(\d+),\s*(\d+)", rgb or "")
    if not m:
        return None
    return "#%02x%02x%02x" % tuple(int(m.group(i)) for i in (1, 2, 3))


def classify_asset(url: str, meta: dict) -> str:
    """logo | icon | product | background | image — from URL and DOM hints."""
    u = url.lower()
    cls = (meta.get("cls") or "").lower()
    alt = (meta.get("alt") or "").lower()
    blob = f"{u} {cls} {alt}"
    if any(k in blob for k in ("logo", "wordmark", "brandmark")):
        return "logo"
    if any(k in u for k in ("favicon", "icon", "apple-touch")):
        return "icon"
    if meta.get("role") == "background":
        return "background"
    if any(k in blob for k in ("screenshot", "product", "app", "ui", "slide", "preset", "demo")):
        return "product"
    if (meta.get("natural_w") or 0) >= 400:
        return "product"
    return "image"
