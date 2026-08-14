"""Image utilities: contact sheet, palette extraction from real pixels, asset probing."""
from __future__ import annotations

import base64
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw

from core import config
from core.tools import tool

RASTER = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}


def _open(path: Path) -> Image.Image | None:
    try:
        if path.suffix.lower() == ".svg":
            return None
        im = Image.open(path)
        im.load()
        return im.convert("RGB")
    except Exception:
        return None


def contact_sheet(brand_slug: str, out_rel: str = "assets/contact_sheet.png",
                  cols: int = 4, cell: int = 320) -> dict:
    """Tile every downloaded raster asset into one labelled sheet for visual QA."""
    base = config.brand_dir(brand_slug)
    files = [p for p in sorted((base / "assets").rglob("*")) if p.suffix.lower() in RASTER]
    files = [p for p in files if "contact_sheet" not in p.name]
    if not files:
        return {"error": "no raster assets found"}

    rows = (len(files) + cols - 1) // cols
    label_h = 26
    sheet = Image.new("RGB", (cols * cell, rows * (cell + label_h)), (24, 24, 24))
    draw = ImageDraw.Draw(sheet)

    for i, f in enumerate(files):
        im = _open(f)
        if im is None:
            continue
        im.thumbnail((cell - 12, cell - 12))
        x = (i % cols) * cell + (cell - im.width) // 2
        y = (i // cols) * (cell + label_h) + (cell - im.height) // 2
        sheet.paste(im, (x, y))
        draw.text(
            ((i % cols) * cell + 6, (i // cols) * (cell + label_h) + cell + 6),
            str(f.relative_to(base))[:44], fill=(200, 200, 200),
        )

    out = base / out_rel
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    return {"file": out_rel, "tiles": len(files), "size": list(sheet.size)}


def palette_from_image(path: Path, n: int = 8) -> list[str]:
    """Dominant colours from actual pixels — ground truth when CSS parsing is unreliable."""
    im = _open(path)
    if im is None:
        return []
    im.thumbnail((200, 200))
    quant = im.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
    pal = quant.getpalette() or []
    counts = sorted(quant.getcolors() or [], reverse=True)
    out = []
    for _, idx in counts[:n]:
        r, g, b = pal[idx * 3 : idx * 3 + 3]
        out.append("#%02x%02x%02x" % (r, g, b))
    return out


def as_data_url(path: Path, max_side: int = 1024) -> str:
    """Downscaled data URL, for handing a screenshot to a vision model."""
    im = _open(path)
    if im is None:
        return ""
    im.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Helvetica.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "C:\\Windows\\Fonts\\arialbd.ttf",
]


def _font(size: int):
    from PIL import ImageFont
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:  # noqa: BLE001
                continue
    return ImageFont.load_default()


def caption_png(text: str, video_w: int, out_path: Path, *, margin_ratio: float = 0.08) -> dict:
    """Render one caption as a transparent PNG sized to the video's width.

    Pillow draws the text rather than ffmpeg, because ffmpeg builds routinely
    ship without libass *and* without libfreetype — this build has neither, so
    `subtitles` and `drawtext` are both unavailable. Compositing a PNG with the
    `overlay` filter needs no optional ffmpeg libraries at all.
    """
    from PIL import Image, ImageDraw

    text = " ".join((text or "").split())
    font_size = max(20, int(video_w * 0.062))
    font = _font(font_size)
    margin = int(video_w * margin_ratio)
    max_w = video_w - 2 * margin

    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))

    def width_of(s: str) -> int:
        box = probe.textbbox((0, 0), s, font=font, stroke_width=3)
        return box[2] - box[0]

    lines, current = [], ""
    for word in text.split():
        trial = f"{current} {word}".strip()
        if width_of(trial) <= max_w or not current:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)

    line_h = int(font_size * 1.32)
    height = line_h * len(lines) + int(font_size * 0.5)
    img = Image.new("RGBA", (video_w, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    for i, line in enumerate(lines):
        w = width_of(line)
        draw.text(
            ((video_w - w) // 2, int(font_size * 0.25) + i * line_h),
            line, font=font, fill=(255, 255, 255, 255),
            stroke_width=max(2, font_size // 12), stroke_fill=(0, 0, 0, 235),
        )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    return {"file": str(out_path), "height": height, "lines": len(lines)}


@tool
def inspect_image(brand_slug: str, rel_path: str) -> str:
    """Report an image's real dimensions, format and dominant colours.

    Use to check a downloaded asset is a real logo/photo and not a 1x1 tracking pixel.

    Args:
        brand_slug: Brand folder name.
        rel_path: Path inside the kit, e.g. "assets/logo/logo_primary.svg".
    """
    p = config.brand_dir(brand_slug) / rel_path
    if not p.exists():
        return f"ERROR: {rel_path} not found"
    if p.suffix.lower() == ".svg":
        text = p.read_text(errors="replace")
        import re
        return json.dumps({
            "format": "svg", "bytes": p.stat().st_size,
            "colors": sorted(set(re.findall(r"#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})", text)))[:12],
            "viewBox": (re.search(r'viewBox="([^"]+)"', text) or [None, ""])[1],
        })
    im = _open(p)
    if im is None:
        return json.dumps({"error": "unreadable", "bytes": p.stat().st_size})
    return json.dumps({
        "format": p.suffix.lstrip("."), "width": im.width, "height": im.height,
        "bytes": p.stat().st_size, "dominant_colors": palette_from_image(p, 6),
    })
