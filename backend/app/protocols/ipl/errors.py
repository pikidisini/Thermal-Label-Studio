"""IPL input admission."""
import math

class IplError(ValueError):
    """Unsupported or malformed payload/bitmap."""

def _bounds(width, height, dpi):
    if (type(width) is not int or type(height) is not int
            or not 1 <= width <= 4096 or not 1 <= height <= 4096
            or width * height > 4_000_000 or type(dpi) not in (int, float)
            or not math.isfinite(dpi) or not 72 <= dpi <= 600):
        raise IplError("Invalid IPL canvas dimensions or DPI.")




def validate_copies(copies: int) -> None:
    if type(copies) is not int or not 1 <= copies <= 999:
        raise IplError("IPL copies must be an integer from 1 to 999.")
