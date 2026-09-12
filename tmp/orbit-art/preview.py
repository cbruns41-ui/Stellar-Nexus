from pathlib import Path
from PIL import Image

DST = Path("public/assets/orbit-siege")
files = [
    "turret-battery.png", "turret-laser.png", "turret-flak.png", "turret-gauss.png",
    "turret-silo.png", "turret-tesla.png", "turret-mine.png",
    "interceptor.png", "frigate.png", "rocket.png", "missile.png",
    "fire.png", "aa.png", "stick.png",
]
for name, bg in [("preview-dark.png", (8, 18, 32, 255)), ("preview-magenta.png", (255, 0, 180, 255))]:
    cols, rows, cell = 7, 2, 280
    sheet = Image.new("RGBA", (cols * cell, rows * cell), bg)
    for i, f in enumerate(files):
        im = Image.open(DST / f).convert("RGBA")
        im.thumbnail((cell - 16, cell - 16), Image.Resampling.LANCZOS)
        x = (i % cols) * cell + (cell - im.width) // 2
        y = (i // cols) * cell + (cell - im.height) // 2
        sheet.alpha_composite(im, (x, y))
    out = Path("tmp/orbit-art") / name
    sheet.convert("RGB").save(out, quality=92)
    print("wrote", out)

for f in files:
    im = Image.open(DST / f)
    data = list(im.getchannel("A").get_flattened_data())
    n = len(data)
    z = sum(1 for p in data if p == 0)
    full = sum(1 for p in data if p == 255)
    mid = n - z - full
    print(f"{f:22} {im.mode:4} {im.size} zero={z/n:.2%} full={full/n:.2%} mid={mid/n:.2%}")
