#!/usr/bin/env python3
"""The AI agents' clay coins: one per agent, each carrying its maker's mark (design/art/LOGOS.md).

Every coin is the same clay render (design/art/assets/alpha/token_orange.png, the plain puffy
token) re-coloured into the agent's colour family, so all coins share one shape, one light and
one grain. On the dome sits the print, applied flat like a pad-printed decal:

- an official logo, where its owner's terms allow it, rasterised from the owner's own SVG
  (design/art/logos/) by scaling only: no recolouring, no effects, no lighting on top, its
  own clear space kept and more round it;
- otherwise the product's name, set plainly in Bricolage Grotesque (the app's own face),
  which is a reference to the product, not a mark that imitates its logo.

Each agent gets three files:

    coin_<id>        the coin with its print (shown at 36pt and up)
    coin_<id>_plain  the body alone, for 20-28pt where a print would only be a smudge;
                     the agent's name is always the text beside it
    coin_<id>_off    signed out or not installed: the body in one grey clay, the print unchanged,
                     then a separate dimming layer laid over the whole coin (the print itself
                     is never faded or recoloured)

and one shared layer, coin_sheen: a soft highlight on the rim only (it never crosses the
dome where the print sits), which the apps turn slowly round the coin while that agent is
working (D77: clay may move, status and words never).

    python3 tools/art/coins.py            # writes the desktop @256 PNGs and the web WebPs

Desktop: apps/desktop/internal/theme/art/clay/<name>@256.png (theme.Clay)
Web:     apps/web/static/art/<name>.webp at 128 px (served by packages/core/src/web.ts)
Site:    apps/site/scripts/art.mjs encodes from the desktop PNGs.
"""

import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[2]
BASE = REPO / "design/art/assets/alpha/token_orange.png"
FONT = REPO / "apps/desktop/internal/theme/fonts/BricolageGrotesque.ttf"
LOGOS = REPO / "design/art/logos"
DESK = REPO / "apps/desktop/internal/theme/art/clay"
WEB = REPO / "apps/web/static/art"

W = 1024  # working size; the dome is measured on the render (crease at 0.565 of the radius)
DOME = 0.565

# id: (body colour, contrast k, print). print: ("logo", svg, width as a fraction of the dome's
# diameter), ("name", lines, ink) or None (the body alone). k scales the clay's light and shade around the new colour.
COINS = {
    # Anthropic's trademark guidelines allow its marks only with prior approval: the name.
    "claude_code": ("#D97757", 1.0, ("name", ["Claude", "Code"], "#2A1A12")),
    # OpenAI publishes no Codex logo file, and its brand page could not be read: the name.
    "codex": ("#262626", 1.15, ("name", ["Codex"], "#F7F5F2")),
    # pi's press kit offers its vector logo for editorial placements: the logo.
    "pi": ("#EFE8DC", 0.75, ("logo", "pi.svg", 0.92)),
    # DeepSeek's terms forbid its marks and logo without permission: the name.
    "deepseek_harness": ("#4D6BFE", 0.95, ("name", ["DeepSeek", "Harness"], "#FFFFFF")),
}


# Every unavailable coin is the same grey clay: only the print tells them apart.
OFF = "#B3ADA5"


# --- colour -------------------------------------------------------------------------------

