"""
Intermec IPL (Intermec Printer Language) Protocol Encoder.
Converts 1-bit raw monochrome bitmap bytes to a pure IPL continuous byte stream
using genuine ASCII control bytes (STX 0x02 and ETX 0x03) without newline separators.
"""

from __future__ import annotations

# Native ASCII Control Characters for Intermec IPL Protocol
STX = b"\x02"  # 0x02 Start of TeXt
ETX = b"\x03"  # 0x03 End of TeXt


def encode_ipl(
    raw_bytes: bytes,
    width_px: int,
    height_px: int,
    x: int = 0,
    y: int = 0,
    copies: int = 1,
    data_mode: str = "0002",
) -> bytes:
    """
    Encodes raw 1-bit monochrome bytes into a native Intermec IPL byte stream.

    Standard IPL Graphic Sequence Flow:
    1. <STX>C<ETX>                                 (Clear / Reset format buffer)
    2. <STX>L<ETX>                                 (Enter Layout / Label Format Mode)
    3. <STX>D<ETX>                                 (Enter Define Mode)
    4. <STX>G1;o<x>,<y>;w<w>;h<h>;d<data_mode>;<ETX> (Define Graphic Field 1, mode 0002=uncompressed hex)
    5. <STX>u<HEX_STREAM_DATA><ETX>                (Upload full continuous bitmap hex data in ONE frame)
    6. <STX>R<ETX>                                 (End of definition / Return from define)
    7. <STX>E1;F1;<ETX>                            (Select Form 1 & Execute Print)
    """
    if width_px % 8 != 0:
        raise ValueError(
            f"IPL graphic width must be a multiple of 8 dots (got width_px={width_px}). "
            "Row-padding will corrupt continuous byte stream alignment."
        )

    expected_bytes = (width_px // 8) * height_px
    if len(raw_bytes) != expected_bytes:
        raise ValueError(
            f"Raw bitmap bytes size mismatch: expected {expected_bytes} bytes "
            f"({width_px}x{height_px} px), but received {len(raw_bytes)} bytes."
        )

    frames = []

    # 1. Clear / Reset buffer
    frames.append(STX + b"C" + ETX)

    # 2. Enter Layout Mode
    frames.append(STX + b"L" + ETX)

    # 3. Enter Define Mode
    frames.append(STX + b"D" + ETX)

    # 4. Define Graphic Field 1
    field_def = (
        f"G1;o{x},{y};w{width_px};h{height_px};d{data_mode};"
    ).encode("ascii")
    frames.append(STX + field_def + ETX)

    # 5. Load full continuous bitmap hex data in ONE single frame
    hex_stream = raw_bytes.hex().upper().encode("ascii")
    frames.append(STX + b"u" + hex_stream + ETX)

    # 6. End of Definition Mode
    frames.append(STX + b"R" + ETX)

    # 7. Select Form 1 & Execute Print (support multiple copies if requested)
    for _ in range(max(1, copies)):
        frames.append(STX + b"E1;F1;" + ETX)

    # Pure byte stream -- frames concatenated with NO separator (no \r\n / \n)
    return b"".join(frames)


