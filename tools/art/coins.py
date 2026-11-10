#!/usr/bin/env python3
"""The AI agents' clay coins: each agent's own mark, sculpted in clay (D183).

A coin is not a disc with a logo printed on it: it is the agent's mark itself made as a small
puffy clay object, in the same clay, light and camera as the rest of Ducter's art: Claude Code's
starburst, Codex's OpenAI knot, DeepSeek's whale, pi's blocks. The renders come from
the clay pipeline (design/art/assets/prompts/_style_coins.md + coin_<id>.md, the official mark
as a reference image), are cut out (design/art/assets/tools/cut.swift) and kept as masters in
design/art/assets/alpha/coin_<id>.png. This script makes every size the apps load from them.

Each agent gets two files:

    coin_<id>      the coin
    coin_<id>_off  signed out or not installed: the same object in one grey clay (its form and
                   light kept, its colour gone), so it is still recognisable but plainly off

    python3 tools/art/coins.py                         # every coin, every size
    python3 tools/art/coins.py master <id> <cut.png> [#tone]  # a new master from a cut-out render

Desktop: apps/desktop/internal/theme/art/clay/<name>@256.png (theme.Clay)
Web:     apps/web/static/art/<name>.webp at 128 px (served by packages/core/src/web.ts)
Site:    apps/site/scripts/art.mjs encodes from the masters.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
ALPHA = REPO / "design/art/assets/alpha"
DESK = REPO / "apps/desktop/internal/theme/art/clay"
WEB = REPO / "apps/web/static/art"

M = 1024  # master size
BG = np.array([0xFF, 0xF4, 0xE6]) / 255  # the render's flat background, for de-fringing

# id: optical size, the share of the square the object's longer side fills. Solid shapes (a
# cloud, blocks) read bigger than an open one (a starburst), so they sit a little smaller.
COINS = {
    "claude_code": 0.94,
    "codex": 0.84,
    "deepseek_harness": 0.92,
    "pi": 0.80,
}

# The unavailable coin's grey clay (the old coins' grey body).
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


# --- masters ------------------------------------------------------------------------------

def master(cid, cut, tone=None):
    """A cut-out render (straight alpha, edge pixels still mixed with the flat background) as a
    master: the background un-mixed from the edge, trimmed to the object, centred in a square."""
    im = np.asarray(Image.open(cut).convert("RGBA")).astype(np.float64) / 255
    rgb, a = im[..., :3], im[..., 3:]
    clean = np.clip((rgb - (1 - a) * BG) / np.maximum(a, 1e-3), 0, 1)
    rgb = np.where(a > 0.98, rgb, np.where(a > 0.02, clean, 0))
    if tone:  # the render came out off the mark's own colour: move its median there, form kept
        lab = to_lab(rgb)
        ref = np.median(lab[a[..., 0] > 0.98], axis=0)
        lab += to_lab(hexrgb(tone)[None, None, :])[0, 0] - ref
        rgb = from_lab(lab)
    out =Image.fromarray((np.concatenate([rgb, a], -1) * 255 + 0.5).astype(np.uint8), "RGBA")
    l, t, r, b = out.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    obj = out.crop((l, t, r, b))
    s = M * 0.96 / max(obj.size)
    obj = obj.convert("RGBa").resize((round(obj.width * s), round(obj.height * s)), Image.LANCZOS).convert("RGBA")
    sq = Image.new("RGBA", (M, M))
    sq.alpha_composite(obj, ((M - obj.width) // 2, (M - obj.height) // 2))
    sq.save(ALPHA / f"coin_{cid}.png", optimize=True)


# --- the coins ----------------------------------------------------------------------------

def placed(cid, fill):
    """The master at its optical size, centred, at M px."""
    im = Image.open(ALPHA / f"coin_{cid}.png").convert("RGBA")
    obj = im.crop(im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())
    s = M * fill / max(obj.size)
    obj = obj.convert("RGBa").resize((round(obj.width * s), round(obj.height * s)), Image.LANCZOS).convert("RGBA")
    out = Image.new("RGBA", (M, M))
    out.alpha_composite(obj, ((M - obj.width) // 2, (M - obj.height) // 2))
    return out


def grey(im):
    """The same clay object in one grey: lightness (its form and light) kept but compressed
    toward a pale grey, the colour replaced by the grey's own faint warmth."""
    a = np.asarray(im).astype(np.float64) / 255
    rgb, alpha = a[..., :3], a[..., 3:]
    lab = to_lab(rgb)
    solid = alpha[..., 0] > 0.5
    ref = np.median(lab[solid][:, 0])
    tgt = to_lab(hexrgb(OFF)[None, None, :])[0, 0]
    out = np.empty_like(lab)
    out[..., 0] = np.clip(tgt[0] + 0.55 * (lab[..., 0] - ref), 30, 96)
    out[..., 1] = tgt[1]
    out[..., 2] = tgt[2]
    res = np.concatenate([from_lab(out), alpha], -1)
    return Image.fromarray((np.clip(res, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


def save(name, im):
    a = im.convert("RGBa")
    a.resize((256, 256), Image.LANCZOS).convert("RGBA").save(DESK / f"{name}@256.png", optimize=True)
    a.resize((128, 128), Image.LANCZOS).convert("RGBA").save(
        WEB / f"{name}.webp", quality=88, alpha_quality=100, method=6, exact=True)


def build(only=None):
    for cid, fill in COINS.items():
        if only and cid not in only:
            continue
        coin = placed(cid, fill)
        save(f"coin_{cid}", coin)
        save(f"coin_{cid}_off", grey(coin))


if __name__ == "__main__":
    if sys.argv[1:2] == ["master"]:
        master(sys.argv[2], sys.argv[3], *sys.argv[4:5])
    else:
        build(sys.argv[1:] or None)
