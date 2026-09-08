"""
1-Bit Bit Packing Module for monochrome thermal label printing.

Packs monochrome image pixels into raw bytes (1 bit per pixel, MSB-first):
- 1 = Black (Burn / Mark)
- 0 = White (Unmarked)
"""

from __future__ import annotations

from typing import Tuple
from PIL import Image


def pack_bits_per_row(image: Image.Image) -> bytes:
    """
    Packs a 1-bit monochrome PIL Image (mode '1') into raw bytes.
    Each horizontal row is packed from left to right, MSB first (bit 7 = leftmost pixel).
    If row width is not a multiple of 8, the last byte in each row is right-padded with 0s.
    
    Standard convention for thermal printers:
    - 1 = Black pixel (print/burn)
    - 0 = White pixel (transparent/no burn)
    """
    if image.mode != "1":
        raise ValueError(f"Image must be mode '1', got '{image.mode}'")

    width, height = image.size
    bytes_per_row = (width + 7) // 8
    output_bytes = bytearray(bytes_per_row * height)

    # image.getpixel((x, y)) in mode '1' returns 0 (black) or 255 (white)
    # We invert so: 0 (black) -> 1, 255 (white) -> 0
    for y in range(height):
        row_offset = y * bytes_per_row
        for byte_idx in range(bytes_per_row):
            byte_val = 0
            for bit_pos in range(8):
                x = (byte_idx * 8) + bit_pos
                if x < width:
                    px = image.getpixel((x, y))
                    # If pixel is black (0), set bit to 1
                    if px == 0:
                        byte_val |= (1 << (7 - bit_pos))
            output_bytes[row_offset + byte_idx] = byte_val

    return bytes(output_bytes)


def get_raw_bitmap_data(image: Image.Image) -> Tuple[bytes, int, int, int]:
    """
    Returns (raw_bytes, width_px, height_px, bytes_per_row).
    """
    if image.mode != "1":
        image = image.convert("1", dither=Image.NONE)
    width, height = image.size
    bytes_per_row = (width + 7) // 8
    raw_bytes = pack_bits_per_row(image)
    return raw_bytes, width, height, bytes_per_row
