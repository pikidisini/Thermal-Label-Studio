"""Pure bitmap to readable IPL encoder."""
from io import BytesIO
import math
import re
from PIL import Image
from app.protocols.ipl.errors import IplError, _bounds, validate_copies

def encode_png(png: bytes, width: int, height: int, dpi: float, *, copies: int = 1) -> bytes:
    """Encode six-bit top-to-bottom columns, tiled within G's 799-dot limit.

    Reserves graphic slots 64..99 and format 90. Placement uses canvas x/y,
    direction 0 and unit scale. These axes still require physical validation.
    """
    _bounds(width, height, dpi)
    validate_copies(copies)
    if type(png) is not bytes or not 1 <= len(png) <= 1_048_576:
        raise IplError("Invalid processed PNG.")
    try:
        with Image.open(BytesIO(png), formats=("PNG",)) as image:
            metadata_dpi = image.info.get("dpi")
            if (not isinstance(metadata_dpi, tuple) or len(metadata_dpi) != 2
                    or any(type(value) not in (int, float) or not math.isfinite(value)
                           or abs(value - dpi) > .02 for value in metadata_dpi)):
                raise IplError("Invalid processed PNG DPI.")
            if (image.mode != "1" or image.size != (width, height)
                    or getattr(image, "n_frames", 1) != 1 or "transparency" in image.info):
                raise IplError("Invalid processed PNG.")
            image.load()
            pixels = image.copy()
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError):
        raise IplError("Invalid processed PNG.") from None
    blocks = ["<ESC>C", "<ESC>P;"]
    fields = []
    for y in range(0, height, 799):
        for x in range(0, width, 799):
            field = len(fields)
            graphic = 64 + field
            tw, th = min(799, width - x), min(799, height - y)
            blocks.append(f"G{graphic},TLS;x{tw};y{th};")
            for column in range(tw):
                groups = []
                for start in range(0, th, 6):
                    bits = sum(1 << bit for bit in range(min(6, th - start))
                               if pixels.getpixel((x + column, y + start + bit)) == 0)
                    groups.append("<DEL>" if bits == 63 else chr(64 | bits))
                blocks.append(f"u{column},{''.join(groups)};")
            fields.append(f"U{field},BITMAP;o{x},{y};f0;c{graphic};h1;w1;")
    blocks += ["R", "<ESC>P;", "E90;F90,TLS;", *fields, "R",
               "<ESC>E90<CAN>", f"<RS>{copies}", "<US>1", "<ETB>"]
    return ("\r\n".join(f"<STX>{block}<ETX>" for block in blocks) + "\r\n").encode("ascii")
