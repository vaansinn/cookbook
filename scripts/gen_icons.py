"""One-off script: generates the PWA icon PNGs into frontend/public/icons/.
Run locally with Pillow installed (not a runtime/production dependency —
these are static assets checked into git once, not regenerated on deploy).
"""

from PIL import Image, ImageDraw
import math
import os

BRAND = (178, 74, 42)  # #B24A2A — matches --brand in index.css
WHITE = (255, 251, 243)  # matches --bg cream, warmer than pure white

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "public", "icons")
os.makedirs(OUT_DIR, exist_ok=True)


def rounded_square(size, radius_ratio=0.22):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=BRAND + (255,))
    return img, d


def draw_bowl_glyph(d, size, scale=1.0):
    r = size * 0.30 * scale
    rim_y = size * 0.60  # the bowl's flat top / rim sits here
    # bowl: bottom half of a circle inscribed in [rim_y - r, rim_y + r]
    cx = size / 2
    d.pieslice([cx - r, rim_y - r, cx + r, rim_y + r], start=0, end=180, fill=WHITE + (255,))
    # thin rim highlight right along the flat top edge
    d.ellipse([cx - r, rim_y - r * 0.06, cx + r, rim_y + r * 0.06], fill=WHITE + (255,))
    # steam wisps rising directly from the rim
    for dx in (-r * 0.5, 0, r * 0.5):
        x = cx + dx
        bottom = rim_y - r * 0.15
        pts = []
        for t in range(0, 11):
            frac = t / 10
            y = bottom - frac * r * 1.1
            x_off = math.sin(frac * math.pi * 2) * r * 0.16
            pts.append((x + x_off, y))
        d.line(pts, fill=WHITE + (235,), width=max(2, int(size * 0.032)), joint="curve")


def make_icon(size, maskable=False, filename=None):
    img, d = rounded_square(size, radius_ratio=0.0 if maskable else 0.22)
    if maskable:
        # Maskable icons need ~10% safe-zone padding on every side (the OS may
        # crop to a circle/squircle) — the fill already covers edge-to-edge,
        # so just draw the glyph smaller and centred.
        draw_bowl_glyph(d, size, scale=0.62)
    else:
        draw_bowl_glyph(d, size, scale=1.0)
    img.save(os.path.join(OUT_DIR, filename or f"icon-{size}.png"))


make_icon(192, filename="icon-192.png")
make_icon(512, filename="icon-512.png")
make_icon(512, maskable=True, filename="icon-512-maskable.png")
make_icon(32, filename="favicon-32.png")
print("Wrote icons to", OUT_DIR)
