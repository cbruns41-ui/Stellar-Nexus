"""Tune plaza pad centers against the real base art."""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ASSETS = Path(__file__).resolve().parent.parent / "public" / "assets" / "colony"
OUT = Path(__file__).resolve().parent

# Current plots, used only to keep relative building assignment.
PLOTS = [
    ("command", 50, 54),
    ("shipyard", 54.9, 68.0),
    ("uplink", 45.1, 68.0),
    ("jumpgate", 36.6, 64.3),
    ("archive", 31.6, 57.8),
    ("matter_mine", 31.6, 50.2),
    ("shield", 34.1, 41.8),
    ("robotics", 44.2, 37.4),
    ("fusion", 55.8, 37.4),
    ("energy_array", 63.4, 43.7),
    ("silo", 68.4, 50.2),
    ("quantum_lab", 68.4, 57.8),
    ("citadel", 63.4, 64.3),
    ("defense_hub", 57.4, 74.8),
    ("colony_dock", 42.6, 74.8),
    ("beacon", 29.8, 69.2),
    ("spy_center", 22.5, 59.6),
    ("diamond_forge", 22.5, 48.4),
    ("nanite", 70.2, 38.8),
    ("titan_extractor", 77.5, 48.4),
    ("helium_well", 77.5, 59.6),
    ("habitat", 70.2, 69.2),
]

# Pad angles: dirt petals sit BETWEEN the 8 radial roads.
# 0deg = north (up / back of plaza), clockwise.
SLICE_ANGLES = [22.5 + i * 45 for i in range(8)]  # NNE, ENE, ESE, SSE, SSW, WSW, WNW, NNW
# Front/side slices get a third pad (largest in perspective).
TRIPLE = {1, 2, 3, 4, 5}  # ENE, ESE, SSE, SSW, WSW


def plaza_point(angle_deg, t, cx, cy, rx, ry_back, ry_front, persp):
    a = math.radians(angle_deg)
    nx = math.sin(a)
    ny = -math.cos(a)  # north = -y
    ry = ry_back if ny < 0 else ry_front
    depth = (1 - persp) + persp * (ny + 1) / 2  # back smaller
    return (cx + nx * rx * t * depth, cy + ny * ry * t)


def slots_for(cfg):
    slots = [{"id": "center", "angle": 0, "t": 0, "slice": -1}]
    for i, ang in enumerate(SLICE_ANGLES):
        ts = (0.36, 0.70, 0.90) if i in TRIPLE else (0.40, 0.74)
        for t in ts:
            slots.append({"id": f"s{i}_{t}", "angle": ang, "t": t, "slice": i})
    for s in slots:
        s["x"], s["y"] = plaza_point(s["angle"], s["t"], **cfg)
    return slots


def assign(slots):
    center = next(s for s in slots if s["slice"] == -1)
    assigned = {"command": center}
    used = {id(center)}
    others = [p for p in PLOTS if p[0] != "command"]
    # polar angle of current layout around old command
    ox, oy = 50.0, 54.0
    scored = []
    for name, x, y in others:
        ang = (math.degrees(math.atan2(x - ox, oy - y)) + 360) % 360
        rad = math.hypot(x - ox, y - oy)
        scored.append((name, ang, rad))
    # map angle to slice
    by_slice = {i: [] for i in range(8)}
    for name, ang, rad in scored:
        # nearest slice angle
        best = min(range(8), key=lambda i: min(abs(ang - SLICE_ANGLES[i]), 360 - abs(ang - SLICE_ANGLES[i])))
        by_slice[best].append((name, rad))
    # if a slice is overloaded vs its slot count, move extras to neighbour
    for i in range(8):
        nslots = 3 if i in TRIPLE else 2
        by_slice[i].sort(key=lambda r: r[1])
        while len(by_slice[i]) > nslots:
            name, rad = by_slice[i].pop()
            # move to neighbour with most free space
            neigh = min(
                [(i + 1) % 8, (i - 1) % 8],
                key=lambda j: len(by_slice[j]) - (3 if j in TRIPLE else 2),
            )
            by_slice[neigh].append((name, rad))
            by_slice[neigh].sort(key=lambda r: r[1])
    for i in range(8):
        slice_slots = [s for s in slots if s["slice"] == i]
        slice_slots.sort(key=lambda s: s["t"])
        members = by_slice[i]
        for (name, _rad), slot in zip(members, slice_slots):
            assigned[name] = slot
            used.add(id(slot))
    missing = [p[0] for p in PLOTS if p[0] not in assigned]
    free = [s for s in slots if id(s) not in used]
    for name, slot in zip(missing, free):
        assigned[name] = slot
    return assigned


DESK = dict(cx=50.0, cy=56.2, rx=32.0, ry_back=16.2, ry_front=26.0, persp=0.22)
MOB = dict(cx=50.0, cy=71.6, rx=40.0, ry_back=15.4, ry_front=18.8, persp=0.12)


def render(src, out, cfg, mobile=False):
    im = Image.open(ASSETS / src).convert("RGBA")
    W, H = im.size
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    try:
        f = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 14 if mobile else 13)
    except OSError:
        f = ImageFont.load_default()
    slots = slots_for(cfg)
    assigned = assign(slots)
    # ellipse outline
    for t in (1.0,):
        pts = [plaza_point(deg, t, **cfg) for deg in range(0, 360, 3)]
        d.line([(p[0] / 100 * W, p[1] / 100 * H) for p in pts] + [(pts[0][0] / 100 * W, pts[0][1] / 100 * H)], fill=(0, 255, 90, 200), width=2)
    for name, slot in assigned.items():
        px, py = slot["x"] / 100 * W, slot["y"] / 100 * H
        col = (0, 220, 255, 255) if name == "command" else (255, 200, 40, 255)
        d.ellipse((px - 8, py - 8, px + 8, py + 8), outline=col, width=3)
        d.text((px + 9, py - 8), f"{name}\n{slot['x']:.1f},{slot['y']:.1f}", fill=col, font=f)
    Image.alpha_composite(im, layer).convert("RGB").save(OUT / out, quality=94)
    print("wrote", out)
    return assigned


a_d = render("base-iso-planet.jpg", "pads-desktop.jpg", DESK, False)
a_m = render("base-iso-planet-mobile.jpg", "pads-mobile.jpg", MOB, True)

print("\nDESKTOP")
for name, *_ in PLOTS:
    s = a_d[name]
    print(f"  {name:16s}  {s['x']:5.1f}  {s['y']:5.1f}  slice={s['slice']} t={s['t']}")
print("\nMOBILE")
for name, *_ in PLOTS:
    s = a_m[name]
    print(f"  {name:16s}  {s['x']:5.1f}  {s['y']:5.1f}")
