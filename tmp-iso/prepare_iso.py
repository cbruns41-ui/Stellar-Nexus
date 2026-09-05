from collections import deque
from pathlib import Path
from PIL import Image

src = Path(__file__).resolve().parent / "new"
out = Path(__file__).resolve().parent.parent / "public" / "assets" / "colony" / "buildings-iso"
out.mkdir(parents=True, exist_ok=True)


def knock(im: Image.Image, thresh: int = 22) -> Image.Image:
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
    return im


def crop_square(im: Image.Image, pad: int = 8) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    cropped = im.crop((l, t, r, b))
    side = max(cropped.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(cropped, ((side - cropped.width) // 2, (side - cropped.height) // 2))
    return canvas


for img in sorted(src.glob("*.jpg")):
    cut = crop_square(knock(Image.open(img)))
    cut = cut.resize((1024, 1024), Image.Resampling.LANCZOS)
    dest = out / f"{img.stem}.png"
    cut.save(dest)
    print(img.stem)

pad = out / "pad.png"
if pad.exists():
    target = Path(__file__).resolve().parent.parent / "public" / "assets" / "colony" / "empty-pad-iso.png"
    Image.open(pad).save(target)
    print("pad -> empty-pad-iso.png")
