"""Build Hollowmere's village map from Liberated Pixel Cup tiles.

    python scripts/build_village.py <starter-kit> <cottage-preview.png>

<starter-kit> is a checkout of https://github.com/LiberatedPixelCup/RPG_Maker_MZ_LPC_Starter_Kit (a sparse
checkout of LPC/img/tilesets/LPC/Final Attributions/ and LPC/img/parallaxes/ is enough).
<cottage-preview.png> is the preview of bluecarrot16's "[LPC] Thatched-roof Cottage"
(https://opengameart.org/sites/default/files/preview_280.png): it shows finished cottages built from the
cottage, roof, door and window tiles, and we cut four of them out of it.

The map is 1280 x 720 pixels (40 x 22.5 tiles of 32px), shown at 1.25 world units per pixel so it fills
the game's 1600 x 900 world; the LPC characters are drawn at the same pixel scale. The ground is grass with
dirt roads, a river, a wheat field and a garden, autotiled by marching squares on the tile corners. Buildings,
trees and props are pasted in order of their base line. Writes:

    frontend/public/tiles/village.png    the map
    frontend/public/tiles/windmill.png   the windmill's 12 animation frames (the frontend animates it)
    frontend/public/tiles/CREDITS.md     who made each piece, and the licenses
    frontend/src/game/village.json       places, where villagers stand, lamps and the windmill, in world units
"""

import argparse
import json
import math
import random
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public" / "tiles"
META = ROOT / "frontend" / "src" / "game" / "village.json"

T = 32
MW, MH = 1280, 720
U = 1.25  # world units per map pixel
TW, TH = MW // T, -(-MH // T)

# ------------------------------------------------------------------ the layout (map pixels)

# Each place's door: villagers stand in front of it, roads start from it.
DOORS = {
    "tavern": (129, 240), "smithy": (493, 250), "manor": (860, 226), "square": (600, 392),
    "herbalist": (190, 520), "chapel": (600, 676), "riverside": (995, 652), "mill": (1090, 560),
}
# Where each villager stands, relative to their place's door.
STANDS = {
    "bess": ("tavern", 34, 16), "jonas": ("smithy", 40, 14), "wren": ("manor", 42, 14),
    "hale": ("square", -95, 2), "imogen": ("square", 92, 14), "tilly": ("square", -30, 48),
    "elena": ("herbalist", 38, 14), "aldric": ("chapel", 40, 12), "pip": ("riverside", -10, 4),
    "brann": ("mill", -50, 10),
}
PLAYER_HOME = ("square", 60, 46)
# Roads drawn on the map (the same curves the frontend uses for the walking-time badges).
ROADS = [("square", "tavern"), ("square", "smithy"), ("square", "herbalist"), ("square", "chapel"),
         ("herbalist", "chapel"), ("square", "manor"), ("manor", "mill"), ("chapel", "riverside"),
         ("riverside", "mill")]
SQUARE = (600, 392, 150, 60)  # the village square: an ellipse of dirt
RIVER = [(1310, 230), (1262, 330), (1250, 440), (1222, 560), (1150, 650), (1080, 700), (1030, 750)]
RIVER_HALF = 42
CELL = 16  # the walking grid, in map pixels
MILL_FRAMES = 12  # Casper Nilsson's windmill: 12 frames of 224 x 320
WHEAT = (40, 590, 200, 700)
GARDEN = (40, 420, 118, 505)
PASTURE = (790, 330, 960, 520)  # cows and sheep graze here
YARD = (40, 515, 130, 575)  # the herbalist's chickens
# Where smoke rises from each building, as fractions of its cut-out.
CHIMNEYS = {"tavern": [(0.78, 0.08)], "smithy": [(0.2, 0.12)], "manor": [(0.18, 0.06), (0.82, 0.06)], "herbalist": [(0.86, 0.4)], "chapel": []}


