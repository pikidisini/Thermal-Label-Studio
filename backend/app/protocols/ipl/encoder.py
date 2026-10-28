"""Pure bitmap to readable IPL encoder."""
from io import BytesIO
import math
from PIL import Image
from app.protocols.ipl.errors import IplError, _bounds, validate_copies

INVALID_PNG = 'Invalid processed PNG.'


def _processed_pixels(png, width, height, dpi):
    try:
        with Image.open(BytesIO(png), formats=('PNG',)) as image:
            metadata_dpi = image.info.get('dpi')
            if (not isinstance(metadata_dpi, tuple) or len(metadata_dpi) != 2
                    or any(type(value) not in (int, float) or not math.isfinite(value)
                           or abs(value - dpi) > .02 for value in metadata_dpi)):
                raise IplError('Invalid processed PNG DPI.')
            if (image.mode != '1' or image.size != (width, height)
                    or getattr(image, 'n_frames', 1) != 1 or 'transparency' in image.info):
                raise IplError(INVALID_PNG)
            image.load()
            return image.copy()
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError):
        raise IplError(INVALID_PNG) from None


def _column(pixels, x, y, column, height):
    groups = []
    for start in range(0, height, 6):
        bits = sum(1 << bit for bit in range(min(6, height - start))
                   if pixels.getpixel((x + column, y + start + bit)) == 0)
        groups.append('<DEL>' if bits == 63 else chr(64 | bits))
    return ''.join(groups)


def _append_tile(blocks, fields, pixels, x, y, width, height):
    field = len(fields)
    graphic = 64 + field
    blocks.append(f'G{graphic},TLS;x{width};y{height};')
    for column in range(width):
        blocks.append(f'u{column},{_column(pixels, x, y, column, height)};')
    fields.append(f'U{field},BITMAP;o{x},{y};f0;c{graphic};h1;w1;')


def encode_png(png: bytes, width: int, height: int, dpi: float, *, copies: int = 1) -> bytes:
    """Encode six-bit top-to-bottom columns, tiled within G's 799-dot limit.

    Reserves graphic slots 64..99 and format 90. Placement uses canvas x/y,
    direction 0 and unit scale. These axes still require physical validation.
    """
    _bounds(width, height, dpi)
    validate_copies(copies)
    if type(png) is not bytes or not 1 <= len(png) <= 1_048_576:
        raise IplError(INVALID_PNG)
    pixels = _processed_pixels(png, width, height, dpi)
    blocks = ['<ESC>C', '<ESC>P;']
    fields = []
    for y in range(0, height, 799):
        for x in range(0, width, 799):
            _append_tile(blocks, fields, pixels, x, y, min(799, width - x), min(799, height - y))
    blocks += ['R', '<ESC>P;', 'E90;F90,TLS;', *fields, 'R',
               '<ESC>E90<CAN>', f'<RS>{copies}', '<US>1', '<ETB>']
    return ('\r\n'.join(f'<STX>{block}<ETX>' for block in blocks) + '\r\n').encode('ascii')
