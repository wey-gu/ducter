#!/usr/bin/env python3
"""The partners' figures (D565): every size each client draws, from the 1024 masters.

The pebble's own art is made as it always was (its crops, squares and eyes.py). The other five
figures (bun, sprout, cloud, cube, bean) each have the pebble's six poses as cut-out masters,
design/art/assets/alpha/<figure>_<pose>.png. From them this makes:

- the Mac's cut-out faces, apps/desktop/internal/theme/art/fig/crop/<figure>_<pose>@{128,256}.png,
  cropped to the alpha's bounds (theme.Face);
- the Mac's square art, art/fig/<figure>_<pose>@{160,400}.png, each figure placed where the
  pebble's same pose sits in its square (theme.Art), so a pose's figures share one stage;
- the blink: the idle face with its eyes closed (eyes.py's close_eyes), at every size, and the lid
  boxes for theme's figureLids and figureSquare (printed);
- the phone and web frames, apps/web/static/art/fig/<figure>_<pose>.webp, 360 on the long side,
  with the closed idle's crease baked in (its blink is a frame swap);
- the sprout's leaves as their own layer (<name>_leaf), so a partner's clay (LOOK_CLAY) never
  tints them: the leaves are the master's green pixels, laid back over the recoloured figure.

    python3 tools/art/figures.py            # every figure
    python3 tools/art/figures.py bun cube   # some
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eyes import _components, close_eyes, crease, lid_box  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
ALPHA = ROOT / "design/art/assets/alpha"
MAC = ROOT / "apps/desktop/internal/theme/art"
WEB = ROOT / "apps/web/static/art"
FIGURES = ["bun", "sprout", "cloud", "cube", "bean"]
POSES = ["idle", "working", "waiting", "needsyou", "done", "napping"]
LEAVES = {"sprout"}
# LOOK_CLAY (packages/protocol/src/partners.ts): hue turn, saturation.
LOOKS = {"sand": (0, 1), "sage": (95, 0.62), "sky": (175, 0.85), "plum": (255, 0.7), "apricot": (-28, 1), "butter": (22, 1)}


def recolour(x, deg, s):
    """CSS hue-rotate(deg) then saturate(s), as the clients apply a look."""
    import math
    a = math.radians(deg)
    c, n = math.cos(a), math.sin(a)
    H = np.array([[.213 + .787 * c - .213 * n, .715 - .715 * c - .715 * n, .072 - .072 * c + .928 * n],
                  [.213 - .213 * c + .143 * n, .715 + .285 * c + .140 * n, .072 - .072 * c - .283 * n],
                  [.213 - .213 * c - .787 * n, .715 - .715 * c + .715 * n, .072 + .928 * c + .072 * n]])
    S = np.array([[.213 + .787 * s, .715 - .715 * s, .072 - .072 * s], [.213 - .213 * s, .715 + .285 * s, .072 - .072 * s],
                  [.213 - .213 * s, .715 - .715 * s, .072 + .928 * s]])
    out = x.copy()
    out[..., :3] = np.clip(x[..., :3] @ (S @ H).T, 0, 1)
    return out


def f32(im):
    return np.asarray(im.convert("RGBA")).astype(np.float32) / 255


def img(x):
    return Image.fromarray((np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


def save_png(x, p):
    p.parent.mkdir(parents=True, exist_ok=True)
    img(x).save(p, optimize=True)


def save_webp(x, p):
    p.parent.mkdir(parents=True, exist_ok=True)
    img(x).save(p, quality=90, alpha_quality=100, method=6, exact=True)


def resize(x, w, h):
    """Premultiplied resize, so no dark fringe creeps in from transparent pixels."""
    pm = x.copy()
    pm[..., :3] *= pm[..., 3:4]
    out = np.stack([np.asarray(Image.fromarray(pm[..., c]).resize((w, h), Image.LANCZOS)) for c in range(4)], axis=2)
    out = np.clip(out, 0, 1)
    a = out[..., 3:4]
    out[..., :3] = np.where(a > 1e-4, out[..., :3] / np.maximum(a, 1e-4), 0)
    return np.clip(out, 0, 1)


def bounds(x):
    ys, xs = np.nonzero(x[..., 3] > 12 / 255)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def leaf_mask(x):
    """The sprout's leaves: the master's green pixels (the body is orange, the notebook blue)."""
    rgb = x[..., :3]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-4), 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    green = (g >= r) & (g > b) & (sat > 0.18) & (x[..., 3] > 0.02)
    m = Image.fromarray((green * 255).astype(np.uint8))
    from PIL import ImageFilter
    m = m.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    return np.asarray(m).astype(np.float32) / 255


def find_eyes(x, top=0.75):
    """The two eyes: of the dark blobs in the upper part, the pair most alike (size, height) and
    side by side, the biggest such pair. Beads, buttons and pills as well as ovals."""
    rgb, a = x[..., :3], x[..., 3]
    dark = (rgb.mean(axis=2) < 0.25) & (a > 0.9)
    dark[int(dark.shape[0] * top):] = False
    # An eye's white highlight can cut its dark in two (the cube's pills): join what a few pixels part.
    from PIL import ImageFilter
    dark = np.asarray(Image.fromarray((dark * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))) > 0
    lab, sizes = _components(dark)
    blobs = []
    for n in range(1, len(sizes)):
        if sizes[n] < 12:
            continue
        ys, xs = np.nonzero(lab == n)
        blobs.append((sizes[n], (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)))
    best, score = None, -1.0
    for i in range(len(blobs)):
        for j in range(i + 1, len(blobs)):
            (si, bi), (sj, bj) = blobs[i], blobs[j]
            ci, cj = (bi[1] + bi[3]) / 2, (bj[1] + bj[3]) / 2
            h = max(bi[3] - bi[1], bj[3] - bj[1])
            if abs(ci - cj) > 0.5 * h or min(si, sj) / max(si, sj) < 0.45:
                continue
            if not (bi[2] <= bj[0] or bj[2] <= bi[0]):
                continue
            s = si + sj
            if s > score:
                best, score = (bi, bj), s
    assert best, "no eyes found"
    return sorted(best, key=lambda e: e[0])


def pebble_box(pose):
    """Where the pebble's pose sits in its 400 square (fractions)."""
    sq = f32(Image.open(MAC / f"ducter_{pose}@400.png"))
    x0, y0, x1, y1 = bounds(sq)
    return x0 / 400, y0 / 400, x1 / 400, y1 / 400