def road_curve(a: str, b: str, steps: int = 40) -> list[tuple[float, float]]:
    """The quadratic curve from one door to another, as in world.tsx's roadPath."""
    (px, py), (qx, qy) = DOORS[a], DOORS[b]
    cx = (px + qx) / 2 + (qy - py) * 0.12
    cy = (py + qy) / 2 - (qx - px) * 0.06 + 10
    pts = []
    for i in range(steps + 1):
        t = i / steps
        x = (1 - t) ** 2 * px + 2 * (1 - t) * t * cx + t * t * qx
        y = (1 - t) ** 2 * (py + 10) + 2 * (1 - t) * t * cy + t * t * (qy + 10)
        pts.append((x, y))
    return pts


def seg_dist(p, a, b) -> float:
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy or 1)))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))


def line_dist(p, pts) -> float:
    return min(seg_dist(p, pts[i], pts[i + 1]) for i in range(len(pts) - 1))


# ------------------------------------------------------------------ terrain

# Marching squares on tile corners: (top-left, top-right, bottom-left, bottom-right) -> LPC terrain tile.
PIECES = {
    (0, 0, 0, 1): (0, 2), (0, 0, 1, 1): (1, 2), (0, 0, 1, 0): (2, 2),
    (0, 1, 0, 1): (0, 3), (1, 0, 1, 0): (2, 3),
    (0, 1, 0, 0): (0, 4), (1, 1, 0, 0): (1, 4), (1, 0, 0, 0): (2, 4),
    (1, 1, 1, 0): (1, 0), (1, 1, 0, 1): (2, 0), (1, 0, 1, 1): (1, 1), (0, 1, 1, 1): (2, 1),
}


def tile(sheet: Image.Image, c: int, r: int, w: int = 1, h: int = 1) -> Image.Image:
    return sheet.crop((c * T, r * T, (c + w) * T, (r + h) * T))


def vertex_mask(inside) -> list[list[int]]:
    return [[1 if inside(i * T, j * T) else 0 for i in range(TW + 1)] for j in range(TH + 1)]


def no_diagonals(v: list[list[int]]) -> None:
    """Marching squares has no tile for two opposite corners: fill those in."""
    changed = True
    while changed:
        changed = False
        for j in range(TH):
            for i in range(TW):
                k = (v[j][i], v[j][i + 1], v[j + 1][i], v[j + 1][i + 1])
                if k in ((1, 0, 0, 1), (0, 1, 1, 0)):
                    v[j][i] = v[j][i + 1] = v[j + 1][i] = v[j + 1][i + 1] = 1
                    changed = True


def autotile(canvas: Image.Image, sheet: Image.Image, v: list[list[int]], rng: random.Random, fills=((1, 3),), variety=0.0) -> None:
    no_diagonals(v)
    for j in range(TH):
        for i in range(TW):
            k = (v[j][i], v[j][i + 1], v[j + 1][i], v[j + 1][i + 1])
            if k == (0, 0, 0, 0):
                continue
            if k == (1, 1, 1, 1):
                c, r = rng.choice(fills[1:]) if len(fills) > 1 and rng.random() < variety else fills[0]
            else:
                c, r = PIECES[k]
            canvas.alpha_composite(tile(sheet, c, r), (i * T, j * T))


# ------------------------------------------------------------------ cutting out buildings

def ground_flood(img: Image.Image, ground: set, keep: Image.Image | None = None) -> Image.Image:
    """Alpha mask: everything not reachable from the border through ground-coloured pixels."""
    W, H = img.size
    px = img.load()
    kp = keep.load() if keep else None
    outside = bytearray(W * H)
    q = deque([(x, 0) for x in range(W)] + [(x, H - 1) for x in range(W)] + [(0, y) for y in range(H)] + [(W - 1, y) for y in range(H)])
    while q:
        x, y = q.popleft()
        i = y * W + x
        if outside[i] or (kp and kp[x, y]) or px[x, y][:3] not in ground:
            continue
        outside[i] = 1
        if x > 0: q.append((x - 1, y))
        if x < W - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < H - 1: q.append((x, y + 1))
    return Image.frombytes("L", (W, H), bytes(0 if o else 255 for o in outside))


