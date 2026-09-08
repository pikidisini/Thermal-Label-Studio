"""
TSC TSPL / TSPL2 Printer Protocol Encoder.
Converts 1-bit raw monochrome bitmap bytes to TSPL BITMAP binary stream.
"""

from __future__ import annotations


def encode_tspl(
    raw_bytes: bytes,
    width_px: int,
    height_px: int,
    width_mm: float = 200.0,
    height_mm: float = 80.0,
    x: int = 0,
    y: int = 0,
    mode: int = 0,  # 0: OVERWRITE, 1: OR, 2: XOR
) -> bytes:
    """
    Encodes raw 1-bit monochrome bytes into TSC TSPL format.
    
    TSPL Command:
    SIZE <width_mm> mm,<height_mm> mm\r\n
    GAP 0 mm,0 mm\r\n
    DIRECTION 1\r\n
    CLS\r\n
    BITMAP <x>,<y>,<width_bytes>,<height_dots>,<mode>,<raw_binary_bytes>\r\n
    PRINT 1,1\r\n
    """
    bytes_per_row = (width_px + 7) // 8

    # Header text
    header = (
        f"SIZE {width_mm:.1f} mm,{height_mm:.1f} mm\r\n"
        "GAP 0 mm,0 mm\r\n"
        "DIRECTION 1\r\n"
        "CLS\r\n"
        f"BITMAP {x},{y},{bytes_per_row},{height_px},{mode},"
    ).encode("ascii")

    # In TSPL BITMAP, 0 = black pixel, 1 = white pixel (opposite of ZPL)
    # So we invert the raw_bytes for standard TSPL mode
    inverted_bytes = bytes([b ^ 0xFF for b in raw_bytes])

    footer = b"\r\nPRINT 1,1\r\n"

    return header + inverted_bytes + footer
