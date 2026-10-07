"""Native Intermec Printer Language (IPL) direct-graphics encoder.

This encoder deliberately uses IPL Direct Graphics Mode instead of persistent
UDCs or formats. Direct Graphics sends one bitmap into the printer's image
memory for the current label only, so a job cannot accidentally select a
graphic or format left behind by a previous job.

The transport follows the IPL Command Reference's Direct Graphics sequence:
``ESC g 0`` enters eight-bit Direct Graphics Mode, ``0x21`` changes the
origin, ``0x27`` starts raw bitmap data for a column, ``0x22`` advances to the
next column, and ``0x28`` ends the bitmap and restores normal IPL parsing.
"""

from __future__ import annotations

STX = b"\x02"
ETX = b"\x03"
ETB = b"\x17"
ESC = b"\x1b"
RS = b"\x1e"

DIRECT_GRAPHICS_ENTER = ESC + b"g0"
DIRECT_GRAPHICS_ORIGIN = b"\x21"
DIRECT_GRAPHICS_END_LINE = b"\x22"
DIRECT_GRAPHICS_RAW_BITMAP = b"\x27"
DIRECT_GRAPHICS_END_BITMAP = b"\x28"


def _frame(command: bytes) -> bytes:
    return STX + command + ETX


def _direct_graphics_origin(x: int, y: int) -> bytes:
    """Encode IPL's direct-graphics ``0x21[x,y]`` coordinate form.

    IPL Direct Graphics has a seven-bit X origin and a thirteen-bit Y origin.
    All encoded coordinate bytes carry their required marker bit(s): the X and
    Y low bytes use bit 7, while the Y high byte uses bit 6. This is the form
    shown by the command reference's ``X0,Y450`` example: ``21 80 43 C2``.
    """
    if not 0 <= x <= 0x7F:
        raise ValueError("IPL Direct Graphics x origin must be between 0 and 127 dots.")
    if not 0 <= y <= 0x1FFF:
        raise ValueError("IPL Direct Graphics y origin must be between 0 and 8191 dots.")

    return bytes((DIRECT_GRAPHICS_ORIGIN[0], 0x80 | x, 0x40 | (y >> 7), 0x80 | (y & 0x7F)))


def _source_dot(raw_bytes: bytes, width_px: int, row: int, column: int) -> bool:
    """Return one MSB-first dot from the source's row-packed bitmap."""
    bytes_per_row = width_px // 8
    return bool(raw_bytes[row * bytes_per_row + column // 8] & (1 << (7 - column % 8)))


def _direct_graphics_columns(
    raw_bytes: bytes,
    width_px: int,
    height_px: int,
    magnification_x: int,
    magnification_y: int,
) -> list[bytes]:
    """Convert a row-packed bitmap into IPL Direct Graphics raw columns.

    Direct Graphics consumes columns left-to-right. A raw byte has bit 7 set as
    its data marker and carries seven vertical dots in bits 0..6. IPL loads
    every column from bottom to top, therefore source rows are read in reverse
    order here. Repeating source rows/columns implements the existing public
    magnification options without defining a persistent printer object.
    """
    output_height = height_px * magnification_y
    columns: list[bytes] = []

    for source_column in range(width_px):
        packed_column = bytearray()
        for output_row_start in range(0, output_height, 7):
            data_bits = 0
            for bit_offset in range(7):
                output_row = output_row_start + bit_offset
                if output_row >= output_height:
                    continue
                # Output rows are ordered from physical bottom to top, whereas
                # source rows are supplied from visual top to bottom.
                source_row = height_px - 1 - (output_row // magnification_y)
                if _source_dot(raw_bytes, width_px, source_row, source_column):
                    data_bits |= 1 << bit_offset
            packed_column.append(0x80 | data_bits)

        column_stream = DIRECT_GRAPHICS_RAW_BITMAP + bytes(packed_column) + DIRECT_GRAPHICS_END_LINE
        columns.extend([column_stream] * magnification_x)

    return columns


def encode_ipl(
    raw_bytes: bytes,
    width_px: int,
    height_px: int,
    x: int = 0,
    y: int = 0,
    copies: int = 1,
    magnification_x: int = 1,
    magnification_y: int = 1,
) -> bytes:
    """Encode a row-packed 1-bit bitmap as a stateless native IPL job.

    ``x`` and ``y`` use native Direct Graphics coordinates. IPL defines its
    direct-graphics origin at the label's lower-left corner, unlike the upper
    left origin used by standard IPL format fields. The bitmap starts at that
    origin and grows upward as its source rows are read.
    """
    if width_px <= 0 or height_px <= 0:
        raise ValueError("IPL graphic dimensions must be positive.")
    if width_px % 8 != 0:
        raise ValueError(
            f"IPL graphic width must be a multiple of 8 dots (got width_px={width_px}). "
            "Row-packed bitmap data requires byte-aligned rows."
        )
    if copies < 1:
        raise ValueError("IPL copies must be at least 1.")
    if magnification_x < 1 or magnification_y < 1:
        raise ValueError("IPL magnification values must be at least 1.")

    expected_bytes = (width_px // 8) * height_px
    if len(raw_bytes) != expected_bytes:
        raise ValueError(
            f"Raw bitmap bytes size mismatch: expected {expected_bytes} bytes "
            f"({width_px}x{height_px} px), but received {len(raw_bytes)} bytes."
        )

    # Validate source origin before assembling a potentially large payload.
    origin = _direct_graphics_origin(x, y)
    columns = _direct_graphics_columns(raw_bytes, width_px, height_px, magnification_x, magnification_y)

    # ``0x28`` exits direct-graphics parsing. The documented normal IPL print
    # lifecycle then sets quantity and sends ETB in separate STX/ETX messages.
    return b"".join(
        [
            DIRECT_GRAPHICS_ENTER,
            origin,
            *columns,
            DIRECT_GRAPHICS_END_BITMAP,
            _frame(RS + str(copies).encode("ascii")),
            _frame(ETB),
        ]
    )