def colours(img: Image.Image, boxes) -> set:
    out = set()
    px = img.load()
    for x0, y0, x1, y1 in boxes:
        for y in range(y0, y1):
            for x in range(x0, x1):
                out.add(px[x, y][:3])
    return out


# The preview's buildings: bounding box, door (bottom centre), and wall areas to keep solid (their plaster
# shares colours with the dirt around them).
PREVIEW = {
    "tavern": ((202, 138, 514, 345), (291, 312), [(213, 240, 364, 328)]),
    "smithy": ((874, 391, 1186, 617), (947, 615), [(886, 495, 1168, 586)]),
    "manor": ((873, 121, 1374, 329), (963, 327), [(1206, 245, 1361, 329)]),
    "herbalist": ((426, 388, 577, 585), (481, 580), [(437, 500, 526, 576)]),
}
PREVIEW_GROUND = [(154, 231, 200, 370), (616, 346, 847, 400), (330, 600, 560, 700), (1250, 620, 1400, 700), (950, 640, 1100, 690)]
PREVIEW_GRID = (19, 25)  # the preview's tile grid starts here


def preview_buildings(preview: Path, A: Path) -> dict[str, tuple[Image.Image, tuple[int, int]]]:
    """The cut-out buildings, cached beside the preview (cutting them takes a minute or two)."""
    cache = preview.with_name(preview.stem + ".buildings")
    index = cache / "doors.json"
    if index.exists():
        doors = json.loads(index.read_text(encoding="utf-8"))
        return {n: (Image.open(cache / f"{n}.png").convert("RGBA"), tuple(d)) for n, d in doors.items()}
    out = cut_buildings(preview, A)
    cache.mkdir(exist_ok=True)
    for n, (img, _) in out.items():
        img.save(cache / f"{n}.png")
    index.write_text(json.dumps({n: d for n, (_, d) in out.items()}), encoding="utf-8")
    return out


