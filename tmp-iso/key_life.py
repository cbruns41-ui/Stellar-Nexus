"""Key magenta backgrounds and write colony life sprites."""
from math import sqrt
from pathlib import Path
from PIL import Image

src = Path(__file__).resolve().parent / "life-src"
out = Path(__file__).resolve().parent.parent / "public" / "assets" / "colony" / "life"
out.mkdir(parents=True, exist_ok=True)

jobs = [
    ("ship-a.jpg", "ship-scout.png"),
    ("ship-b.jpg", "ship-cargo.png"),
    ("crawler.jpg", "rover.png"),     # six-wheel rover
    ("rover.jpg", "crawler.png"),     # tracked hauler
]


def sample_bg(px, w, h):
    samples = []
    for x in range(0, w, 8):
        samples.append(px[x, 2][:3])
        samples.append(px[x, h - 3][:3])
    for y in range(0, h, 8):
        samples.append(px[2, y][:3])
        samples.append(px[w - 3, y][:3])
    samples.sort()
    return samples[len(samples) // 2]


def key_magenta(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    br, bgc, bb = sample_bg(px, w, h)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            dist = sqrt((r - br) ** 2 + (g - bgc) ** 2 + (b - bb) ** 2)
            pink = r > 160 and b > 130 and g < 130 and r > g + 40
            if dist < 55 or (pink and dist < 110):
                alpha = 0
            elif dist < 95:
                alpha = int((dist - 55) * (255 / 40))
            else:
                alpha = 255
            px[x, y] = (r, g, b, min(a, alpha))
    bbox = im.getbbox()
    if not bbox:
        return im
    pad = 8
    l, t, rgt, btm = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    rgt = min(im.width, rgt + pad)
    btm = min(im.height, btm + pad)
    return im.crop((l, t, rgt, btm))


for src_name, dest_name in jobs:
    cut = key_magenta(Image.open(src / src_name))
    # downscale to sprite-friendly size
    max_side = 512 if "ship" in dest_name else 640
    if max(cut.size) > max_side:
        scale = max_side / max(cut.size)
        cut = cut.resize((int(cut.width * scale), int(cut.height * scale)), Image.Resampling.LANCZOS)
    dest = out / dest_name
    cut.save(dest)
    print(dest_name, cut.size)
