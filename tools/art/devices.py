"""Device clay in the sizes the apps load (D263: a tablet and a foldable beside the phone).

Masters: design/art/assets/alpha/<name>.png (1024 px, straight alpha), generated from
design/art/assets/batch_forms.json (style prompts/_style.md; the first reference, raw/ref_phone.png,
is alpha/phone.png flattened onto the style's #FFF4E6), picked beside the phone, and cut out with
design/art/assets/tools/cut.swift, the way phone.png was made.

Each master is cut to its alpha's bounds with a 10 px margin (the phone's), then
  Mac:  apps/desktop/internal/theme/art/clay/<name>@640.png  640 px on the long side
  Web:  apps/web/static/art/dev_<name>.webp                 the phone's 308 px tall, else 320 wide
(served by packages/core/src/web.ts).

    python3 tools/art/devices.py            # every device below
    python3 tools/art/devices.py tablet     # one
"""

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ALPHA = ROOT / "design/art/assets/alpha"
MAC = ROOT / "apps/desktop/internal/theme/art/clay"
WEB = ROOT / "apps/web/static/art"
NAMES = ["tablet", "foldable"]
PAD = 10


def cut(name: str) -> Image.Image:
    im = Image.open(ALPHA / f"{name}.png").convert("RGBA")
    l, t, r, b = im.getbbox()
    box = (max(l - PAD, 0), max(t - PAD, 0), min(r + PAD, im.width), min(b + PAD, im.height))
    return im.crop(box)


def fit(im: Image.Image, w: int | None = None, h: int | None = None) -> Image.Image:
    if w is None:
        w = round(im.width * h / im.height)
    if h is None:
        h = round(im.height * w / im.width)
    return im.resize((w, h), Image.LANCZOS)


def write(name: str) -> None:
    im = cut(name)
    long = max(im.size)
    mac = fit(im, w=640) if im.width == long else fit(im, h=640)
    mac.save(MAC / f"{name}@640.png", optimize=True)
    web = fit(im, h=308) if im.height > im.width else fit(im, w=320)
    web.save(WEB / f"dev_{name}.webp", quality=88, alpha_quality=100, method=6, exact=True)
    print(name, mac.size, (MAC / f"{name}@640.png").stat().st_size, "bytes;", web.size, (WEB / f"dev_{name}.webp").stat().st_size, "bytes")


for n in sys.argv[1:] or NAMES:
    write(n)
