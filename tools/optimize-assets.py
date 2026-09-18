"""Regenerate the served image assets from the preserved originals.

public/ used to ship 19.6 MB of PNGs:

  previews/stage-*.png   5 x 1024x1024 = 6.97 MB, displayed at 88x66 CSS px
  textures/*.png         9 x 1024x1024 = 12.61 MB of albedo

Every one of those files also carried a fully opaque alpha channel
(alpha_min == alpha_max == 255), which PNG stores for nothing and which costs
roughly a quarter of the file size.

This script reads the untouched originals from raw-assets/ and writes WebP into
public/, which is what actually gets deployed. raw-assets/ is deliberately
outside public/ so Vite never serves or copies it.

Rules:
  previews  centre-cropped to 4:3 and resized to 264x198 (3x the 88x66 box, so
            it stays sharp on high-DPI screens). The crop matches what
            `object-fit: cover` was already doing, so framing is unchanged.
  textures  dimensions preserved, alpha dropped, WebP quality 88.

Usage:
  python tools/optimize-assets.py            # write public/
  python tools/optimize-assets.py --dry-run  # report sizes only
"""
import os
import sys
from PIL import Image, features

PREVIEW_BOX = (264, 198)
TEXTURE_QUALITY = 88
PREVIEW_QUALITY = 85


def human(n: int) -> str:
    return f'{n / 1024 / 1024:.2f} MB' if n >= 1024 * 1024 else f'{n / 1024:.1f} KB'


def optimise_preview(src: str, dst: str, dry: bool) -> tuple[int, int]:
    im = Image.open(src).convert('RGB')
    w, h = im.size
    target_ratio = PREVIEW_BOX[0] / PREVIEW_BOX[1]
    if w / h > target_ratio:          # too wide -> crop the sides
        new_w = int(round(h * target_ratio))
        left = (w - new_w) // 2
        im = im.crop((left, 0, left + new_w, h))
    else:                              # too tall -> crop top and bottom
        new_h = int(round(w / target_ratio))
        top = (h - new_h) // 2
        im = im.crop((0, top, w, top + new_h))
    im = im.resize(PREVIEW_BOX, Image.LANCZOS)
    if not dry:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        im.save(dst, 'WEBP', quality=PREVIEW_QUALITY, method=6)
    return os.path.getsize(src), os.path.getsize(dst) if not dry else 0


def optimise_texture(src: str, dst: str, dry: bool) -> tuple[int, int]:
    im = Image.open(src)
    if im.mode != 'RGB':
        im = im.convert('RGB')
    if not dry:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        im.save(dst, 'WEBP', quality=TEXTURE_QUALITY, method=6)
    return os.path.getsize(src), os.path.getsize(dst) if not dry else 0


def main() -> int:
    dry = '--dry-run' in sys.argv
    # Image.SAVE is only populated once a plugin has been imported, so it is not
    # a reliable capability probe here. features.check() is.
    if not features.check('webp'):
        print('Pillow was built without WebP support')
        return 1

    jobs = []
    for name in sorted(os.listdir('raw-assets/previews')):
        if name.lower().endswith('.png'):
            stem = os.path.splitext(name)[0]
            jobs.append(('preview', f'raw-assets/previews/{name}',
                         f'public/previews/{stem}.webp'))
    for name in sorted(os.listdir('raw-assets/textures')):
        if name.lower().endswith('.png'):
            stem = os.path.splitext(name)[0]
            jobs.append(('texture', f'raw-assets/textures/{name}',
                         f'public/textures/{stem}.webp'))

    total_before = total_after = 0
    for kind, src, dst in jobs:
        fn = optimise_preview if kind == 'preview' else optimise_texture
        before, after = fn(src, dst, dry)
        total_before += before
        total_after += after
        ratio = f'{after / before * 100:5.1f}%' if not dry else '   -  '
        print(f'{kind:8s} {os.path.basename(src):22s} {human(before):>9s} -> '
              f'{"  (dry)" if dry else human(after):>9s}  {ratio}')

    print('-' * 68)
    if dry:
        print(f'{"TOTAL":31s} {human(total_before):>9s}   (dry run, nothing written)')
    else:
        saved = total_before - total_after
        print(f'{"TOTAL":31s} {human(total_before):>9s} -> {human(total_after):>9s}  '
              f'saved {human(saved)} ({saved / total_before * 100:.1f}%)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
