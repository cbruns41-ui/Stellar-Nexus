"""Manual pad centers read from the labeled 2% grid."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ASSETS = Path(__file__).resolve().parent.parent / "public" / "assets" / "colony"
OUT = Path(__file__).resolve().parent
ISO = ASSETS / "buildings-iso"

# name -> (desktop_x, desktop_y, mobile_x, mobile_y, size)
# Positions are percent of the vista image; they sit in petal dirt, not on roads.
PLOTS = {
    "command":         (50.0, 56.2, 50.0, 71.2, "capital"),
    "robotics":        (45.4, 48.6, 43.8, 64.6, "medium"),
    "shield":          (42.0, 43.6, 39.5, 59.4, "medium"),
    "fusion":          (54.6, 48.6, 56.2, 64.6, "medium"),
    "energy_array":    (57.4, 44.4, 60.5, 59.4, "large"),
    "silo":            (62.4, 51.6, 64.0, 69.4, "medium"),
    "nanite":          (68.2, 47.6, 73.0, 65.4, "medium"),
    "titan_extractor": (74.2, 45.0, 82.0, 63.2, "mini"),
    "citadel":         (63.2, 59.2, 64.2, 76.0, "large"),
    "quantum_lab":     (70.4, 61.6, 75.0, 78.0, "medium"),
    "helium_well":     (77.0, 63.8, 84.0, 80.4, "mini"),
    "shipyard":        (56.4, 65.0, 56.6, 79.6, "large"),
    "defense_hub":     (60.2, 71.4, 61.0, 85.6, "large"),
    "habitat":         (62.4, 77.2, 66.0, 89.4, "micro"),
    "uplink":          (43.6, 65.0, 43.4, 79.6, "mini"),
    "colony_dock":     (39.8, 71.4, 39.0, 85.6, "micro"),
    "beacon":          (37.6, 77.2, 34.0, 89.4, "micro"),
    "jumpgate":        (36.8, 59.2, 35.8, 76.0, "medium"),
    "archive":         (29.6, 61.6, 25.0, 78.0, "large"),
    "spy_center":      (23.0, 63.8, 16.0, 80.4, "micro"),
    "matter_mine":     (37.6, 51.6, 36.0, 69.4, "mini"),
    "diamond_forge":   (25.8, 45.0, 18.0, 63.2, "mini"),
}

SIZES = {"capital": 0.13, "large": 0.10, "medium": 0.085, "mini": 0.07, "micro": 0.06}


def font(n):
    try:
        return ImageFont.truetype("C:/Windows/Fonts/consola.ttf", n)
    except OSError:
        return ImageFont.load_default()


def overlay(src, out, mobile=False):
    im = Image.open(ASSETS / src).convert("RGBA")
    W, H = im.size
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f = font(13)
    for name, (x, y, mx, my, _sz) in PLOTS.items():
        px = (mx if mobile else x) / 100 * W
        py = (my if mobile else y) / 100 * H
        col = (80, 255, 255, 255) if name == "command" else (255, 210, 40, 255)
        d.ellipse((px - 9, py - 9, px + 9, py + 9), outline=col, width=3)
        d.line((px - 12, py, px + 12, py), fill=col, width=1)
        d.line((px, py - 12, px, py + 12), fill=col, width=1)
        d.text((px + 10, py - 10), name, fill=col, font=f)
    Image.alpha_composite(im, layer).convert("RGB").save(OUT / out, quality=94)
    print("wrote", out)


def composite():
    land = Image.open(ASSETS / "base-iso-planet.jpg").convert("RGBA")
    W, H = land.size
    pad = Image.open(ASSETS / "empty-pad-iso.png").convert("RGBA")
    items = []
    for name, (x, y, mx, my, size) in PLOTS.items():
        items.append((y, name, x, y, size, True))
    for y, name, x, yy, size, built in sorted(items):
        if built:
            sp = Image.open(ISO / f"{name}.png").convert("RGBA")
            w = int(W * SIZES[size])
            anchor = 0.78
        else:
            sp = pad
            w = int(W * (0.072 if size in ("mini", "micro") else 0.08 if size != "capital" else 0.10))
            anchor = 0.55
        h = int(sp.height * w / sp.width)
        sp = sp.resize((w, h), Image.Resampling.LANCZOS)
        px = int(W * x / 100 - w / 2)
        py = int(H * yy / 100 - h * anchor)
        land.alpha_composite(sp, (max(0, px), max(0, py)))
    land.convert("RGB").save(OUT / "composite-v2.jpg", quality=92)
    print("wrote composite-v2.jpg")


overlay("base-iso-planet.jpg", "manual-desktop.jpg", False)
overlay("base-iso-planet-mobile.jpg", "manual-mobile.jpg", True)
composite()
