"""Immutable semantic admission result; no resolved values or rendering."""
from dataclasses import dataclass

@dataclass(frozen=True)
class TextLayout:
    width: float
    height: float
    advance_width: tuple[float, float]
    advance_height: tuple[float, float]
    origin_x: float
    origin_y: float
    char_spacing: float

@dataclass(frozen=True)
class BindingSpec:
    element_index: int
    kind: str
    field: str | None
    template: str | None
    required_keys: tuple[str, ...]
    options: tuple[tuple[str, str | int | float | bool], ...]
    layout: TextLayout | None = None

@dataclass(frozen=True)
class TemplateManifest:
    binding_version: int
    svg_sha256: str
    width_mm: float
    height_mm: float
    view_box: tuple[float, float, float, float]
    required_keys: tuple[str, ...]
    objects: tuple[BindingSpec, ...]
    node_count: int

class TemplateAdmissionError(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__('Template admission failed.')