def square(crop, pose, size):
    """The crop on the pebble's stage for this pose: fitted into the pebble's box, standing on its
    bottom, centred on it. Returns the image and where the crop sits (fractions)."""
    bx0, by0, bx1, by1 = pebble_box(pose)
    bw, bh = bx1 - bx0, by1 - by0
    ch, cw = crop.shape[:2]
    # Contained in a square as wide as the pebble's box (the clients' model: every figure fits the
    # same square, standing on its bottom), then the figure's optical size.
    side = max(bw, bh) * size
    s = min(side / cw, side / ch) * OPTICAL[FIG]
    w, h = max(1, round(cw * s)), max(1, round(ch * s))
    left = max(0, min(size - w, round((bx0 + bw / 2) * size - w / 2)))
    top = max(0, round(by1 * size - h))
    h = min(h, size - top)
    out = np.zeros((size, size, 4), np.float32)
    out[top:top + h, left:left + w] = resize(crop, w, h)[:h]
    return out, (left / size, top / size, w / size, h / size)


def optical():
    """Each figure's optical size (D565): fitted into the same square, standing on its bottom, every
    figure as tall as the pebble's idle (the sprout's leaves counted at three quarters), so a tall bean is drawn a little
    smaller and a wide cloud a little larger; within 0.85 to 1.12. One table, emitted for both clients."""
    def h(p):
        a = f32(Image.open(p))
        x0, y0, x1, y1 = bounds(a)
        return (y1 - y0) / max(x1 - x0, y1 - y0)
    peb = h(MAC / "crop/ducter_idle@256.png")
    out = {}
    for fig in FIGURES:
        m = f32(Image.open(ALPHA / f"{fig}_idle.png"))
        m[..., 3] = np.where(m[..., 3] < 12 / 255, 0, m[..., 3])
        x0, y0, x1, y1 = bounds(m)
        h = (y1 - y0) / max(x1 - x0, y1 - y0)
        if fig in LEAVES:
            # The sprout's leaves count at three quarters: by the whole box its body read small beside
            # the pebble, by its body alone the leaves rose over the row.
            solid = (m[..., 3] > 0.5) & (leaf_mask(m) < 0.3)
            by0 = int(np.argmax(solid.sum(axis=1) > 0.15 * (x1 - x0)))  # the body's top: past the stem
            h = 0.75 * h + 0.25 * (y1 - by0) / max(x1 - x0, y1 - y0)
        out[fig] = round(min(1.12, max(0.85, peb / h)), 3)
    return out


