"""Build the sprites for Hollowmere's passing life: a horse and hay cart, a rowboat, cows, sheep and chickens.

    python scripts/build_life.py <starter-kit> <animals-dir>

<starter-kit> is the RPG Maker MZ LPC Starter Kit checkout that scripts/build_village.py uses (for the rowboat
from Daniel Eddeland's farming and fishing tiles). <animals-dir> holds these OpenGameArt downloads:

    horse-brown_0.png                                  https://opengameart.org/content/lpc-horses
    cow_walk.png cow_eat.png sheep_walk.png sheep_eat.png chicken_walk.png chicken_eat.png
                                                       https://opengameart.org/content/lpc-style-farm-animals

Every animal sheet is rows of frames, one row per direction (up, left, down, right); the walk and eat sheets are
stacked (walk rows first). The hay cart is drawn here, one 64px frame per direction. Writes
frontend/public/life/*.png, frontend/public/life/CREDITS.md and frontend/src/game/life.json (frame sizes and where
each sprite's feet are, in sprite pixels).
"""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public" / "life"
META = ROOT / "frontend" / "src" / "game" / "life.json"


def stack(*sheets: Image.Image) -> Image.Image:
    w = max(s.size[0] for s in sheets)
    out = Image.new("RGBA", (w, sum(s.size[1] for s in sheets)), (0, 0, 0, 0))
    y = 0
    for s in sheets:
        out.alpha_composite(s, (0, y))
        y += s.size[1]
    return out


def feet(sheet: Image.Image, frame: int, row: int) -> int:
    """The lowest opaque row of a front-facing frame: where the sprite stands."""
    box = sheet.crop((0, row * frame, frame, (row + 1) * frame)).getbbox()
    return box[3] if box else frame


# The LPC palette for wood, iron and hay.
LINE, DARK, WOOD, LIGHT = (43, 26, 16, 255), (94, 58, 30, 255), (138, 90, 48, 255), (176, 122, 66, 255)
IRON, HAY, HAY_DARK, HAY_LIGHT = (62, 60, 66, 255), (217, 180, 90, 255), (166, 128, 52, 255), (240, 214, 132, 255)


def hay(d: ImageDraw.ImageDraw, x0: int, y0: int, x1: int, y1: int) -> None:
    d.ellipse((x0, y0, x1, y1), fill=HAY, outline=HAY_DARK)
    for k in range(5):
        x = x0 + 4 + k * (x1 - x0 - 8) // 4
        d.line((x, y0 + 4 + k % 2 * 3, x + 3, y0 + 9 + k % 2 * 3), fill=HAY_DARK)
        d.line((x + 1, y0 + 3, x + 2, y0 + 5), fill=HAY_LIGHT)


def wheel(d: ImageDraw.ImageDraw, cx: int, cy: int, r: int) -> None:
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=LINE, width=1)
    d.ellipse((cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1), outline=DARK, width=2)
    for dx, dy in ((r - 2, 0), (0, r - 2), (-(r - 2), 0), (0, -(r - 2))):
        d.line((cx, cy, cx + dx, cy + dy), fill=WOOD)
    d.rectangle((cx - 1, cy - 1, cx + 1, cy + 1), fill=IRON)


