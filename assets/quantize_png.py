#!/usr/bin/env python3
"""
quantize_png.py — tint-preserving PNG shrink for tinted export themes.

compress_png.py (from the markdown-to-mobile-image skill) maps every row
without strong colour to pure grayscale, which suits the white `paper`
theme but removes the background tint of `sepia` and `night` and leaves a
tinted band on rows that contain coloured text. This script instead
quantizes the whole image to one adaptive 256-colour palette without
dithering, which keeps the tint and text edges.

Usage: python3 quantize_png.py <input.png> [output.png]
"""
import sys
from PIL import Image


def main() -> None:
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src
    image = Image.open(src).convert("RGB")
    quantized = image.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    quantized.save(dst, format="PNG", optimize=True)


if __name__ == "__main__":
    main()