OPTICAL = {}
LIDS = {}
FIG = ""


def make(fig):
    global FIG
    FIG = fig
    lids_out, sq_out = None, None
    for pose in POSES:
        master = f32(Image.open(ALPHA / f"{fig}_{pose}.png"))
        master[..., 3] = np.where(master[..., 3] < 12 / 255, 0, master[..., 3])
        x0, y0, x1, y1 = bounds(master)
        crop = master[y0:y1, x0:x1].copy()
        leaf = None
        if fig in LEAVES:
            m = leaf_mask(crop)
            leaf = crop.copy()
            leaf[..., 3] *= m
        ch, cw = crop.shape[:2]
        variants = [("", crop, leaf)]
        boxes = None
        if pose == "idle":
            c256 = resize(crop, *((256, round(ch * 256 / cw)) if cw >= ch else (round(cw * 256 / ch), 256)))
            eyes = find_eyes(c256)
            h2, w2 = c256.shape[:2]
            boxes = [lid_box(e) for e in eyes]
            lids_out = [(b[0] / w2, b[1] / h2, (b[2] - b[0]) / w2, (b[3] - b[1]) / h2) for b in boxes]
        for long_side in (128, 256):
            w, h = (long_side, max(1, round(ch * long_side / cw))) if cw >= ch else (max(1, round(cw * long_side / ch)), long_side)
            small = resize(crop, w, h)
            save_png(small, MAC / f"fig/crop/{fig}_{pose}@{long_side}.png")
            if leaf is not None:
                save_png(resize(leaf, w, h), MAC / f"fig/crop/{fig}_{pose}_leaf@{long_side}.png")
            if pose == "idle":
                fb = [(l[0] * w, l[1] * h, (l[0] + l[2]) * w, (l[1] + l[3]) * h) for l in lids_out]
                save_png(close_eyes(small, fb), MAC / f"fig/crop/{fig}_idle_closed@{long_side}.png")
                if leaf is not None:
                    save_png(resize(leaf, w, h), MAC / f"fig/crop/{fig}_idle_closed_leaf@{long_side}.png")
        for size in (160, 400):
            sq, at = square(crop, pose, size)
            save_png(sq, MAC / f"fig/{fig}_{pose}@{size}.png")
            if leaf is not None:
                save_png(square(leaf, pose, size)[0], MAC / f"fig/{fig}_{pose}_leaf@{size}.png")
            if pose == "idle":
                sq_out = at
                sb = [((at[0] + l[0] * at[2]) * size, (at[1] + l[1] * at[3]) * size, (at[0] + (l[0] + l[2]) * at[2]) * size, (at[1] + (l[1] + l[3]) * at[3]) * size) for l in lids_out]
                save_png(close_eyes(sq, sb), MAC / f"fig/{fig}_idle_closed@{size}.png")
                if leaf is not None:
                    save_png(square(leaf, pose, size)[0], MAC / f"fig/{fig}_idle_closed_leaf@{size}.png")
        # The phone and web frame: 360 on the long side (the pebble's idle.webp is its crop at 360).
        w, h = (360, max(1, round(ch * 360 / cw))) if cw >= ch else (max(1, round(cw * 360 / ch)), 360)
        web = resize(crop, w, h)
        save_webp(web, WEB / f"fig/{fig}_{pose}.webp")
        frames = [(pose, web)]
        if pose == "idle":
            fb = [(l[0] * w, l[1] * h, (l[0] + l[2]) * w, (l[1] + l[3]) * h) for l in lids_out]
            frames.append(("idle_closed", crease(close_eyes(web, fb), fb)))
        for name, frame in frames:
            save_webp(frame, WEB / f"fig/{fig}_{name}.webp")
            if leaf is not None:
                # The web tints with a CSS filter on the whole frame, so a figure with an untinted part
                # comes ready in every clay instead (<figure>-<look>_<pose>.webp, no filter).
                lw = resize(leaf, w, h)
                for look, (deg, s) in LOOKS.items():
                    if look == "sand":
                        continue
                    t = recolour(frame, deg, s)
                    a = lw[..., 3:4]
                    t[..., :3] = lw[..., :3] * a + t[..., :3] * (1 - a)
                    save_webp(t, WEB / f"fig/{fig}-{look}_{name}.webp")
    LIDS[fig] = lids_out
    return sq_out