def cut_buildings(preview: Path, A: Path) -> dict[str, tuple[Image.Image, tuple[int, int]]]:
    pv = Image.open(preview).convert("RGBA")
    sheets = [A / f"Bluecarrot16/{n}.png" for n in ("cottage", "thatched-roof", "doors", "windows")] + [
        A / "Sharm/house.png", A / "!!!Individual PNGS/windows_with_flowerboxes by Sharm, bluecarrot, and Casper Nilsson.png"]
    tiles = []
    for p in sheets:
        im = Image.open(p).convert("RGBA")
        for r in range(im.size[1] // T):
            for c in range(im.size[0] // T):
                t = tile(im, c, r)
                a = t.getchannel("A").point(lambda v: 255 if v == 255 else 0)
                n = a.histogram()[255]
                if n >= 24:
                    tiles.append((t.convert("RGB"), a, n))
    # A pixel is certainly building if it is exactly an opaque pixel of a building tile on the preview's grid.
    matched = Image.new("L", pv.size, 0)
    ox, oy = PREVIEW_GRID
    rgb = pv.convert("RGB")
    for (x0, y0, x1, y1), _, _ in PREVIEW.values():
        for y in range(oy + (y0 - oy) // T * T, y1, T):
            for x in range(ox + (x0 - ox) // T * T, x1, T):
                cell = rgb.crop((x, y, x + T, y + T))
                acc = Image.new("L", (T, T), 0)
                for t, a, n in tiles:
                    eq = ImageChops.difference(cell, t).convert("L").point(lambda v: 255 if v == 0 else 0)
                    m = ImageChops.multiply(eq, a)
                    k = m.histogram()[255]
                    if k >= 12 and k >= 0.5 * n:
                        acc = ImageChops.lighter(acc, m)
                matched.paste(acc, (x, y))
    ground = colours(pv, PREVIEW_GROUND) | {(0, 0, 0)}
    alpha = ground_flood(pv, ground, matched)
    out = {}
    for name, ((x0, y0, x1, y1), (dx, dy), solid) in PREVIEW.items():
        a = alpha.copy()
        d = ImageDraw.Draw(a)
        for r in solid:
            d.rectangle((r[0], r[1], r[2] - 1, r[3] - 1), fill=255)
        img = pv.copy()
        img.putalpha(a)
        img = img.crop((x0, y0, x1, y1))
        # Grass that clung to the roof edges.
        px = img.load()
        for y in range(img.size[1]):
            for x in range(img.size[0]):
                r_, g, b, al = px[x, y]
                inside = any(s[0] <= x + x0 < s[2] and s[1] <= y + y0 < s[3] for s in solid)
                if al and not inside and g > r_ + 20 and g > b + 10:
                    px[x, y] = (0, 0, 0, 0)
        # Below the door line under the walls is only the preview's ground and its tile outlines.
        for sx0, _, sx1, _ in solid:
            for y in range(dy - y0 + 1, img.size[1]):
                for x in range(sx0 - x0 - 2, min(sx1 - x0 + 2, img.size[0])):
                    px[x, y] = (0, 0, 0, 0)
        out[name] = (img, (dx - x0, dy - y0))
    return out


def stone_chapel(kit: Path) -> tuple[Image.Image, tuple[int, int]]:
    """The stone gable house from the starter kit's sample map, with a cross on the gable."""
    m = Image.open(kit / "LPC/img/parallaxes/map1.png").convert("RGBA")
    crop = m.crop((80, 600, 272, 840))
    ground = colours(m, [(300, 450, 500, 550)])
    crop.putalpha(ground_flood(crop, ground))
    crop = crop.crop(crop.getbbox())
    w, h = crop.size
    img = Image.new("RGBA", (w, h + 18), (0, 0, 0, 0))
    img.alpha_composite(crop, (0, 18))
    d = ImageDraw.Draw(img)
    cx = w // 2
    d.rectangle((cx - 2, 0, cx + 1, 21), fill=(58, 40, 24, 255))
    d.rectangle((cx - 6, 5, cx + 5, 8), fill=(58, 40, 24, 255))
    d.rectangle((cx - 1, 1, cx, 20), fill=(222, 184, 84, 255))
    d.rectangle((cx - 5, 6, cx + 4, 7), fill=(222, 184, 84, 255))
    return img, (cx, h + 18 - 1)


def gravestone(cross: bool) -> Image.Image:
    img = Image.new("RGBA", (14, 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((1, 14, 13, 19), fill=(20, 30, 20, 90))
    if cross:
        d.rectangle((5, 1, 8, 17), fill=(52, 50, 58, 255))
        d.rectangle((1, 4, 12, 7), fill=(52, 50, 58, 255))
        d.rectangle((6, 2, 7, 16), fill=(150, 146, 140, 255))
        d.rectangle((2, 5, 11, 6), fill=(150, 146, 140, 255))
    else:
        d.rounded_rectangle((2, 3, 11, 17), radius=4, fill=(52, 50, 58, 255))
        d.rounded_rectangle((3, 4, 10, 16), radius=3, fill=(146, 142, 136, 255))
        d.line((5, 8, 8, 8), fill=(110, 106, 100, 255))
        d.line((5, 11, 8, 11), fill=(110, 106, 100, 255))
    return img


def post_sign(plaque: Image.Image) -> Image.Image:
    """A wall plaque on a wooden post, so it can stand by a door."""
    img = Image.new("RGBA", (32, 52), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((9, 47, 23, 51), fill=(20, 30, 20, 90))
    d.rectangle((14, 20, 17, 49), fill=(58, 40, 24, 255))
    d.rectangle((15, 20, 16, 49), fill=(122, 82, 48, 255))
    img.alpha_composite(plaque, (0, 0))
    return img


# ------------------------------------------------------------------ main

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("kit", type=Path)
    ap.add_argument("preview", type=Path)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    A = args.kit / "LPC/img/tilesets/LPC/Final Attributions/Individual Assets"
    rng = random.Random(args.seed)
    load = lambda p: Image.open(A / p).convert("RGBA")
    grass, dirt, water = load("Sharm/grass.png"), load("Sharm/dirt.png"), load("Sharm/watergrass.png")
    wheat, soil, plants = load("Daniel Eddeland (Daneeklu)/wheat.png"), load("Daniel Eddeland (Daneeklu)/plowed_soil.png"), load("Daniel Eddeland (Daneeklu)/plants.png")
    objects, well, lilies = load("Sharm/Sharm Edits/Outside_B.png"), load("Xenodora/lpc-well.png"), load("Casper Nilsson/water_lilies.png")
    windmill = load("Casper Nilsson/windmill.png")

    canvas = Image.new("RGBA", (TW * T, TH * T), (0, 0, 0, 255))
    for j in range(TH):
        for i in range(TW):
            c, r = rng.choice([(0, 5), (1, 5), (2, 5)]) if rng.random() < 0.3 else (1, 3)
            canvas.alpha_composite(tile(grass, c, r), (i * T, j * T))

    curves = [road_curve(a, b) for a, b in ROADS]
    sx, sy, srx, sry = SQUARE
    in_water = lambda x, y: line_dist((x, y), RIVER) < RIVER_HALF
    in_road = lambda x, y: line_dist((x, y), RIVER) > RIVER_HALF + T and (
        ((x - sx) / srx) ** 2 + ((y - sy) / sry) ** 2 <= 1
        or any(line_dist((x, y), c) < 24 for c in curves)
        or any(math.hypot(x - dx, y - dy - 8) < 26 for dx, dy in DOORS.values()))
    in_rect = lambda r: (lambda x, y: r[0] <= x <= r[2] and r[1] <= y <= r[3])
    autotile(canvas, wheat, vertex_mask(in_rect(WHEAT)), rng)
    autotile(canvas, soil, vertex_mask(in_rect(GARDEN)), rng)
    water_v = vertex_mask(in_water)
    autotile(canvas, water, water_v, rng, fills=((1, 3), (0, 5), (1, 5), (2, 5)), variety=0.5)
    road_v = vertex_mask(in_road)
    autotile(canvas, dirt, road_v, rng, fills=((1, 3), (0, 5), (1, 5), (2, 5)), variety=0.35)

    # Lily pads on the river's still water.
    for i in range(10):
        x, y = rng.randrange(900, 1280), rng.randrange(260, 720)
        if line_dist((x, y), RIVER) < RIVER_HALF - 22:
            canvas.alpha_composite(tile(lilies, rng.randrange(3), rng.randrange(2)), (x - 16, y - 16))

    # ---- things standing on the ground, pasted in order of their base line
    blocked = Image.new("L", (MW, MH), 0)  # where trees may not go
    bd = ImageDraw.Draw(blocked)
    for j in range(TH):
        for i in range(TW):
            if any(v[jj][ii] for v in (road_v, water_v) for jj in (j, j + 1) for ii in (i, i + 1)):
                bd.rectangle((i * T - 8, j * T - 8, i * T + T + 8, j * T + T + 8), fill=255)
    for r in (WHEAT, GARDEN):
        bd.rectangle((r[0] - 10, r[1] - 10, r[2] + 10, r[3] + 10), fill=255)
    things: list[tuple[int, Image.Image, tuple[int, int]]] = []

    def put(img: Image.Image, x: int, y: int, base: int | None = None, block: int = 0) -> None:
        things.append((base if base is not None else y + img.size[1], img, (x, y)))
        if block:
            bd.rectangle((x - block, y - block, x + img.size[0] + block, y + img.size[1] + block), fill=255)

    buildings = preview_buildings(args.preview, A)
    buildings["chapel"] = stone_chapel(args.kit)
    chimneys = []
    for name, (img, (dx, dy)) in buildings.items():
        x, y = DOORS[name]
        put(img, x - dx, y - dy, base=y, block=14)
        w_, h_ = img.size
        chimneys += [(x - dx + w_ * fx, y - dy + h_ * fy) for fx, fy in CHIMNEYS.get(name, [])]

    # The windmill is animated in the frontend; keep its ground clear here.
    fw, fh = windmill.size[0] // MILL_FRAMES, windmill.size[1]
    mill_x, mill_y = DOORS["mill"][0] - fw // 2, DOORS["mill"][1] - fh + 20
    bd.rectangle((mill_x + 20, mill_y + 60, mill_x + fw - 20, mill_y + fh), fill=255)

    places_px = dict(DOORS)
    stands_px = {who: (DOORS[p][0] + dx, DOORS[p][1] + dy) for who, (p, dx, dy) in STANDS.items()}
    home = (DOORS[PLAYER_HOME[0]][0] + PLAYER_HOME[1], DOORS[PLAYER_HOME[0]][1] + PLAYER_HOME[2])
    for x, y in [*places_px.values(), *stands_px.values(), home]:
        bd.ellipse((x - 46, y - 40, x + 46, y + 70), fill=255)  # people and the place's name plate

    # The square: a well, and lamps.
    put(tile(well, 0, 0, 2, 2), sx - 32, sy - 52, block=8)
    lamp = objects.crop((224, 64, 256, 160))
    lamps = [(sx - 175, sy - 40), (sx + 168, sy - 40), (1050, 610)]
    for x, y in lamps:
        put(lamp, x - 16, y - 92, block=4)
    # Signs by the doors: the inn, the smith's sword, the herbalist's bottle.
    for place, (c, r), dx in (("tavern", (6, 11), 70), ("smithy", (6, 12), -62), ("herbalist", (6, 13), -48)):
        x, y = DOORS[place]
        put(post_sign(tile(objects, c, r)), x + dx - 16, y - 48, block=4)
    # Barrels by the tavern and the smithy.
    barrel, bucket = objects.crop((64, 0, 96, 64)), objects.crop((32, 0, 64, 32))
    for x, y in [(DOORS["tavern"][0] + 104, DOORS["tavern"][1] - 50), (DOORS["tavern"][0] + 132, DOORS["tavern"][1] - 44), (DOORS["smithy"][0] + 120, DOORS["smithy"][1] - 52)]:
        put(barrel, x, y, block=4)
    put(bucket, DOORS["smithy"][0] + 150, DOORS["smithy"][1] - 26, block=4)
    # The herbalist's garden.
    for i in range(6):
        c, r = rng.choice([(3, 3), (4, 3), (1, 3), (5, 3)])
        put(tile(plants, c, r), GARDEN[0] + 8 + (i % 3) * 22, GARDEN[1] + 6 + (i // 3) * 36)
    # Graves beside the chapel.
    cx, cy = DOORS["chapel"]
    for k in range(6):
        put(gravestone(k % 3 == 1), cx + 110 + (k % 3) * 26 + (k // 3) * 8, cy - 90 + (k // 3) * 34, block=6)

    # Trees: a wood around the village, a few in the gaps.
    oaks = [objects.crop((0, 64, 96, 201)), objects.crop((96, 64, 192, 201))]
    pines = [objects.crop((0, 201, 64, 352)), objects.crop((96, 201, 160, 352))]
    for y in range(-40, MH + 40, 30):
        for x in range(-30, MW + 30, 38):
            x2, y2 = x + rng.randrange(-12, 13), y + rng.randrange(-10, 11)
            edge = min(x2, MW - x2, y2, MH - y2)
            if rng.random() > (0.9 if edge < 70 else 0.5 if edge < 130 else 0.2):
                continue
            img = rng.choice(oaks + pines)
            w, h = img.size
            left, top = x2 - w // 2, y2 - h
            foot = (left + 14, top + h // 3, left + w - 14, y2 + 4)
            box = blocked.crop(foot)
            if box.getbbox():
                continue
            things.append((y2, img, (left, top)))
            bd.rectangle((left + 26, y2 - 40, left + w - 26, y2 + 6), fill=255)

    for _, img, (x, y) in sorted(things, key=lambda t: t[0]):
        canvas.alpha_composite(img, (x, y)) if x >= 0 and y >= 0 else paste_clipped(canvas, img, x, y)
    canvas = canvas.crop((0, 0, MW, MH))

    # Where passers-by may go, on a 16px grid: "walk" is road clear of every building, tree, prop and the
    # windmill; "clear" is any ground clear of them and of the river (for grazing animals).
    solid = Image.new("L", (MW, MH), 0)
    sd = ImageDraw.Draw(solid)
    for base, img, (x, y) in things:
        box = img.getbbox()
        if box:
            if img.size[1] >= 120 or img.size[0] >= 60:  # buildings, trees, the well: nobody walks over them
                sd.rectangle((x + box[0] - 2, y + box[1] - 2, x + box[2] + 2, y + box[3] + 2), fill=255)
            else:  # lamps, signs, barrels, graves, plants: only where they stand
                sd.rectangle((x + box[0] - 1, min(base, y + box[3]) - 10, x + box[2] + 1, y + box[3] + 1), fill=255)
    for place, (dx, dy) in DOORS.items():  # a way in at every door
        if place in buildings:
            sd.rectangle((dx - 14, dy - 6, dx + 14, dy + 56), fill=0)
    # The windmill is drawn above passers-by, so only its tower's base blocks the way.
    mill_base = (mill_x + 60, mill_y + 190, mill_x + fw - 40, mill_y + fh - 24)
    sd.rectangle(mill_base, fill=255)
    # The ground along the front of every building (and the mill) is open, so each doorway joins the roads.
    fronts = [(x - dx_, x - dx_ + img.size[0], y) for name, (img, (dx_, dy_)) in buildings.items() for x, y in [DOORS[name]]]
    fronts.append((mill_base[0], mill_base[2], DOORS["mill"][1]))
    walk, clear = [], []
    for gy in range(MH // CELL):
        wrow, crow = [], []
        for gx in range(MW // CELL):
            x0, y0 = gx * CELL, gy * CELL
            free = not solid.crop((x0, y0, x0 + CELL, y0 + CELL)).getbbox()
            cx, cy = x0 + CELL / 2, y0 + CELL / 2
            at_door = any(x0_ - 24 <= cx <= x1_ + 24 and dy - 6 <= cy <= dy + 56 for x0_, x1_, dy in fronts)
            tx, ty = int(cx // T), int(cy // T)  # dirt is drawn on every tile with a road corner
            dirt = any(road_v[ty + j][tx + i] for i in (0, 1) for j in (0, 1)) if ty < TH else False
            wrow.append("1" if free and (dirt or at_door) else "0")
            crow.append("1" if free and not in_water(cx, cy) and line_dist((cx, cy), RIVER) > RIVER_HALF + 8 else "0")
        walk.append("".join(wrow))
        clear.append("".join(crow))

    OUT.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(OUT / "village.png", optimize=True)
    windmill.save(OUT / "windmill.png", optimize=True)

    w = lambda p: {"x": round(p[0] * U), "y": round(p[1] * U)}
    meta = {
        "map": {"width": MW, "height": MH, "scale": U},
        "places": {k: w(v) for k, v in places_px.items()},
        "stands": {k: w(v) for k, v in stands_px.items()},
        "playerHome": w(home),
        "lamps": [w((x, y - 76)) for x, y in lamps],
        "windmill": {**w((mill_x, mill_y)), "frames": MILL_FRAMES, "width": round(fw * U), "height": round(fh * U)},
        "roads": [list(r) for r in ROADS],
        "river": [w(p) for p in RIVER],
        "chimneys": [w(p) for p in chimneys],
        "pasture": [*w(PASTURE[:2]).values(), *w(PASTURE[2:]).values()],
        "yard": [*w(YARD[:2]).values(), *w(YARD[2:]).values()],
        "grid": {"cell": CELL * U, "walk": walk, "clear": clear},
    }
    META.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    (OUT / "CREDITS.md").write_text(CREDITS, encoding="utf-8")
    print(f"village.png {MW}x{MH}, {len(things)} things; village.json; windmill.png; CREDITS.md")


def paste_clipped(canvas: Image.Image, img: Image.Image, x: int, y: int) -> None:
    cx, cy = max(0, -x), max(0, -y)
    if cx < img.size[0] and cy < img.size[1]:
        canvas.alpha_composite(img.crop((cx, cy, img.size[0], img.size[1])), (x + cx, y + cy))


CREDITS = """# Village map credits

`village.png` and `windmill.png` are made from Liberated Pixel Cup (LPC) art, taken from the
[RPG Maker MZ LPC Starter Kit](https://github.com/LiberatedPixelCup/RPG_Maker_MZ_LPC_Starter_Kit) (which
keeps each artist's files and attributions) and from OpenGameArt.org. The map is a derivative work, shared
under CC-BY-SA 3.0 (the pieces are also available under GPL 3.0, and some under CC-BY 3.0 / OGA-BY 3.0).
Built by `scripts/build_village.py`. The gravestones and the chapel's cross are drawn by the script.

## Ground
- Grass, dirt, water with grass banks: "Liberated Pixel Cup (LPC) Base Assets" by Lanea Zimmerman (Sharm),
  CC-BY-SA 3.0 / CC-BY 3.0 / GPL 3.0 / OGA-BY 3.0.
  https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles
- Wheat, plowed ground, garden plants: "LPC Farming tilesets" by Daniel Eddeland, CC-BY-SA 3.0 / GPL 3.0.
  https://opengameart.org/content/lpc-farming-tilesets-magic-animations-and-ui-elements
- Lily pads: Casper Nilsson, "LPC art entry", CC-BY-SA 3.0 / GPL 3.0. http://opengameart.org/content/lpc-cnilsson

## Buildings
- The tavern, smithy, manor and herbalist's cottage are cut from the preview of "[LPC] Thatched-roof Cottage"
  by bluecarrot16, CC-BY-SA 3.0 / GPL 3.0 (https://opengameart.org/content/lpc-thatched-roof-cottage), based on
  "LPC Base Assets" by Lanea Zimmerman (Sharm) and Daniel Armstrong (HughSpectrum) and "LPC art entry" by
  Casper Nilsson; with "LPC Windows & Doors" by bluecarrot16, Lanea Zimmerman (Sharm), Daniel Armstrong
  (HughSpectrum), Casper Nilsson, Anamaris and Krusmira, CC-BY-SA 3.0 / GPL 3.0
  (https://opengameart.org/content/lpc-windows-doors), and window flower boxes by Sharm, bluecarrot16 and
  Casper Nilsson.
- The chapel is the stone house from the starter kit's sample map, made from its Exterior tiles: house tiles by
  Lanea Zimmerman (Sharm), grey roof by Casper Nilsson, grey home assets by Skyler Robert Collady;
  CC-BY-SA 3.0 / GPL 3.0.
- The windmill: Casper Nilsson, "LPC art entry", CC-BY-SA 3.0 / GPL 3.0. http://opengameart.org/content/lpc-cnilsson

## Trees and props
- Oaks, pines, barrels, bucket, lamp posts and the INN / smith / potion signs: Lanea Zimmerman (Sharm),
  LPC Base Assets, as edited in the starter kit ("Sharm Edits"); CC-BY-SA 3.0 / GPL 3.0.
- The well: Xenodora, CC-BY 3.0 / GPL 3.0.
"""


if __name__ == "__main__":
    main()
