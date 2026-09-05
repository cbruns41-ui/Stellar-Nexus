from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
hq = root / "public" / "assets" / "colony" / "buildings-hq"
out = Path(__file__).resolve().parent / "Assets" / "Colony" / "Resources" / "Buildings"
out.mkdir(parents=True, exist_ok=True)

def knock_black(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r < 16 and g < 16 and b < 16:
                px[x, y] = (r, g, b, 0)
    return im

for src in sorted(hq.glob("*.png")):
    img = knock_black(Image.open(src))
    img.save(out / src.name)
    print("building", src.name, img.size)

pad_src = Path(__file__).resolve().parent / "tmp-4.jpg"
if pad_src.exists():
    pad = Image.open(pad_src).convert("RGBA")
    w, h = pad.size
    cx, cy = w / 2, h / 2
    rad = min(w, h) * 0.49
    px = pad.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d > rad:
                px[x, y] = (r, g, b, 0)
            else:
                px[x, y] = (r, g, b, 255)
    dest = Path(__file__).resolve().parent / "Assets" / "Colony" / "Resources" / "empty-pad.png"
    pad.save(dest)
    print("pad", dest)

deck_src = Path(__file__).resolve().parent / "tmp-5.jpg"
if deck_src.exists():
    deck = Image.open(deck_src).convert("RGB")
    dest = Path(__file__).resolve().parent / "Assets" / "Colony" / "Resources" / "deck.png"
    deck.save(dest)
    print("deck", dest)
