"""Pure readable IPL to simulation PNG decoder."""
from io import BytesIO
import math
import re
from PIL import Image
from app.protocols.ipl.errors import IplError, _bounds, validate_copies

def decode_png(payload: bytes, width: int, height: int, dpi: float) -> bytes:
    """Decode only complete Advanced Mode graphics/one format/one print command.

    The supported U subset is direction 0, nonnegative origins and scales1..10.
    Unsupported commands/directions, clipping, incomplete columns, nonwhite
    padding, unresolved references, duplicate IDs and multiple prints fail closed.
    Canvas size/DPI come from the validated media contract, not IPL media setup.
    """
    _bounds(width, height, dpi)
    if type(payload) is not bytes or not 1 <= len(payload) <= 8_000_000:
        raise IplError("Invalid IPL payload size.")
    if any(value not in (10, 13) and not 32 <= value <= 126 for value in payload):
        raise IplError("IPL must use readable ASCII tokens.")
    try:
        source = payload.decode("ascii")
    except UnicodeError:
        raise IplError("IPL must use readable ASCII tokens.") from None
    blocks = re.findall(r"<STX>(.*?)<ETX>", source)
    if re.sub(r"<STX>.*?<ETX>", "", source).strip("\r\n") or not blocks:
        raise IplError("Invalid IPL framing.")
    index = 0

    def take(expected):
        nonlocal index
        if index >= len(blocks) or blocks[index] != expected:
            raise IplError("Unsupported IPL command or sequence.")
        index += 1

    take("<ESC>C")
    take("<ESC>P;")
    graphics = {}
    total_pixels = 0
    while index < len(blocks) and blocks[index].startswith("G"):
        match = re.fullmatch(r"G(\d{1,2}),[A-Za-z][A-Za-z0-9_-]{0,7};x(\d{1,3});y(\d{1,3});", blocks[index])
        if not match:
            raise IplError("Malformed graphic definition.")
        gid, gw, gh = map(int, match.groups())
        total_pixels += gw * gh
        if not 1 <= gw <= 799 or not 1 <= gh <= 799 or gid in graphics or len(graphics) >= 36 or total_pixels > 4_000_000:
            raise IplError("Invalid or duplicate graphic dimensions/ID.")
        index += 1
        graphic = Image.new("1", (gw, gh), 255)
        for column in range(gw):
            if index >= len(blocks):
                raise IplError("Incomplete graphic columns.")
            prefix = f"u{column},"
            block = blocks[index]
            if not block.startswith(prefix) or not block.endswith(";"):
                raise IplError("Missing or unordered graphic column.")
            data = block[len(prefix):-1].replace("<DEL>", chr(127))
            if len(data) != (gh + 5) // 6 or any(not 64 <= ord(char) <= 127 for char in data):
                raise IplError("Invalid six-bit column data.")
            for group, char in enumerate(data):
                bits = ord(char) & 63
                for bit in range(6):
                    row = group * 6 + bit
                    if row >= gh:
                        if bits & (1 << bit):
                            raise IplError("Nonwhite graphic padding.")
                    elif bits & (1 << bit):
                        graphic.putpixel((column, row), 0)
            index += 1
        graphics[gid] = graphic
    if not graphics:
        raise IplError("Missing graphic.")
    take("R")
    take("<ESC>P;")
    if index >= len(blocks):
        raise IplError("Missing format.")
    match = re.fullmatch(r"E(\d{1,2});F\1,[A-Za-z][A-Za-z0-9_-]{0,7};", blocks[index])
    if not match:
        raise IplError("Invalid format definition.")
    format_id = int(match.group(1))
    if not 1 <= format_id <= 99:
        raise IplError("Invalid format ID.")
    index += 1
    canvas = Image.new("1", (width, height), 255)
    fields = set()
    used = set()
    while index < len(blocks) and blocks[index].startswith("U"):
        match = re.fullmatch(r"U(\d{1,2}),[A-Za-z][A-Za-z0-9_-]{0,7};o(\d{1,4}),(\d{1,4});f0;c(\d{1,2});h(\d{1,2});w(\d{1,2});", blocks[index])
        if not match:
            raise IplError("Unsupported graphic field/direction.")
        fid, x, y, gid, sy, sx = map(int, match.groups())
        if fid in fields or len(fields) >= 36 or gid not in graphics or not 1 <= sx <= 10 or not 1 <= sy <= 10:
            raise IplError("Invalid field reference, ID or scale.")
        graphic = graphics[gid]
        size = (graphic.width * sx, graphic.height * sy)
        if x + size[0] > width or y + size[1] > height:
            raise IplError("Graphic field exceeds media canvas.")
        graphic = graphic.resize(size, Image.Resampling.NEAREST)
        # Graphic white dots do not erase an earlier black field.
        canvas.paste(0, (x, y, x + size[0], y + size[1]), graphic.point(lambda p: 255 - p))
        fields.add(fid)
        used.add(gid)
        index += 1
    if not fields or used != set(graphics):
        raise IplError("Missing fields or unreferenced graphics.")
    take("R")
    take(f"<ESC>E{format_id}<CAN>")
    if index >= len(blocks):
        raise IplError("Missing print quantity.")
    quantity = re.fullmatch(r"<RS>([1-9]\d{0,2})", blocks[index])
    if not quantity:
        raise IplError("Unsupported print quantity.")
    validate_copies(int(quantity.group(1)))
    index += 1
    # Quantity repeats the same label on the device; simulation captures its
    # one logical canvas without duplicating or expanding bitmap memory.
    take("<US>1")
    take("<ETB>")
    if index != len(blocks):
        raise IplError("Unexpected commands after print.")
    output = BytesIO()
    canvas.save(output, format="PNG", dpi=(dpi, dpi))
    return output.getvalue()