if __name__ == "__main__":
    figs = sys.argv[1:] or FIGURES
    OPTICAL.update(optical())
    print("optical:", OPTICAL)
    LIDS.clear()
    sqs = {f: make(f) for f in figs}
    # The one table both clients read (D565): each figure's lids, where its idle sits in its square,
    # and its optical size. Go for the Mac's theme, TypeScript for the web.
    go = ["// Code generated by tools/art/figures.py (D565). DO NOT EDIT.", "", "package theme", "",
          "// figureLids are each figure's idle eyelids, as fractions of its cropped idle art.", "var figureLids = map[string][2]Lid{"]
    for f in FIGURES:
        go.append(f'\t"{f}": {{' + ", ".join(f"{{X: {l[0]:.4f}, Y: {l[1]:.4f}, W: {l[2]:.4f}, H: {l[3]:.4f}}}" for l in LIDS[f]) + "},")
    go += ["}", "", "// figureSquare is where each figure's cropped idle sits in its square art.", "var figureSquare = map[string]struct{ X, Y, W, H float32 }{"]
    for f in FIGURES:
        s = sqs[f]
        go.append(f'\t"{f}": {{X: {s[0]:.4f}, Y: {s[1]:.4f}, W: {s[2]:.4f}, H: {s[3]:.4f}}},')
    go += ["}", "", "// figureOptical is each figure's optical size: drawn fitted into the same square as the", "// pebble, then scaled by this about its feet, so every figure reads as the same size.", "var figureOptical = map[string]float32{"]
    for f in FIGURES:
        go.append(f'\t"{f}": {OPTICAL[f]},')
    go += ["}", ""]
    (MAC.parent / "figures_gen.go").write_text("\n".join(go))
    import subprocess
    subprocess.run(["gofmt", "-w", str(MAC.parent / "figures_gen.go")], check=False)
    ts = ["// Generated by tools/art/figures.py (D565). Each figure's optical size: drawn fitted into the same",
          "// square as the pebble, then scaled by this about its feet, so every figure reads as the same size.",
          "export const FIGURE_OPTICAL: Record<string, number> = {"]
    for f in FIGURES:
        ts.append(f"  {f}: {OPTICAL[f]},")
    ts += ["};", ""]
    (ROOT / "packages/protocol/src/figures-gen.ts").write_text("\n".join(ts))
    # The compiled home serves the web's files from imports (packages/core/src/web.ts): one module
    # lists every figure frame.
    names = sorted(p.name for p in (WEB / "fig").glob("*.webp"))
    lines = ["// Generated by tools/art/figures.py (D565): every partner figure's web frame, for web.ts's ASSETS.", ""]
    for i, n in enumerate(names):
        lines.append(f'import f{i} from "../../../apps/web/static/art/fig/{n}" with {{ type: "file" }};')
    lines += ["", "export const FIGURE_ASSETS: Record<string, [string, string]> = {"]
    for i, n in enumerate(names):
        lines.append(f'  "art/fig/{n}": [f{i}, "image/webp"],')
    lines += ["};", ""]
    (ROOT / "packages/core/src/web-figures.ts").write_text("\n".join(lines))
