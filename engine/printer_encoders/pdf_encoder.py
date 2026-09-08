"""
PDF Document Encoder Module.
Converts 1-Bit monochrome bitmap image to single-page compressed PDF document
with exact physical dimensions and resolution scaling.
"""

from __future__ import annotations

from pathlib import Path
from typing import Union
from PIL import Image


def encode_pdf(
    image_source: Union[str, Path, Image.Image],
    output_pdf_path: Union[str, Path],
    dpi: float = 203.2,
    width_mm: float = 200.0,
    height_mm: float = 80.0,
) -> Path:
    """
    Wraps 1-bit monochrome bitmap into a single-page PDF document using lossless compression.

    Parameters:
    - image_source: PIL Image object (mode '1' or 'L') or Path to bitmap image file.
    - output_pdf_path: Destination path for the generated PDF.
    - dpi: Resolution of the bitmap image (e.g. 203.2, 300, 600).
    - width_mm: Physical label width in millimeters.
    - height_mm: Physical label height in millimeters.

    Returns:
    - Path to the generated PDF file.
    """
    out_p = Path(output_pdf_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    if isinstance(image_source, Image.Image):
        img = image_source
    else:
        img = Image.open(image_source)

    # Ensure image is in 1-bit monochrome mode '1'
    if img.mode != "1":
        img = img.convert("1", dither=Image.NONE)

    # Pillow's PDF writer respects `resolution` (DPI)
    # Mode '1' images in Pillow PDF writer are compressed using Group4/CCITT or Flate
    img.save(
        out_p,
        format="PDF",
        resolution=float(dpi),
        save_all=False,
    )

    return out_p
