from pathlib import Path
from PIL import Image

root = Path(r"C:\Users\cbrun\Desktop\Stellar Nexus\public\assets\colony")
iso = root / "buildings-iso"
land = Image.open(root / "base-iso-planet.jpg").convert("RGBA")
W, H = land.size
plots = [
    ("command", 50, 54, "capital", True),
    ("shipyard", 54.9, 68.0, "large", True),
    ("uplink", 45.1, 68.0, "mini", True),
    ("jumpgate", 36.6, 64.3, "medium", False),
    ("archive", 31.6, 57.8, "large", False),
    ("matter_mine", 31.6, 50.2, "mini", True),
    ("shield", 34.1, 41.8, "medium", False),
    ("robotics", 44.2, 37.4, "medium", False),
    ("fusion", 55.8, 37.4, "medium", False),
    ("energy_array", 63.4, 43.7, "large", True),
    ("silo", 68.4, 50.2, "medium", False),
    ("quantum_lab", 68.4, 57.8, "medium", False),
    ("citadel", 63.4, 64.3, "large", False),
    ("defense_hub", 57.4, 74.8, "large", True),
    ("colony_dock", 42.6, 74.8, "micro", False),
    ("beacon", 29.8, 69.2, "micro", False),
    ("spy_center", 22.5, 59.6, "micro", False),
    ("diamond_forge", 22.5, 48.4, "mini", False),
    ("nanite", 70.2, 38.8, "medium", False),
    ("titan_extractor", 77.5, 48.4, "mini", False),
    ("helium_well", 77.5, 59.6, "mini", False),
    ("habitat", 70.2, 69.2, "micro", False),
]
sizes = {"capital": int(W * 0.13), "large": int(W * 0.1), "medium": int(W * 0.085), "mini": int(W * 0.07), "micro": int(W * 0.06)}
padsz = {"capital": int(W * 0.09), "large": int(W * 0.08), "medium": int(W * 0.075), "mini": int(W * 0.068), "micro": int(W * 0.06)}
pad = Image.open(root / "empty-pad-iso.png").convert("RGBA")
for pid, x, y, size, built in sorted(plots, key=lambda p: p[2]):
    if built:
        sp = Image.open(iso / f"{pid}.png").convert("RGBA")
        w = sizes[size]
        anchor = 0.72
    else:
        sp = pad
        w = padsz[size]
        anchor = 0.52
    h = int(sp.height * w / sp.width)
    sp = sp.resize((w, h), Image.Resampling.LANCZOS)
    px = int(W * x / 100 - w / 2)
    py = int(H * y / 100 - h * anchor)
    land.alpha_composite(sp, (max(0, px), max(0, py)))
land.convert("RGB").save(Path(__file__).parent / "composite.jpg", quality=92)
print("ok")
