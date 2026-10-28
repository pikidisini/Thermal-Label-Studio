"""Pure readable IPL to simulation PNG decoder."""
from io import BytesIO
import re
from PIL import Image
from app.protocols.ipl.errors import IplError, _bounds, validate_copies


def _payload_blocks(payload):
    if type(payload) is not bytes or not 1 <= len(payload) <= 8_000_000:
        raise IplError('Invalid IPL payload size.')
    if any(value not in (10, 13) and not 32 <= value <= 126 for value in payload):
        raise IplError('IPL must use readable ASCII tokens.')
    try:
        source = payload.decode('ascii')
    except UnicodeError:
        raise IplError('IPL must use readable ASCII tokens.') from None
    blocks = re.findall(r'<STX>(.*?)<ETX>', source)
    if re.sub(r'<STX>.*?<ETX>', '', source).strip('\r\n') or not blocks:
        raise IplError('Invalid IPL framing.')
    return blocks


class _Blocks:
    def __init__(self, blocks):
        self.blocks, self.index = blocks, 0

    def starts_with(self, prefix):
        return self.index < len(self.blocks) and self.blocks[self.index].startswith(prefix)

    def take(self, expected):
        if self.index >= len(self.blocks) or self.blocks[self.index] != expected:
            raise IplError('Unsupported IPL command or sequence.')
        self.index += 1


def _paint_group(graphic, column, group, char):
    bits = ord(char) & 63
    for bit in range(6):
        row = group * 6 + bit
        if row >= graphic.height:
            if bits & (1 << bit):
                raise IplError('Nonwhite graphic padding.')
        elif bits & (1 << bit):
            graphic.putpixel((column, row), 0)


def _graphic_columns(reader, graphic):
    for column in range(graphic.width):
        if reader.index >= len(reader.blocks):
            raise IplError('Incomplete graphic columns.')
        prefix = f'u{column},'
        block = reader.blocks[reader.index]
        if not block.startswith(prefix) or not block.endswith(';'):
            raise IplError('Missing or unordered graphic column.')
        data = block[len(prefix):-1].replace('<DEL>', chr(127))
        if len(data) != (graphic.height + 5) // 6 or any(not 64 <= ord(char) <= 127 for char in data):
            raise IplError('Invalid six-bit column data.')
        for group, char in enumerate(data):
            _paint_group(graphic, column, group, char)
        reader.index += 1


def _graphic(reader, graphics, total_pixels):
    match = re.fullmatch(r'G(\d{1,2}),[A-Za-z][A-Za-z0-9_-]{0,7};x(\d{1,3});y(\d{1,3});', reader.blocks[reader.index])
    if not match:
        raise IplError('Malformed graphic definition.')
    gid, width, height = map(int, match.groups())
    total_pixels += width * height
    if not 1 <= width <= 799 or not 1 <= height <= 799 or gid in graphics or len(graphics) >= 36 or total_pixels > 4_000_000:
        raise IplError('Invalid or duplicate graphic dimensions/ID.')
    reader.index += 1
    graphic = Image.new('1', (width, height), 255)
    _graphic_columns(reader, graphic)
    graphics[gid] = graphic
    return total_pixels


def _graphics(reader):
    graphics = {}
    total_pixels = 0
    while reader.starts_with('G'):
        total_pixels = _graphic(reader, graphics, total_pixels)
    if not graphics:
        raise IplError('Missing graphic.')
    return graphics


def _format(reader):
    if reader.index >= len(reader.blocks):
        raise IplError('Missing format.')
    match = re.fullmatch(r'E(\d{1,2});F\1,[A-Za-z][A-Za-z0-9_-]{0,7};', reader.blocks[reader.index])
    if not match:
        raise IplError('Invalid format definition.')
    format_id = int(match.group(1))
    if not 1 <= format_id <= 99:
        raise IplError('Invalid format ID.')
    reader.index += 1
    return format_id


def _field(reader, graphics, canvas, fields, used):
    match = re.fullmatch(r'U(\d{1,2}),[A-Za-z][A-Za-z0-9_-]{0,7};o(\d{1,4}),(\d{1,4});f0;c(\d{1,2});h(\d{1,2});w(\d{1,2});', reader.blocks[reader.index])
    if not match:
        raise IplError('Unsupported graphic field/direction.')
    fid, x, y, gid, sy, sx = map(int, match.groups())
    if fid in fields or len(fields) >= 36 or gid not in graphics or not 1 <= sx <= 10 or not 1 <= sy <= 10:
        raise IplError('Invalid field reference, ID or scale.')
    graphic = graphics[gid]
    size = (graphic.width * sx, graphic.height * sy)
    if x + size[0] > canvas.width or y + size[1] > canvas.height:
        raise IplError('Graphic field exceeds media canvas.')
    graphic = graphic.resize(size, Image.Resampling.NEAREST)
    # White dots must not erase black dots submitted by an earlier field.
    canvas.paste(0, (x, y, x + size[0], y + size[1]), graphic.point(lambda pixel: 255 - pixel))
    fields.add(fid)
    used.add(gid)
    reader.index += 1


def _fields(reader, graphics, width, height):
    canvas = Image.new('1', (width, height), 255)
    fields, used = set(), set()
    while reader.starts_with('U'):
        _field(reader, graphics, canvas, fields, used)
    if not fields or used != set(graphics):
        raise IplError('Missing fields or unreferenced graphics.')
    return canvas


def _print_commands(reader, format_id):
    reader.take('R')
    reader.take(f'<ESC>E{format_id}<CAN>')
    if reader.index >= len(reader.blocks):
        raise IplError('Missing print quantity.')
    quantity = re.fullmatch(r'<RS>([1-9]\d{0,2})', reader.blocks[reader.index])
    if not quantity:
        raise IplError('Unsupported print quantity.')
    validate_copies(int(quantity.group(1)))
    reader.index += 1
    reader.take('<US>1')
    reader.take('<ETB>')
    if reader.index != len(reader.blocks):
        raise IplError('Unexpected commands after print.')


def decode_png(payload: bytes, width: int, height: int, dpi: float) -> bytes:
    """Decode complete Advanced Mode graphics/one format/one print command.

    Direction 0, nonnegative origins and scales 1..10 are supported. Unknown
    commands, clipping, padding, duplicate/unresolved IDs and extra prints fail
    closed. Quantity repeats the physical label; simulation retains one canvas.
    """
    _bounds(width, height, dpi)
    reader = _Blocks(_payload_blocks(payload))
    reader.take('<ESC>C')
    reader.take('<ESC>P;')
    graphics = _graphics(reader)
    reader.take('R')
    reader.take('<ESC>P;')
    format_id = _format(reader)
    canvas = _fields(reader, graphics, width, height)
    _print_commands(reader, format_id)
    output = BytesIO()
    canvas.save(output, format='PNG', dpi=(dpi, dpi))
    return output.getvalue()
