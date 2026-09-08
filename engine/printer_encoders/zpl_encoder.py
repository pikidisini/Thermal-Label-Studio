"""
Zebra ZPL II Printer Protocol Encoder.
Converts 1-bit raw monochrome bitmap bytes to ZPL ^GFA (Graphic Field ASCII Hex) format.
"""

from __future__ import annotations
from typing import Optional


def _encode_run(char: str, count: int) -> str:
    """Helper to encode consecutive identical characters into Zebra RLE representation."""
    if count == 0:
        return ""
    if count == 1:
        return char
    if count == 2:
        return char + char

    result = []
    # Multiples of 400 ('z')
    while count >= 400:
        result.append("z")
        count -= 400
    # Multiples of 20 ('g' through 'y')
    mult20 = count // 20
    if mult20 > 0:
        result.append(chr(ord("g") + mult20 - 1))
        count %= 20
    # Remainder 1 to 19 ('G' through 'Y')
    if count > 0:
        result.append(chr(ord("G") + count - 1))

    result.append(char)
    return "".join(result)


def compress_hex_zpl(hex_data: str, bytes_per_row: int) -> str:
    """
    Compresses standard hexadecimal bitmap rows using Zebra ZPL II Alternative Data Compression.
    Employs line repeats (:), all-white lines (,), all-black lines (!), and run-length codes.
    """
    chars_per_row = bytes_per_row * 2
    if len(hex_data) % chars_per_row != 0:
        return hex_data

    compressed_lines = []
    prev_line = None
    all_white = "0" * chars_per_row
    all_black = "F" * chars_per_row

    for i in range(0, len(hex_data), chars_per_row):
        line = hex_data[i : i + chars_per_row]

        if prev_line is not None and line == prev_line:
            compressed_lines.append(":")
            continue

        prev_line = line

        if line == all_white:
            compressed_lines.append(",")
            continue

        if line == all_black:
            compressed_lines.append("!")
            continue

        # Check for trailing zeros that can be replaced with ','
        trailing_zeros = 0
        idx = len(line) - 1
        while idx >= 0 and line[idx] == "0":
            trailing_zeros += 1
            idx -= 1

        use_comma = trailing_zeros >= 4
        effective_line = line[: len(line) - trailing_zeros] if use_comma else line

        line_out = []
        c_idx = 0
        line_len = len(effective_line)
        while c_idx < line_len:
            curr_char = effective_line[c_idx]
            run_len = 1
            while c_idx + run_len < line_len and effective_line[c_idx + run_len] == curr_char:
                run_len += 1
            line_out.append(_encode_run(curr_char, run_len))
            c_idx += run_len

        if use_comma:
            line_out.append(",")

        compressed_lines.append("".join(line_out))

    return "".join(compressed_lines)


def encode_zpl(
    raw_bytes: bytes,
    width_px: int,
    height_px: int,
    x: int = 0,
    y: int = 0,
    width_mm: Optional[float] = None,
    height_mm: Optional[float] = None,
    compress: bool = True,
) -> str:
    """
    Encodes raw 1-bit monochrome bytes into Zebra ZPL format.
    Supports native ZPL II Run-Length Encoding (RLE) compression.
    
    ZPL Graphics Format:
    ^XA
    ^PW<width_in_dots>
    ^LL<height_in_dots>
    ^FO<x>,<y>^GFA,<binary_byte_count>,<graphic_field_count>,<bytes_per_row>,<data>^FS
    ^XZ
    """
    bytes_per_row = (width_px + 7) // 8
    total_bytes = len(raw_bytes)
    hex_data = raw_bytes.hex().upper()

    if compress:
        data_payload = compress_hex_zpl(hex_data, bytes_per_row)
        graphic_field_count = len(data_payload)
    else:
        data_payload = hex_data
        graphic_field_count = total_bytes

    zpl = (
        "^XA\n"
        f"^PW{width_px}\n"
        f"^LL{height_px}\n"
        f"^FO{x},{y}^GFA,{total_bytes},{graphic_field_count},{bytes_per_row},{data_payload}^FS\n"
        "^XZ\n"
    )
    return zpl

