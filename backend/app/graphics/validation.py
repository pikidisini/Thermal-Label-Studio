"""Bound untrusted library images before persistence or decoded pixel allocation."""
import base64
import io
import re
from PIL import Image


INVALID_GRAPHIC = 'Invalid graphic.'

MAX_BODY_BYTES = 512 * 1024
MAX_FILE_BYTES = 393_000
FORMATS = {'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WEBP'}


def validate_graphic(value):
    if not isinstance(value, dict) or set(value) != {'name', 'data_uri'}:
        raise ValueError(INVALID_GRAPHIC)
    name, uri = value['name'], value['data_uri']
    if (not isinstance(name, str) or not 1 <= len(name.strip()) <= 160
            or any(ord(char) < 32 for char in name) or not isinstance(uri, str)):
        raise ValueError(INVALID_GRAPHIC)
    match = re.fullmatch(r'data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)', uri)
    if not match or len(uri) >= MAX_BODY_BYTES:
        raise ValueError(INVALID_GRAPHIC)
    mime = match[1]
    name.encode('utf-8', errors='strict')
    data = base64.b64decode(match[2], validate=True)
    if not data or len(data) > MAX_FILE_BYTES:
        raise ValueError(INVALID_GRAPHIC)
    try:
        with Image.open(io.BytesIO(data)) as image:
            width, height = image.size
            if (image.format != FORMATS[mime] or not 1 <= width <= 4096
                    or not 1 <= height <= 4096 or width * height > 4_000_000
                    or getattr(image, 'n_frames', 1) != 1):
                raise ValueError(INVALID_GRAPHIC)
            image.verify()
        with Image.open(io.BytesIO(data)) as image:
            image.load()
    except (OSError, SyntaxError, Image.DecompressionBombError) as exc:
        raise ValueError(INVALID_GRAPHIC) from exc
    return name.strip(), mime, data, width, height
