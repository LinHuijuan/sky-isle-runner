"""Compare two PNGs and report how different they are.

Usage: python tools/imgdiff.py <a.png> <b.png> [diff-out.png]
Prints mean/max channel difference, the share of pixels differing by more than
a small threshold, and writes a red-highlighted diff image when asked.
"""
import sys
from PIL import Image, ImageChops


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    a = Image.open(sys.argv[1]).convert('RGB')
    b = Image.open(sys.argv[2]).convert('RGB')
    if a.size != b.size:
        print(f'size mismatch: {a.size} vs {b.size}')
        return 1

    diff = ImageChops.difference(a, b)
    gray = diff.convert('L')
    hist = gray.histogram()
    total = a.size[0] * a.size[1]
    mean = sum(i * n for i, n in enumerate(hist)) / total
    maxv = max(i for i, n in enumerate(hist) if n)
    over8 = sum(n for i, n in enumerate(hist) if i > 8) / total * 100
    over32 = sum(n for i, n in enumerate(hist) if i > 32) / total * 100

    print(f'size          {a.size[0]}x{a.size[1]} ({total} px)')
    print(f'mean diff     {mean:.3f} / 255')
    print(f'max diff      {maxv}')
    print(f'px >  8       {over8:.3f} %')
    print(f'px > 32       {over32:.3f} %')

    if len(sys.argv) > 3:
        amp = gray.point(lambda v: min(255, v * 6))
        out = Image.merge('RGB', (amp, amp.point(lambda v: 0), amp.point(lambda v: 0)))
        out.save(sys.argv[3])
        print(f'wrote {sys.argv[3]}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
