"""Merge the content parts into data/levelN.json (one file per level) and draw the app icons.

Run from anywhere:
  python tools/build.py            (all levels that have parts)
  python tools/build.py --icons    (also redraw icons)
"""
import json, pathlib, re, subprocess, sys

HERE = pathlib.Path(__file__).parent
APP = HERE.parent


def merge():
    parts = sorted((HERE / "parts").glob("level*_days*.json"))
    rc = subprocess.call([sys.executable, str(HERE / "validate.py"), *map(str, parts)])
    if rc:
        sys.exit("validation failed; data files not written")
    by_level = {}
    for p in parts:
        lv = int(re.search(r"level(\d)", p.name).group(1))
        by_level.setdefault(lv, []).extend(json.loads(p.read_text(encoding="utf-8")))
    (APP / "data").mkdir(exist_ok=True)
    for lv, words in sorted(by_level.items()):
        words.sort(key=lambda w: (w["day"], w["slot"]))
        out = APP / "data" / f"level{lv}.json"
        out.write_text(json.dumps(words, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {out.name}: {len(words)} words{'' if len(words) == 300 else '  <-- not 300!'}")


def icons():
    from PIL import Image, ImageDraw, ImageFont
    font_path = "C:/Windows/Fonts/malgunbd.ttf"
    (APP / "icons").mkdir(exist_ok=True)
    for size, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")]:
        img = Image.new("RGB", (size, size), "#d9534f")
        d = ImageDraw.Draw(img)
        d.text((size / 2, size * 0.45), "한", font=ImageFont.truetype(font_path, int(size * 0.46)), fill="#ffffff", anchor="mm")
        d.text((size / 2, size * 0.78), "TOPIK 5", font=ImageFont.truetype(font_path, int(size * 0.14)), fill="#ffe3df", anchor="mm")
        img.save(APP / "icons" / name)
    print("icons written")


if __name__ == "__main__":
    if "--icons" in sys.argv or not (APP / "icons" / "icon-512.png").exists():
        icons()
    merge()
