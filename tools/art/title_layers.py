#!/usr/bin/env python3
"""Cut the title moment's key art into layers for parallax (D87).

Inputs (generated, kept in the evidence folder, never in git; D75):
  KEY    the key art: Ducter on its island at dawn (a_island.png)
  EMPTY  the same picture with Ducter removed (a_empty.png)
  SKY    the same picture with Ducter and the island removed (a_sky.png)
  and the masks tools/art/lift.swift found: MASK_ALL (Ducter + island, on
  KEY) and MASK_ISLAND (the island, on EMPTY).

    python3 tools/art/title_layers.py <keyart dir> <out dir> [width]

Writes, scaled so the frame is `width` px wide (default 3200, a 1600-point
window at 1:1 on a Retina screen):
  sky.webp        the whole frame, no alpha
  island.webp     the island, cut out, straight alpha
  ducter.webp     Ducter, cut out, straight alpha
  layers.json     where each sits (fractions of the frame), and Ducter's
                  eyelids (fractions of ducter.webp) with their colors

Edges carry no fringe: where a mask is partial, the layer's color is the
foreground solved out of the blend, F = (I - (1 - a) * B) / a, with B the
plate behind it (EMPTY behind Ducter, SKY behind the island), so nothing of
the old background travels with a layer when it moves.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eyes import _gauss, close_eyes, find_eyes, lid_box  # noqa: E402

src = Path(sys.argv[1])
out = Path(sys.argv[2])
width = int(sys.argv[3]) if len(sys.argv) > 3 else 3200
out.mkdir(parents=True, exist_ok=True)


def rgb(name):
    return np.asarray(Image.open(src / name).convert("RGB")).astype(np.float32) / 255


def mask(name):
    return np.asarray(Image.open(src / name).convert("L")).astype(np.float32) / 255


def grade(x):
    """One grade for every layer: the generations come out a little hazy.
    A gentle S-curve (more depth in the clouds' shadows) and a touch more
    color, the same on every layer so they still match."""
    x = x + 0.14 * (x - 0.5) * (1 - np.abs(2 * x - 1))  # S-curve, ends fixed
    lum = x.mean(axis=2, keepdims=True)
    return np.clip(lum + (x - lum) * 1.10, 0, 1)


key, empty, sky = (grade(rgb(n)) for n in ("a_island.png", "layers/a_empty.png", "layers/a_sky.png"))
# The island may come from its own plate (a_island_plate.png: the empty
# picture with the island restyled, here clay grass for the fur-like
# grass); Ducter is always matted against a_empty, which matches its key.
plate = (src / "layers/a_island_plate.png").exists()
island_img = grade(rgb("layers/a_island_plate.png")) if plate else empty
m_all, m_island = mask("layers/a-mask-1.png"), mask("layers/empty-mask-1.png")
m_plate = mask("layers/plate-mask-1.png") if (src / "layers/plate-mask-1.png").exists() else m_island
H, W, _ = key.shape

# Ducter: in the subject mask and not the island, plus, where it stands on
# the island, what changed between KEY and EMPTY and is clay-orange or the
# blue notebook (not its shadow, which is a darker island).
diff = np.abs(key - empty).mean(axis=2)
r, g, b = key[..., 0], key[..., 1], key[..., 2]
orange = (r - b > 0.42) & (r > 0.5) & (g < 0.62 * r)
blue = (b - r > 0.10) & (b > 0.35)
on_island = (diff > 0.10) & (orange | blue)
core = np.maximum(m_all * (1 - m_island), m_all * on_island)
# Clean it: drop specks, close small holes, then take Vision's soft edge
# back on the outline (the max-filtered core bounds it).
img = Image.fromarray((core * 255).astype(np.uint8))
img = img.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
img = img.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(7))
hard = np.asarray(img).astype(np.float32) / 255
a_duc = np.minimum(hard, m_all)
# Keep only the biggest blob (Ducter): thin rings where the two masks'
# soft edges disagree, and lit patches of the island, are cut off first by
# an erosion, at an eighth of the size.
small = Image.fromarray((a_duc > 0.5).astype(np.uint8) * 255).resize((W // 8, H // 8), Image.BILINEAR)
small = np.asarray(small.filter(ImageFilter.MinFilter(5))) > 127


def components(m):
    lab = np.zeros(m.shape, np.int32)
    sizes = [0]
    for yy, xx in zip(*np.nonzero(m)):
        if lab[yy, xx]:
            continue
        n = len(sizes)
        lab[yy, xx] = n
        stack, size = [(yy, xx)], 0
        while stack:
            py, px = stack.pop()
            size += 1
            for qy, qx in ((py + 1, px), (py - 1, px), (py, px + 1), (py, px - 1)):
                if 0 <= qy < m.shape[0] and 0 <= qx < m.shape[1] and m[qy, qx] and not lab[qy, qx]:
                    lab[qy, qx] = n
                    stack.append((qy, qx))
        sizes.append(size)
    return lab, sizes


lab, sizes = components(small)
keep = lab == int(np.argmax(sizes))
gate = Image.fromarray(keep.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(9)).resize((W, H), Image.BILINEAR)
a_duc = a_duc * (np.asarray(gate).astype(np.float32) / 255)
# A tighter edge: Vision's soft rim holds a little of the sky.
a_duc = np.clip((a_duc - 0.35) / 0.6, 0, 1)
a_duc = a_duc * a_duc * (3 - 2 * a_duc)
# Under the feet the cut meets the island's own shadows (little orange
# flaps): fade the last 5% of Ducter's height, where its contact shadow
# sits anyway.
ys = np.nonzero(a_duc.max(axis=1) > 0.5)[0]
top_y, bot_y = ys.min(), ys.max()
fade_from = bot_y - 0.05 * (bot_y - top_y)
rows = np.clip((bot_y - np.arange(H)) / max(1, bot_y - fade_from), 0, 1)
a_duc = a_duc * rows[:, None]
# Feather the inside edge where it meets the island by a few pixels.
a_duc = np.asarray(Image.fromarray((a_duc * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255


def unblend(img, alpha, plate):
    a = alpha[..., None]
    f = (img - (1 - a) * plate) / np.maximum(a, 1e-3)
    f = np.where(a > 0.02, f, img)
    return np.clip(f, 0, 1)


duc_rgb = unblend(key, a_duc, empty)
isl_rgb = unblend(island_img, m_plate, sky)


def clarity(rgb_, alpha, radius=24, amount=0.22):
    """Local contrast for the subject: an unsharp mask with a wide radius
    (computed on color premultiplied by alpha, so the edge doesn't pick up
    the dark outside), so the clay keeps its form under the haze."""
    pm = np.clip(rgb_ * alpha[..., None], 0, 1)
    blur = np.stack([np.asarray(Image.fromarray((pm[..., i] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))).astype(np.float32) / 255 for i in range(3)], axis=2)
    ab = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))).astype(np.float32)[..., None] / 255
    local = blur / np.maximum(ab, 1e-3)
    return np.clip(rgb_ + amount * (rgb_ - local), 0, 1)


duc_rgb = clarity(duc_rgb, a_duc)
isl_rgb = clarity(isl_rgb, m_plate, radius=30, amount=0.15)
# The island's rim: Vision's soft edge runs a few pixels past the clay, and
# there the plate and the sky behind it don't quite match, so solving the
# blend lifts the difference into a light lilac halo. Pull the edge in a
# little (save_layer then gives the rim the clay's own color).
# Vision's edge is a little lumpy where the clay meets the haze: smooth it
# first, so the rim reads as one soft curve.
m_plate = _gauss(m_plate[..., None], 2.5)[..., 0]
m_plate = np.clip((m_plate - 0.12) / 0.83, 0, 1)
m_plate = m_plate * m_plate * (3 - 2 * m_plate)


def bbox(alpha, pad=8):
    ys, xs = np.nonzero(alpha > 0.01)
    return max(0, xs.min() - pad), max(0, ys.min() - pad), min(W, xs.max() + pad + 1), min(H, ys.max() + pad + 1)


s = width / W


def extend_edge(c, a, solid=0.97):
    """Every pixel that isn't solid takes the color of the solid layer next
    to it (pulled outward by normalized blurs, near first), so the rim is
    the clay fading out and the transparent pixels round it carry the same
    color: a renderer that filters straight alpha can't bleed anything else
    in at the edge."""
    m = (a >= solid).astype(np.float32)
    ext = c.copy()
    have = m.copy()
    for sigma in (1.5, 4, 12, 40):
        num = _gauss(c * m, sigma)
        den = _gauss(m, sigma)
        pick = (have[..., 0] < 0.5) & (den[..., 0] > 0.02)
        ext[pick] = num[pick] / den[pick]
        have[pick] = 1
    return np.where(a >= solid, c, ext)


def save_layer(name, color, alpha, lossless=False):
    x0, y0, x1, y1 = bbox(alpha)
    rgba = np.dstack([color[y0:y1, x0:x1], alpha[y0:y1, x0:x1]])
    im = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA")
    w, h = round((x1 - x0) * s), round((y1 - y0) * s)
    # Resize premultiplied, so edges stay clean.
    pm = rgba.copy()
    pm[..., :3] *= pm[..., 3:4]
    pim = Image.fromarray((pm * 255 + 0.5).astype(np.uint8), "RGBA").resize((w, h), Image.LANCZOS)
    p = np.asarray(pim).astype(np.float32) / 255
    a = p[..., 3:4]
    c = np.where(a > 1e-3, p[..., :3] / np.maximum(a, 1e-3), 0)
    c = extend_edge(np.clip(c, 0, 1), a)
    small = Image.fromarray((np.dstack([np.clip(c, 0, 1), a]) * 255 + 0.5).astype(np.uint8), "RGBA")
    if lossless:
        # exact: keep the color under every transparent pixel (extend_edge's).
        small.save(out / f"{name}.webp", lossless=True, quality=100, method=6, exact=True)
    else:
        small.save(out / f"{name}.webp", quality=90, alpha_quality=100, method=6, exact=True)
    small.save(out / f"{name}-check.png")
    return {"x": x0 / W, "y": y0 / H, "w": (x1 - x0) / W, "h": (y1 - y0) / H, "px": [w, h]}


layout = {"frame": [width, round(H * s)]}
# The sky is a long, dark gradient: resize in float, then add triangular
# dither of one 8-bit step before quantizing, so it doesn't band.
sk = np.stack([np.asarray(Image.fromarray(sky[..., i].astype(np.float32), "F").resize((width, round(H * s)), Image.LANCZOS)) for i in range(3)], axis=2)
rng = np.random.default_rng(87)
tri = (rng.random(sk.shape) - rng.random(sk.shape)).astype(np.float32)
Image.fromarray(np.clip(sk * 255 + 0.5 + tri, 0, 255).astype(np.uint8)).save(out / "sky.webp", quality=95, method=6)
# The island fills a third of the window at full size: lossless, so its
# soft clay gradients show no blocks on a Retina screen.
layout["island"] = save_layer("island", isl_rgb, m_plate, lossless=True)
layout["ducter"] = save_layer("ducter", duc_rgb, a_duc)

# The eyes, closed: the same layer with each eye filled from the clay round
# it (tools/art/eyes.py), and the lid boxes the blink draws it through.
duc = np.asarray(Image.open(out / "ducter-check.png").convert("RGBA")).astype(np.float32) / 255
ch, cw = duc.shape[:2]
boxes = [lid_box(e) for e in find_eyes(duc)]
closed = close_eyes(duc, boxes)
lids = [{"x": float(b[0] / cw), "y": float(b[1] / ch), "w": float((b[2] - b[0]) / cw), "h": float((b[3] - b[1]) / ch)} for b in boxes]
Image.fromarray((np.clip(closed, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(
    out / "ducter_closed.webp", quality=90, alpha_quality=100, method=6)
layout["lids"] = lids
(out / "layers.json").write_text(json.dumps(layout, indent=1))
print(json.dumps(layout, indent=1))
for n in ("sky", "island", "ducter", "ducter_closed"):
    print(n, (out / f"{n}.webp").stat().st_size, "bytes")

# The logotype: clay lettering rendered on pure black (logo2.png). Its
# alpha is Vision's mask, its color solved out of the black (F = I / a).
logo = rgb("logo2.png")
# Vision's mask holds the dark gaps between letters too: the lettering is
# what is lit, so the luminance bounds it.
m_logo = mask("layers/logo-mask-1.png") * np.clip((logo.max(axis=2) - 0.03) / 0.30, 0, 1)
logo_rgb = np.clip(logo / np.maximum(m_logo[..., None], 1e-3), 0, 1)
logo_rgb = np.where(m_logo[..., None] > 0.02, logo_rgb, 0)
x0, y0, x1, y1 = bbox(m_logo)
lw = 1400  # px: the logotype is drawn at most 700 points wide
lh = round((y1 - y0) * lw / (x1 - x0))
pm = np.dstack([logo_rgb[y0:y1, x0:x1] * m_logo[y0:y1, x0:x1, None], m_logo[y0:y1, x0:x1]])
pim = Image.fromarray((pm * 255 + 0.5).astype(np.uint8), "RGBA").resize((lw, lh), Image.LANCZOS)
p = np.asarray(pim).astype(np.float32) / 255
a = p[..., 3:4]
c = np.where(a > 1e-3, p[..., :3] / np.maximum(a, 1e-3), 0)
Image.fromarray((np.dstack([np.clip(c, 0, 1), a]) * 255 + 0.5).astype(np.uint8), "RGBA").save(
    out / "logo.webp", quality=92, alpha_quality=100, method=6)
print("logo", lw, lh, (out / "logo.webp").stat().st_size, "bytes")

# The logotype lit: the same letters brightened toward the dawn's cream,
# for the light that sweeps across them (drawn in slices over logo.webp).
lit = Image.open(out / "logo.webp").convert("RGBA")
la = np.asarray(lit).astype(np.float32) / 255
la[..., :3] = 1 - (1 - la[..., :3]) * 0.30
la[..., :3] = la[..., :3] * np.array([1.0, 0.985, 0.95])
Image.fromarray((la * 255 + 0.5).astype(np.uint8), "RGBA").save(out / "logo_lit.webp", quality=92, alpha_quality=100, method=6)
