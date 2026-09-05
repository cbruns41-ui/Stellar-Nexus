from collections import deque
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent
src_candidates = [
    root / "tmp-topdown",
    root.parent / "tmp-topdown",
]
src = next((p for p in src_candidates if p.exists()), None)
if src is None:
    raise SystemExit("tmp-topdown not found")

out = root / "Assets" / "Colony" / "Resources" / "Top"
out.mkdir(parents=True, exist_ok=True)
public = root.parent / "public" / "assets" / "colony" / "buildings-top"
public.mkdir(parents=True, exist_ok=True)

MAP = {
    "18": "pad",
    "19": "command",
    "20": "energy_array",
    "21": "shipyard",
    "22": "archive",
    "23": "matter_mine",
    "24": "ground",
    "25": "diamond_forge",
    "26": "titan_extractor",
    "27": "uplink",
    "28": "helium_well",
    "29": "silo",
    "30": "spy_center",
    "31": "shield",
    "32": "beacon",
    "33": "defense_hub",
    "34": "fusion",
    "35": "robotics",
    "36": "habitat",
    "37": "colony_dock",
    "38": "jumpgate",
    "39": "nanite",
    "40": "quantum_lab",
    "41": "citadel",
}


def knock_black(im: Image.Image, thresh: int = 26) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size

    def is_bg(x, y):
        r, g, b, _ = px[x, y]
        return min(r, g, b) < thresh

    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not is_bg(x, y):
            continue
        px[x, y] = (0, 0, 0, 0)
        q.append((x - 1, y))
        q.append((x + 1, y))
        q.append((x, y - 1))
        q.append((x, y + 1))

    seen2 = bytearray(w * h)
    min_area = 12000

    def is_void(x, y):
        r, g, b, a = px[x, y]
        return a > 0 and min(r, g, b) < thresh

    for y in range(h):
        for x in range(w):
            i = y * w + x
            if seen2[i] or not is_void(x, y):
                continue
            stack = [(x, y)]
            cells = []
            seen2[i] = 1
            while stack:
                cx, cy = stack.pop()
                cells.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        continue
                    ni = ny * w + nx
                    if seen2[ni] or not is_void(nx, ny):
                        continue
                    seen2[ni] = 1
                    stack.append((nx, ny))
            if len(cells) >= min_area:
                for cx, cy in cells:
                    px[cx, cy] = (0, 0, 0, 0)
    return im


def crop_square(im: Image.Image, pad: int = 10) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    w, h = r - l, b - t
    side = max(w, h)
    cx, cy = (l + r) // 2, (t + b) // 2
    l2 = max(0, cx - side // 2)
    t2 = max(0, cy - side // 2)
    r2 = min(im.width, l2 + side)
    b2 = min(im.height, t2 + side)
    cropped = im.crop((l2, t2, r2, b2))
    if cropped.width != cropped.height:
        side = max(cropped.width, cropped.height)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(cropped, ((side - cropped.width) // 2, (side - cropped.height) // 2))
        return canvas
    return cropped


for num, name in MAP.items():
    img = Image.open(src / f"{num}.jpg")
    if name == "ground":
        rgb = img.convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS)
        rgb.save(out / "ground.png", optimize=True)
        rgb.save(public / "ground.png", optimize=True)
    else:
        cut = crop_square(knock_black(img))
        cut = cut.resize((1024, 1024), Image.Resampling.LANCZOS)
        cut.save(out / f"{name}.png")
        cut.save(public / f"{name}.png")
    print(name)

needed = {
    "command", "citadel", "archive", "defense_hub", "shipyard", "energy_array", "fusion", "shield",
    "quantum_lab", "jumpgate", "robotics", "nanite", "matter_mine", "helium_well", "titan_extractor",
    "uplink", "diamond_forge", "silo", "spy_center", "beacon", "colony_dock", "habitat", "pad", "ground",
}
have = {p.stem for p in out.glob("*.png")}
missing = needed - have
print("missing", missing)
if missing:
    raise SystemExit(1)
