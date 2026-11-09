#!/usr/bin/env python3
"""The disk image's window: Pebble paper, Ducter's little island under its
icon, a soft clay arrow to Applications, one plain line (D75: this is a
build input; scripts/make-app.sh lays the window out round it).

    python3 tools/art/dmg_background.py scripts/macos/dmg

Writes background.png (640×400, the window's content at 1×) and
background@2x.png. make-app.sh joins them into one TIFF for Finder.
The layout constants here and in scripts/macos/dmg-layout.ts must agree:
the app icon centered at (160, 196), Applications at (480, 196), 128 pt icons.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from eyes import _gauss  # noqa: E402

W, H = 640, 400
APP, APPS = (160, 196), (480, 196)
PAPER = np.array([0xFF, 0xF6, 0xEA]) / 255
DEEP = np.array([0xFC, 0xEC, 0xD7]) / 255
CLAY = np.array([0xF2, 0x8A, 0x45]) / 255  # the brand's clay orange, a little deeper than Accent
INK_MUTED = (0x75, 0x65, 0x4F)


def paper(s):
    """The paper, a touch deeper toward the edges (light falls in the middle)."""
    h, w = H * s, W * s
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((xx - w / 2) / (w * 0.75)) ** 2 + ((yy - h * 0.45) / (h * 0.85)) ** 2)
    t = np.clip(d, 0, 1)[..., None] ** 2
    return PAPER * (1 - t) + DEEP * t


def arrow_mask(s, ss=3):
    """The arrow's shape: a thick stroke along a gentle upward arc and a
    rounded head, drawn supersampled."""
    k = s * ss
    im = Image.new("L", (W * k, H * k), 0)
    d = ImageDraw.Draw(im)
    x0, x1, y = 238, 384, APP[1]
    lift = 16
    pts = []
    for t in np.linspace(0, 1, 64):
        x = x0 + (x1 - x0) * t
        pts.append((x * k, (y - lift * 4 * t * (1 - t)) * k))
    width = 15 * k
    d.line(pts, fill=255, width=int(width), joint="curve")
    r = width / 2
    d.ellipse((pts[0][0] - r, pts[0][1] - r, pts[0][0] + r, pts[0][1] + r), fill=255)
    # The head: a soft triangle at the end, pointing along the arc.
    (ax, ay), (bx, by) = pts[-4], pts[-1]
    ang = np.arctan2(by - ay, bx - ax)
    tip = (bx + np.cos(ang) * 30 * k, by + np.sin(ang) * 30 * k)
    back = (bx - np.cos(ang) * 4 * k, by - np.sin(ang) * 4 * k)
    nx, ny = -np.sin(ang), np.cos(ang)
    half = 23 * k
    head = [tip, (back[0] + nx * half, back[1] + ny * half), (back[0] - nx * half, back[1] - ny * half)]
    d.polygon(head, fill=255)
    # Round the head's corners: close it with a blur and a threshold.
    im = im.filter(ImageFilter.GaussianBlur(4 * k)).point(lambda v: 255 if v > 128 else 0)
    im = im.resize((W * s, H * s), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255


def clay_shade(mask, s, color):
    """Lit clay from a flat shape: a rounded height field from the mask, lit
    from the upper left, with a soft highlight and a little grain."""
    h = _gauss(mask[..., None], 3.2 * s)[..., 0]
    h = np.sqrt(np.clip(h, 0, 1)) * 9 * s
    gy, gx = np.gradient(h)
    n = np.dstack([-gx, -gy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    light = np.array([-0.45, -0.6, 0.66])
    light /= np.linalg.norm(light)
    diff = np.clip((n * light).sum(axis=2), 0, 1)
    half = (light + np.array([0, 0, 1])) / np.linalg.norm(light + np.array([0, 0, 1]))
    spec = np.clip((n * half).sum(axis=2), 0, 1) ** 28
    rng = np.random.default_rng(7)
    grain = _gauss(rng.standard_normal((mask.shape[0], mask.shape[1], 1)).astype(np.float32), 0.8 * s)[..., 0] * 0.012
    shade = 0.62 + 0.45 * diff
    rgb = np.clip(color * shade[..., None] + 0.22 * spec[..., None] + grain[..., None], 0, 1)
    return rgb


def over(base, rgb, alpha):
    a = alpha[..., None]
    return base * (1 - a) + rgb * a


def shadow(base, mask, s, dx, dy, blur, strength, tint=(0.45, 0.30, 0.18)):
    sh = np.roll(np.roll(mask, int(dy * s), axis=0), int(dx * s), axis=1)
    sh = _gauss(sh[..., None], blur * s)[..., 0] * strength
    return over(base, np.array(tint), sh)


def render(s):
    img = paper(s)
    # The island under Ducter's icon: it lives there until it moves in.
    isl = Image.open(ROOT / "apps/desktop/internal/theme/art/clay/island_small@1280.png").convert("RGBA")
    iw = int(196 * s)
    ih = round(isl.height * iw / isl.width)
    isl = isl.resize((iw, ih), Image.LANCZOS)
    ia = np.asarray(isl).astype(np.float32) / 255
    ix, iy = int(APP[0] * s - iw / 2), int((APP[1] + 26) * s)
    # Its soft contact shadow on the paper, then the island.
    m = np.zeros((H * s, W * s), np.float32)
    m[iy:iy + ih, ix:ix + iw] = ia[..., 3]
    img = shadow(img, m, s, 0, 10, 10, 0.20)
    region = img[iy:iy + ih, ix:ix + iw]
    img[iy:iy + ih, ix:ix + iw] = over(region, ia[..., :3], ia[..., 3])
    # Under Applications, only a faint resting shadow, where the icon will land.
    rest = np.zeros((H * s, W * s), np.float32)
    yy, xx = np.mgrid[0:H * s, 0:W * s].astype(np.float32)
    rest = np.clip(1 - (((xx - APPS[0] * s) / (62 * s)) ** 2 + ((yy - (APPS[1] + 60) * s) / (9 * s)) ** 2), 0, 1)
    img = over(img, np.array([0.55, 0.42, 0.30]), _gauss(rest[..., None], 4 * s)[..., 0] * 0.22)
    # The clay arrow, with its shadow.
    am = arrow_mask(s)
    img = shadow(img, am, s, 2, 6, 6, 0.28)
    img = over(img, clay_shade(am, s, CLAY), am)
    out = Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")
    # One plain line, both languages: the disk image is the same for everyone.
    # Han characters in Resource Han Rounded, the rest in Bricolage.
    d = ImageDraw.Draw(out)
    fonts = ROOT / "apps/desktop/internal/theme/fonts"
    han = ImageFont.truetype(str(fonts / "ResourceHanRoundedCN-Bold.ttf"), 13 * s)
    latin = ImageFont.truetype(str(fonts / "BricolageGrotesque.ttf"), 13 * s)
    latin.set_variation_by_axes([14, 600, 100])  # optical size, weight, width
    text = "拖进 Applications 就装好了  ·  Drag Ducter into Applications"
    runs, cur, kind = [], "", None
    for ch in text:
        k = ord(ch) > 0x2E80
        if kind is not None and k != kind:
            runs.append((cur, kind))
            cur = ""
        cur, kind = cur + ch, k
    runs.append((cur, kind))
    total = sum(d.textlength(t, font=han if k else latin) for t, k in runs)
    x, y = (W * s - total) / 2, (H - 30) * s
    for t, k in runs:
        f = han if k else latin
        d.text((x, y), t, font=f, fill=INK_MUTED, anchor="ls")
        x += d.textlength(t, font=f)
    return out


def main(out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    render(1).save(out / "background.png", optimize=True)
    render(2).save(out / "background@2x.png", optimize=True)
    for n in ("background.png", "background@2x.png"):
        print(n, (out / n).stat().st_size, "bytes")


if __name__ == "__main__":
    main(sys.argv[1])
