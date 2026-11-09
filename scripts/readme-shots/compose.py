"""Compose the README's images from the raw captures.

    python3 scripts/readme-shots/compose.py <raw dir> <out dir>

<raw dir> holds the desktop views rendered headless at 2x by
apps/desktop/internal/views/readme_shots_test.go (conversation, onhand, task-diff, devices,
partner) and the iOS Simulator's phone-sheet.png. Keep both folders outside git (D75), e.g.
~/dev/ducter-evidence/readme/{raw,out}. Writes a lossless PNG and a WebP (cwebp -q 82) per
image; only the WebPs the README shows are copied into .github/readme. Needs cwebp on PATH.
"""

import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

RAW, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

PAGE = (244, 234, 218)  # a shade under the app's own paper, so the window reads as a window
INK = (38, 30, 24)
LIGHTS = [((255, 95, 87), (224, 68, 62)), ((254, 188, 46), (222, 161, 35)), ((40, 200, 64), (29, 173, 43))]


def shadow(size, radius, blur, alpha):
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


def window(name, width, crop=None, lights=True):
    """A headless 2x render as a macOS window: rounded corners, the three window buttons where
    the app leaves room for them (views.TrafficLights), a hairline edge."""
    im = Image.open(RAW / name).convert("RGB")
    if crop:
        im = im.crop(crop)
    if lights:
        d = ImageDraw.Draw(im)
        for i, (fill, edge) in enumerate(LIGHTS):  # 12-pt buttons, 8-pt gaps, from x 20, centered in the 60-pt bar
            cx, cy, r = 2 * (20 + 6 + 20 * i), 2 * 30, 12
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fill, outline=edge, width=1)
    im = rounded(im, 22)
    edge = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(edge).rounded_rectangle((0, 0, im.width - 1, im.height - 1), 22, outline=(0, 0, 0, 38), width=2)
    im.alpha_composite(edge)
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
    rgb = Image.new("RGB", im.size, PAGE)
    rgb.paste(im, mask=im.split()[-1] if im.mode == "RGBA" else None)
    png = OUT / (name + ".png")
    rgb.save(png)
    webp = png.with_suffix(".webp")
    subprocess.run(["cwebp", "-quiet", "-q", "82", str(png), "-o", str(webp)], check=True)
    print(f"{webp}  {im.width}x{im.height}  {webp.stat().st_size // 1024} KB")


def framed(im, margin=44):
    c = Image.new("RGBA", (im.width + 2 * margin, im.height + 2 * margin), PAGE + (255,))
    place(c, im, (margin, margin - 8), radius=18, blur=24, alpha=60, dy=12)
    return c


# The hero: the conversation on the Mac, the same decision on the phone.
desk = window("conversation.png", 1640)
ph = phone("phone-sheet.png", round(desk.height * 0.9))
m = 72
W = m + desk.width + round(ph.width * 0.6) + m
H = m + desk.height + round(desk.height * 0.12) + m
hero = Image.new("RGBA", (W, H), PAGE + (255,))
place(hero, desk, (m, m), radius=22)
place(hero, ph, (W - m - ph.width, H - m - ph.height), radius=round(ph.width * 0.16), blur=40, alpha=90, dy=22)
save(hero, "hero")

# The views, each a window on the page (1200 wide: sharp at the README's half-width columns).
save(framed(window("onhand.png", 1200)), "on-hand")
save(framed(window("task-diff.png", 1200, crop=(0, 0, 2560, 2400))), "task")
save(framed(window("devices.png", 1200)), "devices")
# Partner: the AI agents on this Mac and the two cards under them (the loadout), no title bar.
save(framed(window("partner.png", 1200, crop=(200, 660, 2360, 1840), lights=False)), "partner")
