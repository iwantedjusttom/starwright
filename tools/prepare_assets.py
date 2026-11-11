#!/usr/bin/env python3
"""Prepare generated art for the game.

Takes images as they come out of an image generator (often on a white background, at any size) and turns them
into game-ready transparent PNGs:
  * removes the background colour that touches the image's edges (so bright highlights *inside* the art survive),
    with a soft edge instead of a jagged cut-out
  * crops to the artwork, centres it on a square canvas with a little padding
  * resizes to the requested size

Usage:
  python3 tools/prepare_assets.py SOURCE_DIR OUTPUT_DIR [--size 256] [--bg white|black|none]

Every image in SOURCE_DIR is processed and saved to OUTPUT_DIR with the same name (as .png). For runes, name the
source files sun.png, moon.png, tide.png, ember.png, void.png and use OUTPUT_DIR = public/assets/runes.
"""
import argparse
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter


def remove_background(img, bg=(255, 255, 255), tolerance=40, soften=60):
    """Make the background transparent: flood-fill from the borders through pixels close to `bg`."""
    img = img.convert('RGBA')
    w, h = img.size
    px = img.load()

    def dist(p):
        return max(abs(p[0] - bg[0]), abs(p[1] - bg[1]), abs(p[2] - bg[2]))

    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    background = bytearray(w * h)
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if dist(px[x, y]) > tolerance + soften:
            continue  # part of the artwork: stop here
        background[i] = 1
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                q.append((nx, ny))
    # Background pixels become transparent; near-background pixels at the boundary fade out smoothly.
    alpha = Image.new('L', (w, h), 255)
    a = alpha.load()
    for y in range(h):
        for x in range(w):
            if background[y * w + x]:
                d = dist(px[x, y])
                a[x, y] = 0 if d <= tolerance else int(255 * (d - tolerance) / soften)
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))
    img.putalpha(_min_alpha(img.getchannel('A'), alpha))
    return img


def _min_alpha(a1, a2):
    from PIL import ImageChops
    return ImageChops.darker(a1, a2)


def square_and_resize(img, size, pad=0.04):
    box = img.getchannel('A').getbbox()
    if box:
        img = img.crop(box)
    w, h = img.size
    side = int(max(w, h) * (1 + 2 * pad))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return canvas.resize((size, size), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('source')
    ap.add_argument('output')
    ap.add_argument('--size', type=int, default=256)
    ap.add_argument('--bg', choices=['white', 'black', 'none'], default='white')
    args = ap.parse_args()
    src, out = Path(args.source), Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    files = [p for p in sorted(src.iterdir()) if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp')]
    if not files:
        sys.exit(f'No images found in {src}')
    for p in files:
        img = Image.open(p)
        if args.bg != 'none':
            img = remove_background(img, (255, 255, 255) if args.bg == 'white' else (0, 0, 0))
        else:
            img = img.convert('RGBA')
        img = square_and_resize(img, args.size)
        dest = out / (p.stem.lower() + '.png')
        img.save(dest, optimize=True)
        print(f'{p.name} -> {dest} ({args.size}x{args.size})')


if __name__ == '__main__':
    main()
