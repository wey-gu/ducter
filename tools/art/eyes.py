#!/usr/bin/env python3
"""Ducter's closed eyes, made from the same render as its open ones (D77's blink).

A blink draws the closed face through a lid that slides down over each eye
(apps/desktop/internal/views/lids.go). The closed face must differ from the
open one only inside each eye, and there match the clay around it exactly:
same light, same shading, same grain, so nothing but the lid edge shows.

How: find each eye (the dark oval, its highlight and the sculpted rim round
it), then fill it from the skin around it by solving Laplace's equation
inside (a harmonic fill: the smoothest surface that meets the surrounding
skin on every side, which is what lit clay looks like), and lay the clay's
own fine grain back on from the skin just above the eye.

    python3 tools/art/eyes.py <apps/desktop/internal/theme/art> [<apps/web/static/art>]

writes crop/ducter_idle_closed@{128,256}.png and ducter_idle_closed@{160,400}.png
next to the open ones (and the phone's art/idle_closed.webp, with the
closed eye's line drawn in: its blink is a frame swap) and prints the lid boxes for theme.FaceLids (fractions
of the cropped art). title_layers.py uses close_eyes for the title moment.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def _components(m):
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


def find_eyes(rgba):
    """The two eyes as (x0, y0, x1, y1) pixel boxes, left to right: the two
    biggest dark blobs in the upper 55% that sit side by side."""
    rgb, a = rgba[..., :3], rgba[..., 3]
    lum = rgb.mean(axis=2)
    dark = (lum < 0.25) & (a > 0.9)
    dark[int(dark.shape[0] * 0.55):] = False
    lab, sizes = _components(dark)
    order = [int(n) for n in np.argsort(sizes)[::-1] if sizes[n] > 0][:2]
    eyes = []
    for n in order:
        ys, xs = np.nonzero(lab == n)
        eyes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    eyes.sort(key=lambda e: e[0])
    return eyes


def lid_box(eye, margin=0.45):
    """The lid's box round an eye: the eye plus its sculpted rim."""
    x0, y0, x1, y1 = eye
    w, h = x1 - x0, y1 - y0
    m = max(1.5, margin * w)
    return (x0 - m, y0 - m, x1 + m, y1 + m)


def _ellipse(shape, box, scale=1.0):
    """Distance² from the box's ellipse (scaled): < 1 inside."""
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = (x1 - x0) / 2 * scale, (y1 - y0) / 2 * scale
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]].astype(np.float32)
    return ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2


def _gauss(x, sigma):
    """A separable Gaussian blur of a float image (H, W, C), edges held."""
    r = max(1, int(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    p = np.pad(x, ((r, r), (0, 0), (0, 0)), mode="edge")
    x = sum(k[i] * p[i:i + x.shape[0]] for i in range(2 * r + 1))
    p = np.pad(x, ((0, 0), (r, r), (0, 0)), mode="edge")
    return sum(k[i] * p[:, i:i + x.shape[1]] for i in range(2 * r + 1))


def _harmonic(img, hole, iters=400):
    """Fill img where hole is set with the harmonic interpolant of the rest,
    coarse to fine (each level starts from the one below)."""
    h, w = hole.shape
    if min(h, w) > 24:
        sh, sw = (h + 1) // 2, (w + 1) // 2
        small = np.stack([np.asarray(Image.fromarray(img[..., c]).resize((sw, sh), Image.BILINEAR)) for c in range(img.shape[2])], axis=2)
        shole = np.asarray(Image.fromarray(hole.astype(np.uint8) * 255).resize((sw, sh), Image.BILINEAR)) > 0
        coarse = _harmonic(small, shole, iters)
        up = np.stack([np.asarray(Image.fromarray(coarse[..., c]).resize((w, h), Image.BILINEAR)) for c in range(img.shape[2])], axis=2)
        x = np.where(hole[..., None], up, img)
    else:
        x = np.where(hole[..., None], img[~hole].mean(axis=0), img)
    x = x.astype(np.float32)
    for _ in range(iters):
        p = np.pad(x, ((1, 1), (1, 1), (0, 0)), mode="edge")
        avg = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]) / 4
        x = np.where(hole[..., None], avg, x)
    return x


