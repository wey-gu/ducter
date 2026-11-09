"""Compose and compress the README and docs screenshots.

    python3 scripts/readme-shots/compose.py <raw dir> <out dir>

<raw dir> holds the captures named below (native window captures at 2x, with transparent
corners, and iOS Simulator screenshots). Writes the hero (desktop + phone on the cream page)
and one image per view, quantized to 256-color PNGs so the set stays small.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

RAW, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

PAGE = (244, 234, 218)  # a shade under the app's own paper, so the window reads as a window
INK = (38, 30, 24)


def shadow(size, radius, blur, alpha):
    """A soft drop shadow for a rounded rectangle of `size`, with `blur` room on every side."""
    w, h = size
    pad = blur * 3
    m = Image.new("L", (w + 2 * pad, h + 2 * pad), 0)
    ImageDraw.Draw(m).rounded_rectangle((pad, pad, pad + w, pad + h), radius, fill=alpha)
    m = m.filter(ImageFilter.GaussianBlur(blur))
    s = Image.new("RGBA", m.size, (60, 40, 20, 0))
    s.putalpha(m)
    return s, pad


def rounded(im, radius):
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius, fill=255)
    out = im.convert("RGBA")
    out.putalpha(m)
    return out


def window(name, width):
    """A native window capture, scaled to `width`, cropped of any transparent margin."""
    im = Image.open(RAW / name).convert("RGBA")
    im = im.crop(im.getbbox())
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def phone(name, height):
    """A Simulator screenshot in a plain dark bezel with the screen's own rounded corners."""
    sc = Image.open(RAW / name).convert("RGB")
    sw = round(sc.width * height / sc.height)
    sc = sc.resize((sw, height), Image.LANCZOS)
    bez = max(8, round(sw * 0.035))
    radius = round(sw * 0.13)
    body = Image.new("RGBA", (sw + 2 * bez, height + 2 * bez), (0, 0, 0, 0))
    ImageDraw.Draw(body).rounded_rectangle((0, 0, body.width - 1, body.height - 1), radius + bez, fill=INK + (255,))
    body.alpha_composite(rounded(sc, radius), (bez, bez))
    return body


def place(canvas, im, xy, radius, blur=36, alpha=70, dy=18):
    s, pad = shadow(im.size, radius, blur, alpha)
    canvas.alpha_composite(s, (xy[0] - pad, xy[1] - pad + dy))
    canvas.alpha_composite(im, xy)


def save(im, name):
    """256-color PNG: screenshots of flat UI lose nothing visible and shrink 3-5x."""
    rgb = Image.new("RGB", im.size, PAGE)
    rgb.paste(im, mask=im.split()[-1] if im.mode == "RGBA" else None)
    q = rgb.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
    path = OUT / name
    q.save(path, optimize=True)
    print(f"{path}  {im.width}x{im.height}  {path.stat().st_size // 1024} KB")


def framed(im, margin):
    """One window on the page, with room for its shadow."""
    c = Image.new("RGBA", (im.width + 2 * margin, im.height + 2 * margin), PAGE + (255,))
    place(c, im, (margin, margin), radius=20)
    return c


# The hero: the conversation on the Mac, the same decision on the phone.
desk = window("conversation.png", 1640)
ph = phone("phone-sheet.png", round(desk.height * 0.86))
m = 72
W = m + desk.width + round(ph.width * 0.62) + m
H = m + desk.height + round(desk.height * 0.10) + m
hero = Image.new("RGBA", (W, H), PAGE + (255,))
place(hero, desk, (m, m), radius=22)
place(hero, ph, (W - m - ph.width, H - m - ph.height), radius=round(ph.width * 0.16), blur=40, alpha=90, dy=22)
save(hero, "hero.png")

for raw, out in [("onhand.png", "on-hand.png"), ("task.png", "task.png"), ("devices.png", "devices.png"), ("conversation.png", "conversation.png")]:
    if (RAW / raw).exists():
        save(framed(window(raw, 1600), 48), out)

for raw, out in [("phone-sheet.png", "phone-decision.png"), ("phone-conversation.png", "phone-conversation.png")]:
    if (RAW / raw).exists():
        p = phone(raw, 1400)
        c = Image.new("RGBA", (p.width + 120, p.height + 120), PAGE + (255,))
        place(c, p, (60, 52), radius=round(p.width * 0.16), blur=28, alpha=80)
        save(c, out)
