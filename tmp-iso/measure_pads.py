"""Place pads on radial midlines of the 8 dirt petals + center."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ASSETS = Path(__file__).resolve().parent.parent / "public" / "assets" / "colony"
OUT = Path(__file__).resolve().parent

# Petal centroids read from the 2% grid (percent of image).
# 8 petals around the inner plaza, clockwise from NNE.
DESK_CENTER = (50.0, 56.0)
DESK_PETALS = {
    "nne": (58.0, 45.5),
    "ene": (70.5, 49.5),
    "ese": (72.5, 61.0),
    "sse": (59.5, 72.5),
    "ssw": (40.5, 72.5),
    "wsw": (27.5, 61.0),
    "wnw": (29.5, 49.5),
    "nnw": (42.0, 45.5),
}
# Mobile plaza is lower in the portrait frame.
MOB_CENTER = (50.0, 71.2)
MOB_PETALS = {
    "nne": (58.5, 61.5),
    "ene": (74.0, 66.0),
    "ese": (76.0, 77.5),
    "sse": (62.0, 84.8),
    "ssw": (38.0, 84.8),
    "wsw": (24.0, 77.5),
    "wnw": (26.0, 66.0),
    "nnw": (41.5, 61.5),
}

# inner / mid / outer along center->centroid. None = skip that slot.
SLOTS = {
    "nne": [("fusion", 0.70), ("energy_array", 1.15)],
    "ene": [("silo", 0.58), ("nanite", 0.90), ("titan_extractor", 1.22)],
    "ese": [("citadel", 0.58), ("quantum_lab", 0.90), ("helium_well", 1.22)],
    "sse": [("shipyard", 0.58), ("defense_hub", 0.90), ("habitat", 1.22)],
    "ssw": [("uplink", 0.58), ("colony_dock", 0.90), ("beacon", 1.22)],
    "wsw": [("jumpgate", 0.58), ("archive", 0.90), ("spy_center", 1.22)],
    "wnw": [("matter_mine", 0.58), ("diamond_forge", 1.22)],
    "nnw": [("robotics", 0.70), ("shield", 1.15)],
}


def along(center, petal, t):
    return (center[0] + (petal[0] - center[0]) * t, center[1] + (petal[1] - center[1]) * t)


def collect(center, petals):
    out = {"command": center}
    for key, slots in SLOTS.items():
        for name, t in slots:
            out[name] = along(center, petals[key], t)
    return out


def font(n):
    try:
        return ImageFont.truetype("C:/Windows/Fonts/consola.ttf", n)
    except OSError:
        return ImageFont.load_default()


def overlay(src, dest, pts, mobile=False):
    im = Image.open(ASSETS / src).convert("RGBA")
    W, H = im.size
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f = font(14 if mobile else 13)
    # 10% major grid
    for p in range(0, 101, 10):
        x, y = p / 100 * W, p / 100 * H
        d.line([(x, 0), (x, H)], fill=(80, 255, 255, 70), width=1)
        d.line([(0, y), (W, y)], fill=(80, 255, 255, 70), width=1)
        d.text((x + 3, 4), str(p), fill=(255, 255, 80, 220), font=f)
        d.text((4, y + 2), str(p), fill=(120, 255, 180, 220), font=f)
    for name, (x, y) in pts.items():
        px, py = x / 100 * W, y / 100 * H
        col = (80, 255, 255, 255) if name == "command" else (255, 210, 40, 255)
        d.ellipse((px - 10, py - 10, px + 10, py + 10), outline=col, width=3)
        d.line((px - 14, py, px + 14, py), fill=col)
        d.line((px, py - 14, px, py + 14), fill=col)
        d.text((px + 12, py - 10), f"{name}\n{x:.1f},{y:.1f}", fill=col, font=f)
    Image.alpha_composite(im, layer).convert("RGB").save(OUT / dest, quality=94)
    print("wrote", dest)


desk = collect(DESK_CENTER, DESK_PETALS)
mob = collect(MOB_CENTER, MOB_PETALS)
overlay("base-iso-planet.jpg", "pads-v3-desktop.jpg", desk, False)
overlay("base-iso-planet-mobile.jpg", "pads-v3-mobile.jpg", mob, True)

print("\nDESKTOP")
for k, v in desk.items():
    print(f"  {k:16s} {v[0]:5.1f}  {v[1]:5.1f}   mob {mob[k][0]:5.1f}  {mob[k][1]:5.1f}")
