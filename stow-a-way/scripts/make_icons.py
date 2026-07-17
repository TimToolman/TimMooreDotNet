#!/usr/bin/env python3
"""Generate Stow-a-way app icons and splash from scratch (no external assets).

Produces:
  assets/icon.png            1024x1024  iOS / general app icon (full bleed)
  assets/adaptive-icon.png   1024x1024  Android foreground (art kept in safe area)
  assets/splash-icon.png     1024x1024  splash logo on transparent bg
  assets/favicon.png         48x48      web favicon
  assets/notification-icon.png 96x96    Android notification (white on transparent)

The mark is a stacked storage bin with a magnifier — "find what's in the box".
"""
import math
from PIL import Image, ImageDraw

BLUE = (0, 113, 227)          # apple system blue (accent used across the web app)
BLUE_DARK = (0, 86, 179)
WHITE = (255, 255, 255)
INK = (29, 29, 31)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vertical_gradient(size, top, bottom):
    img = Image.new("RGB", (size, size), top)
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        c = lerp(top, bottom, t)
        for x in range(size):
            px[x, y] = c
    return img


def rounded_rect_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def draw_mark(draw, cx, cy, scale, bin_color=WHITE, line=BLUE):
    """Draw a storage bin with a lid + a small magnifier, centered at cx,cy."""
    w = int(360 * scale)
    h = int(250 * scale)
    lid_h = int(70 * scale)
    x0 = cx - w // 2
    y0 = cy - h // 2
    x1 = cx + w // 2
    y1 = cy + h // 2

    r = int(26 * scale)
    # bin body
    draw.rounded_rectangle([x0, y0 + lid_h, x1, y1], radius=r, fill=bin_color)
    # lid (slightly wider)
    over = int(24 * scale)
    draw.rounded_rectangle(
        [x0 - over, y0, x1 + over, y0 + lid_h],
        radius=int(18 * scale), fill=bin_color,
    )
    # handle notch on the lid
    hw = int(90 * scale)
    hh = int(20 * scale)
    draw.rounded_rectangle(
        [cx - hw // 2, y0 + lid_h // 2 - hh // 2, cx + hw // 2, y0 + lid_h // 2 + hh // 2],
        radius=hh // 2, fill=line,
    )
    # two ribs on the body to read as a crate
    rib_y_top = y0 + lid_h + int(40 * scale)
    for i in range(2):
        ry = rib_y_top + i * int(70 * scale)
        draw.rounded_rectangle(
            [x0 + int(40 * scale), ry, x1 - int(40 * scale), ry + int(16 * scale)],
            radius=int(8 * scale), fill=line,
        )

    # magnifier, bottom-right, overlapping the bin
    mr = int(74 * scale)
    mcx = x1 - int(6 * scale)
    mcy = y1 - int(2 * scale)
    ring = int(22 * scale)
    draw.ellipse([mcx - mr, mcy - mr, mcx + mr, mcy + mr], fill=line)
    inner = mr - ring
    draw.ellipse([mcx - inner, mcy - inner, mcx + inner, mcy + inner], fill=bin_color)
    # handle
    hl = int(70 * scale)
    hx = mcx + int(mr * 0.7)
    hy = mcy + int(mr * 0.7)
    draw.line([hx, hy, hx + hl, hy + hl], fill=line, width=int(30 * scale))


def make_icon(path, size=1024, bleed=True):
    ss = 4  # supersample
    S = size * ss
    bg = vertical_gradient(S, lerp(BLUE, WHITE, 0.06), BLUE_DARK)
    draw = ImageDraw.Draw(bg)
    draw_mark(draw, S // 2, S // 2, ss * (0.92 if bleed else 0.72))
    bg = bg.resize((size, size), Image.LANCZOS)
    if not bleed:
        # keep as full square (Android applies its own mask)
        pass
    bg.save(path)


def make_splash(path, size=1024):
    ss = 4
    S = size * ss
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # blue rounded plate behind the mark
    plate = int(560 * ss)
    px0 = (S - plate) // 2
    draw.rounded_rectangle(
        [px0, px0, px0 + plate, px0 + plate],
        radius=int(130 * ss), fill=BLUE,
    )
    draw_mark(draw, S // 2, S // 2, ss * 0.52)
    img = img.resize((size, size), Image.LANCZOS)
    img.save(path)


def make_favicon(path, size=48):
    make_icon(path, size=size, bleed=True)


def make_notification_icon(path, size=96):
    ss = 4
    S = size * ss
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # white silhouette on transparent (Android tints it)
    draw_mark(draw, S // 2, S // 2, ss * 0.62, bin_color=WHITE, line=(0, 0, 0, 0))
    img = img.resize((size, size), Image.LANCZOS)
    img.save(path)


if __name__ == "__main__":
    import os
    out = os.path.join(os.path.dirname(__file__), "..", "assets")
    os.makedirs(out, exist_ok=True)
    make_icon(os.path.join(out, "icon.png"), 1024, bleed=True)
    make_icon(os.path.join(out, "adaptive-icon.png"), 1024, bleed=False)
    make_splash(os.path.join(out, "splash-icon.png"), 1024)
    make_favicon(os.path.join(out, "favicon.png"), 48)
    make_notification_icon(os.path.join(out, "notification-icon.png"), 96)
    print("icons written to", os.path.abspath(out))