def _lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _gam(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


_M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
_WHITE = np.array([0.95047, 1.0, 1.08883])


def to_lab(rgb):
    xyz = _lin(rgb) @ _M.T / _WHITE
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def from_lab(lab):
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200
    f = np.stack([fx, fy, fz], -1)
    xyz = np.where(f ** 3 > 216 / 24389, f ** 3, (116 * f - 16) / (24389 / 27)) * _WHITE
    return _gam(xyz @ np.linalg.inv(_M).T)


def hexrgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


# --- the body -----------------------------------------------------------------------------

def base():
    """The plain token, trimmed to its alpha and squared, at W px (premultiplied resize)."""
    im = Image.open(BASE).convert("RGBA")
    l, t, r, b = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    side = max(r - l, b - t)
    cx, cy = (l + r) / 2, (t + b) / 2
    box = tuple(int(round(v)) for v in (cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2))
    sq = im.crop(box)
    return sq.convert("RGBa").resize((W, W), Image.LANCZOS).convert("RGBA")


def recolour(im, colour, k):
    """The same clay in another colour: each pixel keeps its offset from the token's own body
    colour in lightness (scaled by k), and the hue moves to the target's."""
    a = np.asarray(im).astype(np.float64) / 255
    rgb, alpha = a[..., :3], a[..., 3:]
    lab = to_lab(rgb)
    solid = alpha[..., 0] > 0.98
    ref = np.median(lab[solid], axis=0)
    tgt = to_lab(hexrgb(colour)[None, None, :])[0, 0]
    out = np.empty_like(lab)
    dl = lab[..., 0] - ref[0]
    # Light lifts a dark body less than shade darkens a light one: compress toward the ends.
    out[..., 0] = np.clip(tgt[0] + k * dl, 2, 99)
    chroma = np.hypot(lab[..., 1], lab[..., 2])
    rchroma = np.hypot(ref[1], ref[2])
    sat = np.clip(chroma / rchroma, 0, 1.4)
    out[..., 1] = tgt[1] * sat
    out[..., 2] = tgt[2] * sat
    res = np.concatenate([from_lab(out), alpha], -1)
    return Image.fromarray((np.clip(res, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


# --- the print ----------------------------------------------------------------------------

def dome_box():
    r = W / 2 * DOME
    return W / 2, W / 2 + W * 0.004, r  # the dome sits a hair below centre in the render


def logo_layer(svg, frac):
    """The owner's SVG rasterised at a size, nothing else: scale and position only."""
    cx, cy, r = dome_box()
    side = int(round(2 * r * frac))
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / "logo.png"
        subprocess.run(["rsvg-convert", "-w", str(side), "-h", str(side), "-o", str(png), str(LOGOS / svg)], check=True)
        logo = Image.open(png).convert("RGBA")
    layer = Image.new("RGBA", (W, W))
    layer.alpha_composite(logo, (int(round(cx - side / 2)), int(round(cy - side / 2))))
    return layer


def name_layer(lines, ink):
    """The product's name, plainly, centred on the dome with clear space."""
    cx, cy, r = dome_box()
    usable = 2 * r * 0.70  # clear space: the text stays inside 70% of the dome
    font = ImageFont.truetype(str(FONT), 100)
    font.set_variation_by_axes([96, 800, 100])
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    widest = max(probe.textlength(s, font=font) for s in lines)
    size = 100 * usable / widest
    cap = 100 * (usable / len(lines)) / 112  # never taller than the dome allows
    size = min(size, cap, 2 * r * 0.30 * 100 / 72)
    font = ImageFont.truetype(str(FONT), int(round(size)))
    font.set_variation_by_axes([96, 800, 100])
    asc, desc = font.getmetrics()
    lh = size * 1.02
    layer = Image.new("RGBA", (W, W))
    d = ImageDraw.Draw(layer)
    top = cy - lh * len(lines) / 2
    for i, s in enumerate(lines):
        y = top + lh * i + lh / 2
        d.text((cx, y), s, font=font, fill=ink, anchor="mm")
    return layer


def dimmer(im):
    """The separate layer that dims an unavailable coin: a pale veil over the whole coin."""
    alpha = np.asarray(im.getchannel("A"))
    veil = np.zeros((W, W, 4), np.uint8)
    veil[..., :3] = (232, 228, 222)
    veil[..., 3] = (alpha.astype(np.float64) * 0.38).astype(np.uint8)
    return Image.fromarray(veil, "RGBA")


def sheen():
    """A soft highlight on the rim only, as a layer: an arc of light between the dome's crease
    and the coin's edge, brightest at the top left, to be turned round the coin."""
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float64) + 0.5
    cx, cy, rd = dome_box()
    dx, dy = xx - W / 2, yy - W / 2
    rr = np.hypot(dx, dy) / (W / 2)
    ang = np.arctan2(dy, dx)
    inner, outer = DOME + 0.07, 0.93
    mid, half = (inner + outer) / 2, (outer - inner) / 2
    band = np.clip(1 - ((rr - mid) / half) ** 2, 0, 1) ** 1.6
    centre = -3 * np.pi / 4
    da = np.angle(np.exp(1j * (ang - centre)))
    arc = np.exp(-(da / 0.42) ** 2)
    a = band * arc * 0.55
    out = np.zeros((W, W, 4), np.uint8)
    out[..., :3] = 255
    out[..., 3] = (np.clip(a, 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


# --- output -------------------------------------------------------------------------------

def save(name, im):
    a = im.convert("RGBa")
    a.resize((256, 256), Image.LANCZOS).convert("RGBA").save(DESK / f"{name}@256.png", optimize=True)
    a.resize((128, 128), Image.LANCZOS).convert("RGBA").save(
        WEB / f"{name}.webp", quality=88, alpha_quality=100, method=6, exact=True)


def build(only=None):
    tok = base()
    for cid, (colour, k, pr) in COINS.items():
        if only and cid not in only:
            continue
        body = recolour(tok, colour, k)
        if pr is None:  # no print at all: the body alone
            print_ = Image.new("RGBA", (W, W))
        elif pr[0] == "logo":
            print_ = logo_layer(pr[1], pr[2])
        else:
            print_ = name_layer(pr[1], pr[2])
        coin = body.copy()
        coin.alpha_composite(print_)
        off = recolour(tok, OFF, 0.8)
        off.alpha_composite(print_)
        off.alpha_composite(dimmer(off))
        save(f"coin_{cid}", coin)
        save(f"coin_{cid}_plain", body)
        save(f"coin_{cid}_off", off)
    save("coin_sheen", sheen())


if __name__ == "__main__":
    build(sys.argv[1:] or None)
