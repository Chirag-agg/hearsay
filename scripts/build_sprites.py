"""Build the villagers' LPC sprite sheets from a checkout of the LPC character generator.

    python scripts/build_sprites.py <generator-checkout> --list   # the files to check out
    python scripts/build_sprites.py <generator-checkout>          # build frontend/public/sprites/

<generator-checkout> is https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator
(a sparse clone with sheet_definitions/, palette_definitions/ and the files --list prints is enough).

Each character in scripts/sprites.json is a stack of LPC layers (body, head, hair, clothes, hat...).
Layers that come in pre-coloured variants are read as-is; layers that are drawn in a base palette are
recoloured to the chosen palette, the way the generator does it. Layers are composited in zPos order
into one walk sheet per character (9 frames x 4 directions, 64x64 each: up, left, down, right);
where each sheet's head and feet are goes to frontend/src/game/sprites.json.
Credits for every file used are written to frontend/public/sprites/CREDITS.md, from the generator's
own sheet definitions. The art is CC-BY-SA / OGA-BY / GPL: the credits file must ship with it.
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "scripts" / "sprites.json"
OUT = ROOT / "frontend" / "public" / "sprites"
META = ROOT / "frontend" / "src" / "game" / "sprites.json"
ANIM = "walk"


class Lpc:
    def __init__(self, checkout: Path):
        self.root = checkout
        self.defs = {p.stem: p for p in (checkout / "sheet_definitions").rglob("*.json")}
        self.palettes: dict[str, dict[str, list[str]]] = {}
        self.bases: dict[str, str] = {}
        # ULPC palettes first: the base palettes (hair "orange", cloth "white"...) are ULPC ones, and
        # the LPCR files reuse some of the same names with different colours.
        files = sorted((checkout / "palette_definitions").rglob("*.json"), key=lambda p: ("_ulpc" not in p.name, p.name))
        for p in files:
            data = json.loads(p.read_text(encoding="utf-8"))
            if p.name.startswith("meta_") and "base" in data:
                self.bases[p.parent.name] = data["base"]
            elif not p.name.startswith("meta"):
                for name, colors in data.items():
                    self.palettes.setdefault(p.parent.name, {}).setdefault(name, colors)

    def definition(self, item: str) -> dict:
        if item not in self.defs:
            raise SystemExit(f"unknown LPC item {item!r}")
        return json.loads(self.defs[item].read_text(encoding="utf-8"))

    def channels(self, d: dict) -> list[dict]:
        rc = d.get("recolors")
        if not rc:
            return []
        if isinstance(rc, list):
            rc = rc[0]
        if "material" in rc:
            return [rc]
        return [v for k, v in sorted(rc.items()) if k.startswith("color_")]

    def palette(self, material: str, name: str) -> list[str]:
        if name not in self.palettes.get(material, {}):
            raise SystemExit(f"no {material} palette {name!r}; have {sorted(self.palettes.get(material, {}))}")
        return self.palettes[material][name]

    def layers(self, item: str, body: str, color) -> list[tuple[int, Path, list[tuple[list[str], list[str]]]]]:
        """(zPos, file, [(source colors, target colors)]) for each layer of an item on this body type."""
        d = self.definition(item)
        out = []
        for key, layer in d.items():
            if not key.startswith("layer_") or body not in layer:
                continue
            path = layer[body].rstrip("/")
            if "variants" in d:
                variant = str(color).replace(" ", "_")
                file = self.root / "spritesheets" / path / ANIM / f"{variant}.png"
                maps = []
            else:
                file = self.root / "spritesheets" / path / f"{ANIM}.png"
                colors = color if isinstance(color, list) else [color]
                maps = []
                for ch, target in zip(self.channels(d), colors):
                    if target is None:
                        continue
                    material = ch["material"]
                    source = ch.get("source") or self.palette(material, ch.get("base") or self.bases[material])
                    maps.append((source, self.palette(material, target)))
            out.append((layer.get("zPos", 0), file, maps))
        if not out:
            raise SystemExit(f"{item} has no layer for body type {body!r}")
        return out

    def credits(self, item: str, file: Path) -> list[dict]:
        rel = file.relative_to(self.root / "spritesheets").as_posix()
        return [c for c in self.definition(item).get("credits", []) if rel.startswith(c["file"].rstrip("/"))]


def hexrgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def recolor(img, maps):
    if not maps:
        return img
    table = {}
    for source, target in maps:
        for s, t in zip(source, target):
            table[hexrgb(s)] = hexrgb(t)
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and (r, g, b) in table:
                px[x, y] = (*table[(r, g, b)], a)
    return img


def plan(lpc: Lpc, spec: dict) -> dict[str, list]:
    out = {}
    for who, c in spec["characters"].items():
        body = c["body"]
        stack = [("body", c["skin"]), (c["head"], [c["skin"], c.get("eyes", "brown")])]
        stack += [(item, color) for item, color in c["layers"]]
        layers = []
        for item, color in stack:
            for z, file, maps in lpc.layers(item, body, color):
                layers.append((z, item, file, maps))
        out[who] = sorted(layers, key=lambda layer: layer[0])
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("checkout", type=Path)
    ap.add_argument("--list", action="store_true", help="print the sprite files needed (for a sparse checkout)")
    args = ap.parse_args()
    lpc = Lpc(args.checkout)
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    layers = plan(lpc, spec)

    if args.list:
        files = sorted({f.relative_to(args.checkout).as_posix() for ls in layers.values() for _, _, f, _ in ls})
        print("\n".join(files))
        return

    from PIL import Image

    OUT.mkdir(parents=True, exist_ok=True)
    credits: dict[tuple, dict] = {}
    manifest = {}
    for who, ls in layers.items():
        sheet = None
        for z, item, file, maps in ls:
            if not file.exists():
                sys.exit(f"missing {file} (check it out first: --list)")
            img = recolor(Image.open(file).convert("RGBA"), maps)
            sheet = img if sheet is None else Image.alpha_composite(sheet, img.resize(sheet.size) if img.size != sheet.size else img)
            for c in lpc.credits(item, file):
                credits[(c["file"],)] = c
        sheet.save(OUT / f"{who}.png", optimize=True)
        # The standing, front-facing frame's bounds: the top of the head and the feet.
        _, top, _, bottom = sheet.crop((0, 128, 64, 192)).getbbox()
        manifest[who] = {"top": top, "bottom": bottom}
        print(f"{who:<10} {len(ls)} layers -> {who}.png")
    META.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    lines = ["# Sprite credits", "",
             "The character sprites in this folder are composed from the Liberated Pixel Cup (LPC) art collected in the",
             "[Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator).",
             "They are used under the licenses below (each piece under one or more of CC-BY-SA 3.0/4.0, OGA-BY 3.0, GPL 3.0,",
             "CC-BY, CC0). Our composed sheets are derivative works and are shared under the same terms.",
             "Built by `scripts/build_sprites.py` from `scripts/sprites.json`.", ""]
    for c in sorted(credits.values(), key=lambda c: c["file"]):
        lines.append(f"## {c['file']}")
        lines.append(f"- Authors: {', '.join(c.get('authors', []))}")
        lines.append(f"- Licenses: {', '.join(c.get('licenses', []))}")
        if c.get("notes"):
            lines.append(f"- Notes: {c['notes']}")
        for u in c.get("urls", []):
            lines.append(f"- {u}")
        lines.append("")
    (OUT / "CREDITS.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"credits: {len(credits)} entries -> CREDITS.md")


if __name__ == "__main__":
    main()
