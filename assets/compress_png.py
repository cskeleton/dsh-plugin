#!/usr/bin/env python3
"""
compress_png.py — Zoned Indexed PNG Compressor for mobile text/article screenshots.

Why:
  Headless Chromium/Playwright outputs 24-bit RGB PNGs (3 bytes/pixel + Paeth filter),
  which bloats text-heavy long images to 8+ MB.
  This script detects color bands (avatars, badges, photos, illustrations) vs pure
  grayscale text/table bands:
  - Pure text/table images -> 4-bit Indexed PNG (12 gray levels, 2 px/byte, None/Up filter,
    zlib level 9), reducing size by ~72-78% with zero text blur.
  - Mixed color + text images -> 8-bit Indexed PNG (240 adaptive colors with dithering
    for color bands + 16 exact undithered gray shades for text bands), reducing size by ~70%.

Usage:
  python3 compress_png.py <input.png> [output.png]
"""
import os
import sys
import struct
import zlib
import numpy as np
from PIL import Image


def detect_color_rows(rgb_arr: np.ndarray, sat_threshold: int = 55, min_pixels: int = 6) -> np.ndarray:
    """
    Return boolean mask of shape (H,) indicating which rows contain true color graphics
    (as opposed to grayscale text with minor subpixel AA).
    """
    ptp = np.ptp(rgb_arr, axis=2)  # max(R,G,B) - min(R,G,B)
    colored_counts = (ptp > sat_threshold).sum(axis=1)
    raw_mask = colored_counts >= min_pixels
    if not raw_mask.any():
        return raw_mask
    # Dilate mask by 8px vertically to cover anti-aliased edges of photos/badges
    h = len(raw_mask)
    dilated = np.zeros(h, dtype=bool)
    indices = np.where(raw_mask)[0]
    for idx in indices:
        lo = max(0, idx - 8)
        hi = min(h, idx + 9)
        dilated[lo:hi] = True
    return dilated


