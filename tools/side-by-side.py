"""Build a side-by-side comparison strip from two images.

Usage: python tools/side-by-side.py <left> <right> <out> [label-left] [label-right]

Images are scaled to the same height; a divider and optional captions are drawn
so the pair can be read at a glance without opening both files.
"""
import sys
from PIL import Image, ImageDraw, ImageFont


def load_font(size: int):
    for name in ('segoeui.ttf', 'arial.ttf', 'DejaVuSans.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    left, right, out = sys.argv[1], sys.argv[2], sys.argv[3]
    label_l = sys.argv[4] if len(sys.argv) > 4 else 'BEFORE'
    label_r = sys.argv[5] if len(sys.argv) > 5 else 'AFTER'

    a = Image.open(left).convert('RGB')
    b = Image.open(right).convert('RGB')

    height = max(a.height, b.height)
    a = a.resize((round(a.width * height / a.height), height), Image.LANCZOS)
    b = b.resize((round(b.width * height / b.height), height), Image.LANCZOS)

    pad = 16
    bar = 44
    divider = 4
    width = pad * 3 + a.width + b.width + divider
    canvas = Image.new('RGB', (width, height + bar + pad * 2), (18, 22, 32))
    draw = ImageDraw.Draw(canvas)

    font = load_font(24)
    draw.text((pad, pad + 6), label_l, fill=(255, 120, 120), font=font)
    draw.text((pad * 2 + a.width + divider, pad + 6), label_r, fill=(120, 240, 160), font=font)

    y = pad + bar
    canvas.paste(a, (pad, y))
    canvas.paste(b, (pad * 2 + a.width + divider, y))
    draw.rectangle(
        [pad + a.width, y, pad + a.width + divider - 1, y + height - 1],
        fill=(60, 70, 90),
    )

    canvas.save(out)
    print(f'wrote {out} ({canvas.width}x{canvas.height})')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
