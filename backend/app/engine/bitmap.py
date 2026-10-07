"""Immutable processed bitmap shared by rendering and output boundaries."""

from dataclasses import dataclass


@dataclass(frozen=True)
class RenderedLabel:
    label_code: str
    layout_version: str
    width_px: int
    height_px: int
    dpi: float
    bitmap_png: bytes