def save_indexed_png_optimal(idx_arr: np.ndarray, palette_rgb: list[int], out_path: str, bit_depth: int = 8) -> int:
    """
    Write an indexed-color PNG (color_type=3) using scanline filters 0 (None) and 2 (Up)
    plus maximum zlib compression.
    """
    h, w = idx_arr.shape
    num_colors = max(int(idx_arr.max()) + 1, 2)
    plte_bytes = bytes(palette_rgb[: num_colors * 3])
    if len(plte_bytes) < num_colors * 3:
        plte_bytes += b"\x00" * (num_colors * 3 - len(plte_bytes))

    if bit_depth == 4:
        if w % 2 == 1:
            idx_arr = np.pad(idx_arr, ((0, 0), (0, 1)), constant_values=0)
        packed = (idx_arr[:, 0::2] << 4) | (idx_arr[:, 1::2] & 0x0F)
    elif bit_depth == 2:
        if w % 4 != 0:
            idx_arr = np.pad(idx_arr, ((0, 0), (0, 4 - (w % 4))), constant_values=0)
        packed = (
            (idx_arr[:, 0::4] << 6)
            | (idx_arr[:, 1::4] << 4)
            | (idx_arr[:, 2::4] << 2)
            | (idx_arr[:, 3::4] & 0x03)
        )
    else:
        packed = idx_arr

    raw_f0 = bytearray()
    raw_f02 = bytearray()
    prev_row = np.zeros(packed.shape[1], dtype=np.uint8)
    for r in range(h):
        row = packed[r]
        raw_f0.append(0)
        raw_f0.extend(row.tobytes())

        diff_up = (row.astype(np.int16) - prev_row.astype(np.int16)) & 0xFF
        if np.count_nonzero(diff_up == 0) >= np.count_nonzero(row == row[0]):
            raw_f02.append(2)
            raw_f02.extend(diff_up.astype(np.uint8).tobytes())
        else:
            raw_f02.append(0)
            raw_f02.extend(row.tobytes())
        prev_row = row

    best_idat = None
    for raw in (raw_f02, raw_f0):
        for strat in (zlib.Z_DEFAULT_STRATEGY, zlib.Z_FILTERED, zlib.Z_RLE):
            co = zlib.compressobj(level=9, method=zlib.DEFLATED, wbits=15, memLevel=9, strategy=strat)
            compressed = co.compress(bytes(raw)) + co.flush()
            if best_idat is None or len(compressed) < len(best_idat):
                best_idat = compressed

    def make_chunk(ctype: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(ctype + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + ctype + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", w, h, bit_depth, 3, 0, 0, 0)
    png_bytes = (
        b"\x89PNG\r\n\x1a\n"
        + make_chunk(b"IHDR", ihdr)
        + make_chunk(b"PLTE", plte_bytes)
        + make_chunk(b"IDAT", best_idat)
        + make_chunk(b"IEND", b"")
    )
    with open(out_path, "wb") as f:
        f.write(png_bytes)
    return len(png_bytes)


def compress_png_file(in_path: str, out_path: str | None = None) -> dict:
    if out_path is None:
        out_path = in_path
    orig_bytes = os.path.getsize(in_path)
    im = Image.open(in_path).convert("RGB")
    w, h = im.size
    rgb_arr = np.array(im, dtype=np.uint8)
    gray_arr = np.array(im.convert("L"), dtype=np.uint8)

    color_mask = detect_color_rows(rgb_arr)
    has_color = bool(color_mask.any())

    if not has_color:
        # Pure text/table page -> 12-shade grayscale packed in 4-bit indexed PNG
        levels = 12
        idx_arr = np.round(gray_arr / 255.0 * (levels - 1)).astype(np.uint8)
        palette = []
        for i in range(levels):
            v = int(round(i * 255 / (levels - 1)))
            palette.extend([v, v, v])
        new_bytes = save_indexed_png_optimal(idx_arr, palette, out_path, bit_depth=4)
        mode = "4-bit-grayscale-indexed"
    else:
        # Mixed color + text page -> 240 colors for color rows + 16 exact gray levels for text rows
        color_rows_rgb = rgb_arr[color_mask]
        color_strip = Image.fromarray(color_rows_rgb, mode="RGB")
        quant_strip = color_strip.quantize(colors=240, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
        top_pal = list(quant_strip.getpalette()[: 240 * 3])
        if len(top_pal) < 240 * 3:
            top_pal.extend([0] * (240 * 3 - len(top_pal)))

        gray_levels = 16
        text_idx = np.round(gray_arr / 255.0 * (gray_levels - 1)).astype(np.uint8) + 240
        full_idx = text_idx.copy()
        full_idx[color_mask] = np.array(quant_strip, dtype=np.uint8)

        full_pal = top_pal
        for i in range(gray_levels):
            v = int(round(i * 255 / (gray_levels - 1)))
            full_pal.extend([v, v, v])

        new_bytes = save_indexed_png_optimal(full_idx, full_pal, out_path, bit_depth=8)
        mode = "8-bit-zoned-hybrid-indexed"

    return {
        "path": out_path,
        "width": w,
        "height": h,
        "mode": mode,
        "originalBytes": orig_bytes,
        "compressedBytes": new_bytes,
        "ratio": round(new_bytes / orig_bytes, 4) if orig_bytes else 1.0,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 compress_png.py <input.png> [output.png]", file=sys.stderr)
        sys.exit(2)
    inp = sys.argv[1]
    outp = sys.argv[2] if len(sys.argv) > 2 else inp
    info = compress_png_file(inp, outp)
    print(
        f"{info['path']} ({info['width']}x{info['height']}, {info['mode']}): "
        f"{info['originalBytes']/1024:.1f} KB -> {info['compressedBytes']/1024:.1f} KB ({info['ratio']*100:.1f}%)"
    )
