"""Chroma-key lime-green game sprites to RGBA PNG."""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

SRC = Path(__file__).resolve().parent
DST = Path(__file__).resolve().parents[2] / "public" / "assets" / "orbit-siege"

# src, dest, max_side, pad_pct, square, nibble
JOBS = [
    ("battery.jpg", "turret-battery.png", 1024, 10, True, False),
    ("laser.jpg", "turret-laser.png", 1024, 10, True, False),
    ("flak.jpg", "turret-flak.png", 1024, 10, True, False),
    ("gauss.jpg", "turret-gauss.png", 1024, 10, True, False),
    ("silo.jpg", "turret-silo.png", 1024, 10, True, False),
    ("tesla.jpg", "turret-tesla.png", 1024, 6, True, False),
    ("mine.jpg", "turret-mine.png", 1024, 8, True, False),
    ("interceptor.jpg", "interceptor.png", 1400, 6, False, False),
    ("frigate.jpg", "frigate.png", 1400, 6, False, False),
    ("rocket.jpg", "rocket.png", 1400, 6, False, False),
    ("missile.jpg", "missile.png", 1400, 6, False, False),
    ("fire.jpg", "fire.png", 1024, 4, True, False),
    ("aa.jpg", "aa.png", 1024, 4, True, False),
    ("stick.jpg", "stick.png", 1024, 4, True, False),
]


def is_key(r: int, g: int, b: int) -> bool:
    ge = g - max(r, b)
    if ge > 16 and g > 70:
        return True
    if g > 130 and g > r + 22 and g > b + 22:
        return True
    return False


def key_image(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    src = im.tobytes()
    n = w * h
    visited = bytearray(n)
    q: deque[int] = deque()

    def push(i: int) -> None:
        if visited[i]:
            return
        o = i * 4
        r, g, b = src[o], src[o + 1], src[o + 2]
        if is_key(r, g, b):
            visited[i] = 1
            q.append(i)

    for x in range(w):
        push(x)
        push((h - 1) * w + x)
    for y in range(h):
        push(y * w)
        push(y * w + (w - 1))

    while q:
        i = q.popleft()
        x = i % w
        y = i // w
        if x + 1 < w:
            push(i + 1)
        if x > 0:
            push(i - 1)
        if y + 1 < h:
            push(i + w)
        if y > 0:
            push(i - w)

    out = bytearray(src)
    for i in range(n):
        o = i * 4
        r, g, b = out[o], out[o + 1], out[o + 2]
        ge = g - max(r, b)
        if visited[i]:
            if ge >= 36:
                out[o + 3] = 0
            else:
                alpha = max(0, min(255, 255 - (ge + 18) * 5))
                g2 = min(g, (r + b) // 2 + 6)
                out[o + 1] = g2
                out[o + 3] = alpha
        else:
            # despill leftover green on metal
            if g > max(r, b) + 10:
                out[o + 1] = max(r, b) + 6
            out[o + 3] = 255

    rgba = Image.frombytes("RGBA", (w, h), bytes(out))
    a = rgba.getchannel("A").filter(ImageFilter.GaussianBlur(0.7))
    rgba.putalpha(a)
    return rgba


def nibble_shadow(im: Image.Image, luma_max: int = 36, rounds: int = 6) -> Image.Image:
    """Eat drop-shadow blobs hanging off the silhouette without chewing bright metal."""
    w, h = im.size
    px = im.load()
    for _ in range(rounds):
        victims: list[tuple[int, int]] = []
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                r, g, b, a = px[x, y]
                if a < 180:
                    continue
                if (r + g + b) > luma_max * 3:
                    continue
                trans = 0
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if px[x + dx, y + dy][3] < 40:
                        trans += 1
                if trans >= 2:
                    victims.append((x, y))
        for x, y in victims:
            px[x, y] = (0, 0, 0, 0)
    return im


def crop_pad(im: Image.Image, pad_pct: int, square: bool) -> Image.Image:
    a = im.getchannel("A")
    bbox = a.point(lambda p: 255 if p > 12 else 0).getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    bw, bh = x1 - x0, y1 - y0
    pad = max(6, int(max(bw, bh) * pad_pct / 100))
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    if square:
        side = max(x1 - x0, y1 - y0)
        cx = (x0 + x1) // 2
        cy = (y0 + y1) // 2
        x0 = max(0, cx - side // 2)
        y0 = max(0, cy - side // 2)
        x1 = min(im.width, x0 + side)
        y1 = min(im.height, y0 + side)
        x0 = max(0, x1 - side)
        y0 = max(0, y1 - side)
    return im.crop((x0, y0, x1, y1))


def fit_max(im: Image.Image, max_side: int) -> Image.Image:
    if max(im.size) <= max_side:
        return im
    im.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return im


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    only = set(__import__("sys").argv[1:])
    for src_name, dst_name, max_side, pad, square, nibble in JOBS:
        if only and src_name not in only and dst_name not in only:
            continue
        src = SRC / src_name
        if not src.exists():
            raise SystemExit(f"missing {src}")
        keyed = key_image(Image.open(src))
        if nibble:
            keyed = nibble_shadow(keyed)
        keyed = crop_pad(keyed, pad, square)
        keyed = fit_max(keyed, max_side)
        out = DST / dst_name
        keyed.save(out, "PNG", optimize=True)
        opaque = sum(1 for p in keyed.getchannel("A").getdata() if p > 12)
        print(f"{dst_name:22} {keyed.size[0]:4}x{keyed.size[1]:<4} opaque={opaque:7}  {out.stat().st_size:8}b")

    arena = SRC / "arena.jpg"
    if arena.exists():
        im = Image.open(arena).convert("RGB")
        im.thumbnail((1440, 2560), Image.Resampling.LANCZOS)
        dest = DST / "arena.jpg"
        im.save(dest, "JPEG", quality=90, optimize=True)
        print(f"{'arena.jpg':22} {im.size[0]:4}x{im.size[1]:<4}                  {dest.stat().st_size:8}b")


if __name__ == "__main__":
    main()
