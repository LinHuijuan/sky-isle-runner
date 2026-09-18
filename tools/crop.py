"""Crop + magnify a region of a PNG so details can be inspected at real size.

Usage:
  python tools/crop.py <image> <x> <y> <w> <h> [scale] [out]
"""
import sys
from PIL import Image


def main() -> int:
    if len(sys.argv) < 6:
        print(__doc__)
        return 2
    src, x, y, w, h = sys.argv[1], *[int(v) for v in sys.argv[2:6]]
    scale = float(sys.argv[6]) if len(sys.argv) > 6 else 3.0
    out = sys.argv[7] if len(sys.argv) > 7 else src.replace('.png', '-crop.png')

    im = Image.open(src).convert('RGB')
    print(f'source {im.width}x{im.height}')
    x = max(0, min(x, im.width - 1))
    y = max(0, min(y, im.height - 1))
    w = min(w, im.width - x)
    h = min(h, im.height - y)
    box = im.crop((x, y, x + w, y + h))
    box = box.resize((int(w * scale), int(h * scale)), Image.NEAREST)
    box.save(out)
    print(f'wrote {out} ({box.width}x{box.height}) from crop ({x},{y},{w},{h})')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
