#!/usr/bin/env python3
"""Ducter's tab icons and app icons, from the one clay character master.

The tab icon is the character alone on a transparent ground (a browser tab must not
show a square), with enough air that it still reads at 16 px. The app icons stay
opaque: iOS and Android mask the tile themselves, and an Android ``maskable`` icon
keeps the character inside the safe zone (the middle 80% of the square).

    python3 tools/art/icons.py

writes apps/web/static/{favicon.ico,favicon-32.png,favicon-48.png,
icon-192.png,icon-512.png,icon-maskable-192.png,icon-maskable-512.png,
apple-touch-icon.png} and the same set for apps/site/public (its 192 is icon.png,
as the manifest names it). No new mascot: design/art/assets/alpha/ducter_idle.png
is the only source.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "design/art/assets/alpha/ducter_idle.png"
CREAM = (255, 246, 234, 255)

# The character's share of the shortest side. The tab icon keeps a margin at 16 px;
# the app tile matches the icons the apps already shipped; the maskable tile leaves
# the outer fifth clear, so a circular Android mask never cuts the feet or the book.
TAB = 0.88
APP = 0.65
MASKABLE = 0.60


def master() -> Image.Image:
    """The character, cropped to what is drawn: the source's own alpha bounds."""
    im = Image.open(MASTER).convert("RGBA")
    box = im.getbbox()
    if not box:
        raise SystemExit(f"icons: {MASTER} is empty")
    return im.crop(box)


def fitted(art: Image.Image, size: int, share: float) -> Image.Image:
    """The character scaled so its longest side is ``share`` of ``size``."""
    scale = size * share / max(art.size)
    return art.resize(
        (max(1, round(art.width * scale)), max(1, round(art.height * scale))),
        Image.LANCZOS,
    )


def tab_icon(art: Image.Image, size: int) -> Image.Image:
    """The character alone, centred, on true transparency."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    character = fitted(art, size, TAB)
    canvas.alpha_composite(
        character,
        ((size - character.width) // 2, (size - character.height) // 2),
    )
    return canvas


def app_icon(art: Image.Image, size: int, share: float) -> Image.Image:
    """The character on the warm paper tile, opaque, as iOS and Android receive it."""
    canvas = Image.new("RGBA", (size, size), CREAM)
    character = fitted(art, size, share)
    # A touch below centre: it stands on the tile rather than floating in it.
    top = (size - character.height) // 2 + round(size * 0.015)
    canvas.alpha_composite(character, ((size - character.width) // 2, top))
    return canvas


def save(image: Image.Image, *paths: Path) -> None:
    for path in paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path, "PNG", optimize=True)


def main() -> None:
    art = master()
    web = ROOT / "apps/web/static"
    site = ROOT / "apps/site/public"

    # Transparent tab icons. The 16 px frame rides in the .ico; 32 and 48 are named
    # for browsers that prefer a PNG and for the tab at 2x.
    frames = {s: tab_icon(art, s) for s in (16, 32, 48)}
    save(frames[32], web / "favicon-32.png", site / "favicon-32.png")
    save(frames[48], web / "favicon-48.png", site / "favicon-48.png")
    for folder in (web, site):
        frames[48].save(
            folder / "favicon.ico",
            format="ICO",
            sizes=[(16, 16), (32, 32), (48, 48)],
            append_images=[frames[16], frames[32]],
        )

    # Opaque app icons, with the maskable variant inside Android's safe zone.
    for size in (192, 512):
        save(
            app_icon(art, size, APP),
            web / f"icon-{size}.png",
            site / ("icon.png" if size == 192 else "icon-512.png"),
        )
        save(
            app_icon(art, size, MASKABLE),
            web / f"icon-maskable-{size}.png",
            site / f"icon-maskable-{size}.png",
        )
    touch = app_icon(art, 180, APP)
    save(touch, web / "apple-touch-icon.png", site / "apple-touch-icon.png")

    print("icons:", ", ".join(str(p.relative_to(ROOT)) for p in sorted(web.glob("*.png")) + sorted(site.glob("*.png"))))


if __name__ == "__main__":
    main()