def cart_frames() -> Image.Image:
    """A hay cart, 64px frames for up, left, down, right (the horse is in front of it)."""
    out = Image.new("RGBA", (256, 64), (0, 0, 0, 0))
    # Side view, facing right (the horse is to the right); left is its mirror.
    side = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(side)
    d.ellipse((8, 54, 52, 60), fill=(0, 0, 0, 70))
    d.line((47, 39, 63, 35), fill=LINE, width=3)
    d.line((47, 39, 63, 35), fill=WOOD, width=1)
    hay(d, 8, 16, 47, 36)
    d.rectangle((5, 29, 49, 42), fill=WOOD, outline=LINE)
    d.line((6, 30, 48, 30), fill=LIGHT)
    for y in (34, 38):
        d.line((6, y, 48, y), fill=DARK)
    for x in (12, 27, 42):
        d.line((x, 31, x, 41), fill=DARK)
    wheel(d, 22, 46, 9)
    # Front view (moving down: the horse is below) and back view (moving up).
    front = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(front)
    d.ellipse((12, 52, 52, 60), fill=(0, 0, 0, 70))
    hay(d, 17, 14, 47, 34)
    d.rectangle((14, 28, 50, 44), fill=WOOD, outline=LINE)
    d.line((15, 29, 49, 29), fill=LIGHT)
    for y in (33, 38):
        d.line((15, y, 49, y), fill=DARK)
    for x in (9, 50):
        d.rectangle((x, 34, x + 5, 56), fill=DARK, outline=LINE)
        d.line((x + 2, 36, x + 2, 54), fill=WOOD)
    back = front.copy()
    d = ImageDraw.Draw(front)
    for x0, x1 in ((24, 26), (40, 38)):
        d.line((x0, 44, x1, 63), fill=LINE, width=3)
        d.line((x0, 44, x1, 63), fill=WOOD, width=1)
    out.alpha_composite(back, (0, 0))
    out.alpha_composite(side.transpose(Image.FLIP_LEFT_RIGHT), (64, 0))
    out.alpha_composite(front, (128, 0))
    out.alpha_composite(side, (192, 0))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("kit", type=Path)
    ap.add_argument("animals", type=Path)
    args = ap.parse_args()
    A = args.animals
    load = lambda name: Image.open(A / name).convert("RGBA")
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {}

    horse = load("horse-brown_0.png").crop((0, 4 * 128, 512, 8 * 128))  # rows 4-7: the walk cycle
    horse.save(OUT / "horse.png", optimize=True)
    meta["horse"] = {"frame": 128, "frames": 4, "feet": feet(horse, 128, 2)}
    for animal in ("cow", "sheep"):
        sheet = stack(load(f"{animal}_walk.png"), load(f"{animal}_eat.png"))
        sheet.save(OUT / f"{animal}.png", optimize=True)
        meta[animal] = {"frame": 128, "frames": 4, "feet": feet(sheet, 128, 2)}
    chicken = stack(load("chicken_walk.png"), load("chicken_eat.png"))
    chicken.save(OUT / "chicken.png", optimize=True)
    meta["chicken"] = {"frame": 32, "frames": 4, "feet": feet(chicken, 32, 2)}

    cart = cart_frames()
    cart.save(OUT / "cart.png", optimize=True)
    meta["cart"] = {"frame": 64, "frames": 1, "feet": 58}

    farming = Image.open(args.kit / "LPC/img/tilesets/LPC/Final Attributions/Individual Assets/Daniel Eddeland (Daneeklu)/farming_fishing.png").convert("RGBA")
    boat = farming.crop((224, 448, 352, 512))
    boat = boat.crop(boat.getbbox())
    boat.save(OUT / "boat.png", optimize=True)
    meta["boat"] = {"width": boat.size[0], "height": boat.size[1]}

    META.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    (OUT / "CREDITS.md").write_text(CREDITS, encoding="utf-8")
    print("life:", ", ".join(meta))


CREDITS = """# Village life credits

Built by `scripts/build_life.py`. The hay cart is drawn by the script.

- `horse.png`: "[LPC] Horses" by bluecarrot16, CC-BY 3.0 / CC-BY-SA 3.0 / GPL 3.0 / GPL 2.0 / OGA-BY 3.0.
  https://opengameart.org/content/lpc-horses (the walk cycle of horse-brown).
- `cow.png`, `sheep.png`, `chicken.png`: "LPC style farm animals" by Daniel Eddeland (daneeklu), commissioned by
  tebruno99; CC-BY 3.0 / GPL 2.0. https://opengameart.org/content/lpc-style-farm-animals
- `boat.png`: the rowboat from "LPC Farming tilesets, magic animations and UI elements" by Daniel Eddeland,
  CC-BY-SA 3.0 / GPL 3.0. https://opengameart.org/content/lpc-farming-tilesets-magic-animations-and-ui-elements
"""


if __name__ == "__main__":
    main()
