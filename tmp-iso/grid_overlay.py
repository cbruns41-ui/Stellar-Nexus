"""Dev-only: labeled grid over the colony base so pad centers can be read off."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "public" / "assets" / "colony"
OUT = Path(__file__).resolve().parent

PLOTS = [
    ("command", 50, 54, 50, 72),
    ("shipyard", 54.9, 68.0, 55.7, 87.0),
    ("uplink", 45.1, 68.0, 44.3, 87.0),
    ("jumpgate", 36.6, 64.3, 34.4, 83.0),
    ("archive", 31.6, 57.8, 28.7, 76.0),
    ("matter_mine", 31.6, 50.2, 28.7, 68.0),
    ("shield", 34.1, 41.8, 31.6, 58.9),
    ("robotics", 44.2, 37.4, 43.3, 54.1),
    ("fusion", 55.8, 37.4, 56.7, 54.1),
    ("energy_array", 63.4, 43.7, 65.6, 61.0),
    ("silo", 68.4, 50.2, 71.3, 68.0),
    ("quantum_lab", 68.4, 57.8, 71.3, 76.0),
    ("citadel", 63.4, 64.3, 65.6, 83.0),
    ("defense_hub", 57.4, 74.8, 58.3, 92.0),
    ("colony_dock", 42.6, 74.8, 41.7, 92.0),
    ("beacon", 29.8, 69.2, 27.4, 88.3),
    ("spy_center", 22.5, 59.6, 19.1, 78.0),
    ("diamond_forge", 22.5, 48.4, 19.1, 66.0),
    ("nanite", 70.2, 38.8, 72.6, 55.7),
    ("titan_extractor", 77.5, 48.4, 80.9, 66.0),
    ("helium_well", 77.5, 59.6, 80.9, 78.0),
    ("habitat", 70.2, 69.2, 72.6, 88.3),
]


def font(size):
    for name in ("consola.ttf", "arial.ttf", "C:/Windows/Fonts/consola.ttf", "C:/Windows/Fonts/arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def overlay(src_name, out_name, mobile=False):
    im = Image.open(ASSETS / src_name).convert("RGBA")
    W, H = im.size
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f_small = font(11 if mobile else 13)
    f_tiny = font(9 if mobile else 11)
    f_axis = font(14 if mobile else 16)

    step = 2  # percent
    # minor 2% grid
    for p in range(0, 101, step):
        x = p / 100 * W
        y = p / 100 * H
        major = p % 10 == 0
        col = (80, 255, 255, 70) if major else (255, 220, 80, 40)
        width = 2 if major else 1
        d.line([(x, 0), (x, H)], fill=col, width=width)
        d.line([(0, y), (W, y)], fill=col, width=width)

    # axis labels every 2%
    for p in range(0, 101, 2):
        x = p / 100 * W
        y = p / 100 * H
        label = f"{p:02d}"
        d.text((x + 2, 2), label, fill=(255, 255, 120, 220), font=f_tiny)
        d.text((2, y + 2), label, fill=(120, 255, 180, 220), font=f_tiny)

    # current plots
    for name, x, y, mx, my in PLOTS:
        px = (mx if mobile else x) / 100 * W
        py = (my if mobile else y) / 100 * H
        r = 10
        d.ellipse((px - r, py - r, px + r, py + r), outline=(255, 40, 40, 255), width=2)
        d.text((px + 8, py - 14), name, fill=(255, 80, 80, 255), font=f_small)

    # proposed plaza ellipse (desktop / mobile tuned later)
    if mobile:
        cx, cy, rx, ry = 0.50 * W, 0.735 * H, 0.42 * W, 0.195 * H
    else:
        cx, cy, rx, ry = 0.50 * W, 0.655 * H, 0.365 * W, 0.255 * H
    d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), outline=(0, 255, 90, 220), width=3)
    d.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), fill=(0, 255, 90, 255))
    d.text((cx + 10, cy - 18), f"C {cx/W*100:.1f},{cy/H*100:.1f}", fill=(0, 255, 90, 255), font=f_axis)

    # 12 slice mid-angles (pads sit BETWEEN radial roads; roads at k*30deg, pad at +15deg)
    # 0deg = +x (right), 90deg = -y (up/back of plaza) in image space? 
    # We'll use standard math: 0 = east, counterclockwise. For clock: 12 o'clock is -90deg in this system
    # Roads appear at 12, 1:30, 3, 4:30... so every 30deg starting at -90 (12 o'clock).
    # Pad centers at 15deg offset: -75, -45, ...
    import math
    for i in range(12):
        ang = math.radians(-90 + 15 + i * 30)  # pad center
        for t, col in ((0.42, (255, 160, 0, 255)), (0.78, (160, 80, 255, 255))):
            px = cx + math.cos(ang) * rx * t
            py = cy + math.sin(ang) * ry * t
            d.ellipse((px - 6, py - 6, px + 6, py + 6), fill=col)
            d.text((px + 7, py - 6), f"{i}:{t}", fill=col, font=f_tiny)

    out = Image.alpha_composite(im, layer)
    dest = OUT / out_name
    out.convert("RGB").save(dest, quality=92)
    print("wrote", dest, W, H)


overlay("base-iso-planet.jpg", "grid-desktop.jpg", mobile=False)
overlay("base-iso-planet-mobile.jpg", "grid-mobile.jpg", mobile=True)