def close_eyes(rgba, boxes):
    """rgba: straight-alpha float image (H, W, 4). boxes: the lid boxes
    (pixels). Returns the closed face: equal to rgba outside each box's
    ellipse, the eye filled with matching clay inside."""
    out = rgba.copy()
    H, W = rgba.shape[:2]
    for box in boxes:
        x0, y0, x1, y1 = box
        bw, bh = x1 - x0, y1 - y0
        # Work in a window round the box with room for the boundary.
        pad = max(4, int(0.6 * max(bw, bh)))
        wx0, wy0 = max(0, int(x0) - pad), max(0, int(y0) - pad)
        wx1, wy1 = min(W, int(np.ceil(x1)) + pad), min(H, int(np.ceil(y1)) + pad)
        # From what is already closed: windows of the two eyes may overlap.
        win = out[wy0:wy1, wx0:wx1, :3].astype(np.float32)
        local = (x0 - wx0, y0 - wy0, x1 - wx0, y1 - wy0)
        d = _ellipse(win.shape, local)
        hole = d < 1.0
        fill = _harmonic(win, hole)
        # The clay's grain: the fine detail of the skin just above the box
        # (its whole height above, so nothing of the eye comes along).
        shift = int(np.ceil(bh * 1.1))
        if wy0 - shift >= 0:
            src = rgba[wy0 - shift:wy1 - shift, wx0:wx1].astype(np.float32)
            grain = src[..., :3] - _gauss(src[..., :3], max(1.0, bw * 0.06))
            # Only clay counts: never the outline or what is past it, and
            # only fine grain (anything bigger is a feature, not grain).
            solid = (_gauss(src[..., 3:4], 2.0) > 0.995).astype(np.float32)
            grain = np.clip(grain, -0.025, 0.025) * solid
            fill = fill + grain * hole[..., None]
        # Feather the last stretch to the ellipse's edge, where the fill
        # already meets the skin (inside the box: the lid clip is larger).
        wgt = np.clip((1.0 - d) / 0.15, 0, 1)
        wgt = wgt * wgt * (3 - 2 * wgt)
        out[wy0:wy1, wx0:wx1, :3] = np.clip(fill * wgt[..., None] + win * (1 - wgt[..., None]), 0, 1)
    return out


def _load(p):
    return np.asarray(Image.open(p).convert("RGBA")).astype(np.float32) / 255


def _save(p, x):
    Image.fromarray((np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(p, optimize=True)


def crease(img, boxes, ss=4):
    """The closed eye's line baked into a closed face (the phone's blink is
    a frame swap): the shape drawLids strokes when shut (lids.go)."""
    from PIL import ImageDraw
    h, w = img.shape[:2]
    layer = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for x0, y0, x1, y1 in boxes:
        bw, bh = x1 - x0, y1 - y0
        cx, rx = (x0 + x1) / 2, bw / 2 * 1.12
        shut = y0 + bh * 0.70
        def y(x):
            u = (x - cx) / rx
            return shut + bh * 0.10 * (1 - u * u)
        xs = np.linspace(x0 + bw * 0.22, x0 + bw * 0.78, 24)
        pts = [(float(x * ss), float(y(x) * ss)) for x in xs]
        width = max(1.0, bw * 0.07) * ss
        d.line(pts, fill=(58, 33, 22, 230), width=int(round(width)), joint="curve")
        for px, py in (pts[0], pts[-1]):
            r = width / 2
            d.ellipse((px - r, py - r, px + r, py + r), fill=(58, 33, 22, 230))
    lay = np.asarray(layer.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255
    out = img.copy()
    a = lay[..., 3:4]
    out[..., :3] = lay[..., :3] * a + img[..., :3] * (1 - a)
    return out


def main(art, web=None):
    art = Path(art)
    ref = _load(art / "crop/ducter_idle@256.png")
    rh, rw = ref.shape[:2]
    eyes = find_eyes(ref)
    assert len(eyes) == 2, eyes
    # Lid boxes as fractions of the cropped art: one table for every size.
    fr = [(b[0] / rw, b[1] / rh, b[2] / rw, b[3] / rh) for b in (lid_box(e) for e in eyes)]
    # Where the cropped art sits inside the square art (theme.IdleSquareContent).
    sq = (66 / 400, 88 / 400, 256 / 400, 230 / 400)
    for name, square in (("crop/ducter_idle@128.png", False), ("crop/ducter_idle@256.png", False), ("ducter_idle@160.png", True), ("ducter_idle@400.png", True)):
        img = _load(art / name)
        h, w = img.shape[:2]
        if square:
            boxes = [((sq[0] + f[0] * sq[2]) * w, (sq[1] + f[1] * sq[3]) * h, (sq[0] + f[2] * sq[2]) * w, (sq[1] + f[3] * sq[3]) * h) for f in fr]
        else:
            boxes = [(f[0] * w, f[1] * h, f[2] * w, f[3] * h) for f in fr]
        _save(art / name.replace("ducter_idle@", "ducter_idle_closed@"), close_eyes(img, boxes))
    if web:
        # The phone's idle face is the same crop at 360 px wide: its closed
        # frame, with the closed eye's line baked in.
        web = Path(web)
        img = _load(web / "idle.webp")
        h, w = img.shape[:2]
        boxes = [(f[0] * w, f[1] * h, f[2] * w, f[3] * h) for f in fr]
        closed = crease(close_eyes(img, boxes), boxes)
        Image.fromarray((np.clip(closed, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(
            web / "idle_closed.webp", quality=90, alpha_quality=100, method=6, exact=True)
    for f in fr:
        print(f"{{X: {f[0]:.4f}, Y: {f[1]:.4f}, W: {f[2] - f[0]:.4f}, H: {f[3] - f[1]:.4f}}},")


if __name__ == "__main__":
    main(*sys.argv[1:3])
